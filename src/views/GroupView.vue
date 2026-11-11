<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import QRCode from 'qrcode'
import {
  type Group, type Payment, type Cell, extractPayments, buildLedger, cellFor, periodSummary, periodsUntil,
  periodLabel, periodKey, encodeTag, fmtNim, lunaToNim, ledgerCsv,
} from '../lib/core'
import { getGroup, updateGroup } from '../lib/api'
import { transactionsFor, transactionByHash, explorerTx } from '../lib/chain'
import { provider, hostNetwork, inNimiqPay, explainError } from '../lib/wallet'
import { nimPrices, fmtFiat } from '../lib/price'
import { rememberGroup, localGroup, forgetMember } from '../lib/local'

const props = defineProps<{ id: string }>()

const group = ref<Group | null>(null)
const loadErr = ref('')
const payments = ref<Payment[]>([])
const chainErr = ref('')
const chainLoading = ref(false)
const lastSync = ref<Date | null>(null)
const ngnPerNim = ref<number | null>(null)
const me = ref<number | undefined>(localGroup(props.id)?.memberId)
const adminToken = ref<string | undefined>(localGroup(props.id)?.adminToken)
const justCreated = location.hash.includes('created=1')
// Treasurer recovery link: #/g/<id>?admin=<token> restores edit rights on a new device.
const adminFromLink = /[?&]admin=([A-Za-z0-9_-]{20,})/.exec(location.hash)?.[1]
if (adminFromLink) {
  adminToken.value = adminFromLink
  history.replaceState(null, '', `#/g/${props.id}`)
}
const selected = ref('')
const openMember = ref<number | null>(null)
const copied = ref('')
const hostNet = hostNetwork()
const inPay = inNimiqPay()

// payment flow state
const payFor = ref<string | null>(null)
const payState = ref<'idle' | 'confirm' | 'sending' | 'pending' | 'done' | 'error'>('idle')
const payMsg = ref('')
const payHash = ref('')
const payBlock = ref<number | null>(null)
const payAmount = ref(0)
const myBalance = ref<number | null>(null)
const qr = ref('')

// edit state
const editing = ref(false)
const editName = ref('')
const editNote = ref('')
const editMembers = ref<{ id?: number; name: string }[]>([])
const newMember = ref('')
const editErr = ref('')

const periods = computed(() => (group.value ? periodsUntil(group.value.cadence, group.value.start, new Date()).slice().reverse() : []))
const ledger = computed(() => (group.value ? buildLedger(group.value, payments.value) : new Map<string, Cell>()))
const summary = computed(() => (group.value && selected.value ? periodSummary(group.value, ledger.value, selected.value) : null))
const meMember = computed(() => group.value?.members.find((m) => m.id === me.value))
const myOwed = computed(() => {
  if (!group.value || me.value == null) return []
  return periods.value
    .map((p) => ({ period: p, cell: cellFor(ledger.value, me.value!, p) }))
    .filter((x) => x.cell.status !== 'paid')
})
const netMismatch = computed(() => !!(group.value && hostNet && hostNet !== group.value.network))
const shareUrl = computed(() => `${location.origin}/#/g/${props.id}`)
const fiat = (luna: number) => (ngnPerNim.value ? fmtFiat(lunaToNim(luna) * ngnPerNim.value, 'ngn') : '')
const memberName = (id: number) => group.value?.members.find((m) => m.id === id)?.name ?? `#${id}`
const short = (a: string) => a.replace(/\s+/g, '').replace(/^(.{6}).*(.{4})$/, '$1…$2')

async function load() {
  loadErr.value = ''
  try {
    const { group: g } = await getGroup(props.id)
    group.value = g
    selected.value = periodKey(g.cadence, new Date())
    if (!periodsUntil(g.cadence, g.start, new Date()).includes(selected.value)) selected.value = g.start
    if (me.value != null && !g.members.some((m) => m.id === me.value)) { me.value = undefined; forgetMember(g.id) }
    rememberGroup(g.id, g.name, adminToken.value ? { adminToken: adminToken.value } : {})
    sync()
  } catch (e) {
    loadErr.value = e instanceof Error ? e.message : String(e)
  }
}

async function sync() {
  if (!group.value) return
  chainLoading.value = true
  chainErr.value = ''
  try {
    const txs = await transactionsFor(group.value.network, group.value.payee.replace(/\s+/g, ''))
    payments.value = extractPayments(group.value, txs)
    lastSync.value = new Date()
  } catch (e) {
    chainErr.value = e instanceof Error ? e.message : String(e)
  } finally {
    chainLoading.value = false
  }
}

onMounted(async () => {
  load()
  const p = await nimPrices()
  if (p) ngnPerNim.value = p.ngn
})

function pickMe(id: number) {
  me.value = id
  rememberGroup(props.id, group.value!.name, { memberId: id })
}
function notMe() {
  me.value = undefined
  forgetMember(props.id)
}

function owedFor(period: string) {
  const c = cellFor(ledger.value, me.value!, period)
  return Math.max(group.value!.amountLuna - c.paidLuna, 0)
}

async function startPay(period: string) {
  payFor.value = period
  payState.value = 'confirm'
  payMsg.value = ''
  payHash.value = ''
  payBlock.value = null
  myBalance.value = null
  qr.value = ''
  const g = group.value!
  const tag = encodeTag(g.id, period, me.value!)
  const nim = lunaToNim(owedFor(period))
  // Universal fallback for any Nimiq wallet: a nimiq: payment link with the tag as the message.
  const uri = `nimiq:${g.payee.replace(/\s+/g, '')}?amount=${nim}&message=${encodeURIComponent(tag)}`
  qr.value = await QRCode.toDataURL(uri, { margin: 1, width: 220 })
  const nimiq = await provider()
  if (nimiq && typeof nimiq.getBalance === 'function') {
    try {
      const [acct] = await nimiq.listAccounts()
      if (acct) myBalance.value = await nimiq.getBalance(acct)
    } catch { /* balance is optional */ }
  }
}

async function confirmPay() {
  const g = group.value!
  const period = payFor.value!
  payState.value = 'sending'
  payMsg.value = ''
  const nimiq = await provider()
  if (!nimiq) {
    payState.value = 'error'
    payMsg.value = 'Nimiq Pay was not detected. Scan the QR code with a Nimiq wallet, or open DuesBook inside Nimiq Pay → Mini Apps.'
    return
  }
  try {
    payAmount.value = owedFor(period)
    const hash = await nimiq.sendBasicTransactionWithData({
      recipient: g.payee.replace(/\s+/g, ''),
      value: payAmount.value,
      data: encodeTag(g.id, period, me.value!),
    })
    payHash.value = hash
    payState.value = 'pending'
    // Confirm on-chain instead of trusting the returned hash.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const tx = await transactionByHash(g.network, hash)
      if (tx && tx.blockNumber) {
        if (tx.executionResult === false) {
          payState.value = 'error'
          payMsg.value = 'The transaction was included but failed on-chain. No dues were recorded.'
          return
        }
        payBlock.value = tx.blockNumber
        payState.value = 'done'
        sync()
        return
      }
    }
    payMsg.value = 'Sent. It is taking longer than usual to appear on-chain. Check the register in a minute; do not pay again.'
  } catch (e) {
    payState.value = 'error'
    payMsg.value = explainError(e)
  }
}

function closePay() {
  payFor.value = null
  payState.value = 'idle'
}

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); copied.value = what } catch { copied.value = 'Copy failed. Long-press to copy.' }
  setTimeout(() => (copied.value = ''), 2000)
}
function shareWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}
async function shareInvite() {
  const g = group.value!
  const text = `${g.name}: dues are ${fmtNim(g.amountLuna)}${fiat(g.amountLuna) ? ` (≈${fiat(g.amountLuna)})` : ''} ${g.cadence === 'once' ? 'one-off' : g.cadence}. Pay in Nimiq Pay and the register updates itself: ${shareUrl.value}`
  if (navigator.share) {
    try { await navigator.share({ title: g.name, text, url: shareUrl.value }); return } catch { /* fall through */ }
  }
  shareWhatsApp(text)
}
function remindUnpaid() {
  const g = group.value!
  const owing = g.members.filter((m) => cellFor(ledger.value, m.id, selected.value).status !== 'paid').map((m) => `• ${m.name}`)
  const text = `${g.name}: ${periodLabel(g.cadence, selected.value)} dues reminder 🙏\nStill outstanding:\n${owing.join('\n')}\n\nPay ${fmtNim(g.amountLuna)} in Nimiq Pay: ${shareUrl.value}`
  shareWhatsApp(text)
}
function exportCsv() {
  const blob = new Blob([ledgerCsv(group.value!, payments.value)], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `duesbook-${props.id}.csv`
  a.click()
}

function startEdit() {
  const g = group.value!
  editName.value = g.name
  editNote.value = g.note || ''
  editMembers.value = g.members.map((m) => ({ ...m }))
  editErr.value = ''
  editing.value = true
}
function addMember() {
  const n = newMember.value.trim()
  if (n) editMembers.value.push({ name: n })
  newMember.value = ''
}
async function saveEdit() {
  editErr.value = ''
  try {
    const { group: g } = await updateGroup(props.id, adminToken.value!, {
      name: editName.value, note: editNote.value, members: editMembers.value.filter((m) => m.name.trim()),
    })
    group.value = g
    editing.value = false
  } catch (e) {
    editErr.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <p v-if="loadErr" class="card error">{{ loadErr }} <a href="#/">Go home</a></p>
  <p v-else-if="!group" class="card muted">Loading group…</p>
  <template v-else>
    <section class="card head">
      <div class="row between">
        <h1>{{ group.name }}</h1>
        <span class="badge" :class="group.network">{{ group.network }}</span>
      </div>
      <p class="big">{{ fmtNim(group.amountLuna) }} <span class="muted">/ {{ group.cadence === 'once' ? 'one-off' : group.cadence === 'monthly' ? 'month' : 'week' }}</span>
        <span v-if="fiat(group.amountLuna)" class="muted small"> ≈ {{ fiat(group.amountLuna) }} today</span></p>
      <p v-if="group.note" class="note">{{ group.note }}</p>
      <p class="muted small">Paid to treasurer <code>{{ group.payee }}</code> · Code <b>{{ group.id }}</b></p>
      <p v-if="netMismatch" class="error">This group uses <b>{{ group.network }}</b>, but your Nimiq Pay is on <b>{{ hostNet }}</b>. Switch networks in Nimiq Pay before paying.</p>
      <div v-if="justCreated && adminToken" class="callout">
        Your group is ready. Share the link with your members. This device is the treasurer device, so you can edit the member list from here.
      </div>
      <div class="row wrap-row">
        <button class="btn small" @click="shareInvite">Share invite</button>
        <button class="btn small ghost" @click="copy(shareUrl, 'Link copied')">Copy link</button>
        <button v-if="adminToken" class="btn small ghost" @click="startEdit">Edit group</button>
        <button v-if="adminToken" class="btn small ghost" @click="copy(`${shareUrl}?admin=${adminToken}`, 'Treasurer link copied. Keep it private.')">Treasurer recovery link</button>
        <span v-if="copied" class="ok small">{{ copied }}</span>
      </div>
    </section>

    <!-- Treasurer edit -->
    <section v-if="editing" class="card">
      <h2>Edit group</h2>
      <label>Name <input v-model="editName" maxlength="60" /></label>
      <label>Note <input v-model="editNote" maxlength="280" /></label>
      <p class="muted small">The amount, schedule, network and treasurer address are fixed so past records stay correct. Start a new group to change them.</p>
      <div v-for="(m, i) in editMembers" :key="i" class="row">
        <input v-model="m.name" maxlength="40" />
        <button class="btn small ghost" @click="editMembers.splice(i, 1)" :title="'Remove ' + m.name">✕</button>
      </div>
      <form class="row" @submit.prevent="addMember"><input v-model="newMember" placeholder="Add member" maxlength="40" /><button class="btn small ghost">Add</button></form>
      <p v-if="editErr" class="error">{{ editErr }}</p>
      <div class="row"><button class="btn" @click="saveEdit">Save</button><button class="btn ghost" @click="editing = false">Cancel</button></div>
    </section>

    <!-- Who am I -->
    <section v-if="me == null" class="card">
      <h2>Which member are you?</h2>
      <p class="muted small">We remember this on this device only, so you can pay and see your own record.</p>
      <div class="chips">
        <button v-for="m in group.members" :key="m.id" class="chip" @click="pickMe(m.id)">{{ m.name }}</button>
      </div>
    </section>

    <!-- My dues -->
    <section v-else class="card">
      <div class="row between">
        <h2>Hi {{ meMember?.name }}</h2>
        <button class="link small" @click="notMe">Not you?</button>
      </div>
      <p v-if="chainLoading && !lastSync" class="muted">Checking the blockchain…</p>
      <p v-else-if="!myOwed.length" class="ok">✓ You're fully paid up. Thank you!</p>
      <div v-else>
        <p class="muted small">{{ myOwed.length }} period{{ myOwed.length > 1 ? 's' : '' }} outstanding</p>
        <div v-for="o in myOwed" :key="o.period" class="list-row">
          <span>{{ periodLabel(group.cadence, o.period) }}
            <span v-if="o.cell.status === 'partial'" class="badge partial">part-paid {{ fmtNim(o.cell.paidLuna) }}</span></span>
          <button class="btn small" :disabled="netMismatch" @click="startPay(o.period)">Pay {{ fmtNim(owedFor(o.period)) }}</button>
        </div>
      </div>
    </section>

    <!-- Pay sheet -->
    <div v-if="payFor" class="sheet-backdrop" @click.self="payState !== 'sending' && closePay()">
      <div class="sheet" role="dialog" aria-modal="true">
        <h2>Pay {{ periodLabel(group.cadence, payFor) }} dues</h2>
        <template v-if="payState === 'confirm' || payState === 'sending'">
          <p class="big">{{ fmtNim(owedFor(payFor)) }} <span v-if="fiat(owedFor(payFor))" class="muted small">≈ {{ fiat(owedFor(payFor)) }}</span></p>
          <p class="small">To: <code>{{ group.payee }}</code></p>
          <p class="small">Tag (public, on-chain): <code>{{ encodeTag(group.id, payFor, me!) }}</code></p>
          <p v-if="myBalance != null" class="small" :class="myBalance < owedFor(payFor) ? 'error' : 'muted'">
            Your balance: {{ fmtNim(myBalance) }}<span v-if="myBalance < owedFor(payFor)">. Not enough. Top up in Nimiq Pay first.</span></p>
          <button v-if="inPay" class="btn block" :disabled="payState === 'sending'" @click="confirmPay">
            {{ payState === 'sending' ? 'Confirm in Nimiq Pay…' : 'Pay with Nimiq Pay' }}</button>
          <div v-else class="qr">
            <p class="small">Not in Nimiq Pay? Scan with any Nimiq wallet. The amount and tag are filled in for you.</p>
            <img v-if="qr" :src="qr" alt="Nimiq payment QR code" width="220" height="220" />
            <button class="btn small ghost" @click="confirmPay">Try Nimiq Pay anyway</button>
          </div>
        </template>
        <template v-else-if="payState === 'pending'">
          <p>Sent. Waiting for the Nimiq blockchain to confirm it (usually a few seconds)…</p>
          <p class="small">Tx <a :href="explorerTx(group.network, payHash)" target="_blank" rel="noopener"><code>{{ short(payHash) }}</code></a></p>
          <p v-if="payMsg" class="hint">{{ payMsg }}</p>
        </template>
        <template v-else-if="payState === 'done'">
          <p class="ok big">✓ Paid and confirmed</p>
          <p class="small">Block {{ payBlock }} · <a :href="explorerTx(group.network, payHash)" target="_blank" rel="noopener">view receipt on Nimiq Watch</a></p>
          <button class="btn small ghost" @click="shareWhatsApp(`I've paid my ${periodLabel(group.cadence, payFor)} dues for ${group.name} (${fmtNim(payAmount)}). Receipt: ${explorerTx(group.network, payHash)}`)">Share receipt on WhatsApp</button>
        </template>
        <p v-if="payState === 'error'" class="error">{{ payMsg }}</p>
        <button class="btn ghost block" :disabled="payState === 'sending'" @click="closePay">{{ payState === 'done' ? 'Done' : 'Close' }}</button>
      </div>
    </div>

    <!-- Register -->
    <section class="card">
      <div class="row between">
        <h2>Register</h2>
        <button class="link small" :disabled="chainLoading" @click="sync">{{ chainLoading ? 'Syncing…' : '↻ Refresh' }}</button>
      </div>
      <div v-if="periods.length > 1" class="chips scroll">
        <button v-for="p in periods" :key="p" class="chip" :class="{ on: p === selected }" @click="selected = p">{{ periodLabel(group.cadence, p) }}</button>
      </div>
      <div v-if="summary" class="summary">
        <div class="bar"><div :style="{ width: Math.min(100, (summary.collected / summary.expected) * 100) + '%' }"></div></div>
        <p><b>{{ fmtNim(summary.collected) }}</b> of {{ fmtNim(summary.expected) }} collected
          <span v-if="fiat(summary.collected)" class="muted small">(≈ {{ fiat(summary.collected) }})</span></p>
        <p class="small"><span class="ok">{{ summary.paid }} paid</span> · <span class="warn">{{ summary.partial }} part-paid</span> · <span class="error">{{ summary.unpaid }} unpaid</span></p>
      </div>
      <p v-if="chainErr" class="error">{{ chainErr }}</p>
      <p v-if="lastSync" class="muted small">Read from the Nimiq {{ group.network }} blockchain at {{ lastSync.toLocaleTimeString() }}.</p>

      <div v-for="m in group.members" :key="m.id">
        <button class="list-row full" @click="openMember = openMember === m.id ? null : m.id">
          <span>{{ m.name }} <span v-if="m.id === me" class="muted small">(you)</span></span>
          <span class="badge" :class="cellFor(ledger, m.id, selected).status">
            {{ cellFor(ledger, m.id, selected).status === 'paid' ? '✓ paid' : cellFor(ledger, m.id, selected).status === 'partial' ? 'part-paid' : 'unpaid' }}
          </span>
        </button>
        <div v-if="openMember === m.id" class="detail">
          <p v-if="!payments.filter((p) => p.memberId === m.id).length" class="muted small">No payments recorded yet.</p>
          <p v-for="p in payments.filter((p) => p.memberId === m.id)" :key="p.hash" class="small">
            {{ periodLabel(group.cadence, p.period) }}: {{ fmtNim(p.valueLuna) }} on {{ new Date(p.timestamp).toLocaleDateString() }}
            · <a :href="explorerTx(group.network, p.hash)" target="_blank" rel="noopener">{{ short(p.hash) }}</a>
          </p>
        </div>
      </div>

      <div class="row wrap-row">
        <button class="btn small ghost" :disabled="!summary || summary.paid === group.members.length" @click="remindUnpaid">Remind unpaid on WhatsApp</button>
        <button class="btn small ghost" :disabled="!payments.length" @click="exportCsv">Export CSV</button>
      </div>
    </section>

    <section class="card">
      <h2>Recent payments</h2>
      <p v-if="!payments.length" class="muted small">No tagged payments for this group yet.</p>
      <p v-for="p in payments.slice(0, 15)" :key="p.hash" class="small list-row">
        <span>{{ memberName(p.memberId) }} · {{ periodLabel(group.cadence, p.period) }}</span>
        <a :href="explorerTx(group.network, p.hash)" target="_blank" rel="noopener">{{ fmtNim(p.valueLuna) }}</a>
      </p>
    </section>
  </template>
</template>
