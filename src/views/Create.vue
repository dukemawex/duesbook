<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { isValidAddress, normalizeAddress, nimToLuna, periodKey, type Cadence, type Network } from '../lib/core'
import { provider, hostNetwork, inNimiqPay, explainError } from '../lib/wallet'
import { nimPrices, fmtFiat } from '../lib/price'
import { createGroup } from '../lib/api'
import { rememberGroup } from '../lib/local'

const name = ref('')
const payee = ref('')
const amountNim = ref<number | null>(null)
const amountNgn = ref<number | null>(null)
const cadence = ref<Cadence>('monthly')
const membersText = ref('')
const note = ref('')
const network = ref<Network>(hostNetwork() ?? 'mainnet')
const hostNet = hostNetwork()
const ngnPerNim = ref<number | null>(null)
const busy = ref(false)
const err = ref('')
const walletMsg = ref('')

onMounted(async () => {
  const p = await nimPrices()
  if (p) ngnPerNim.value = p.ngn
})

const members = computed(() => membersText.value.split(/\n|,/).map((s) => s.trim()).filter(Boolean))
const start = computed(() => periodKey(cadence.value, new Date()))
const ngnEquivalent = computed(() => (amountNim.value && ngnPerNim.value ? fmtFiat(amountNim.value * ngnPerNim.value, 'ngn') : ''))

function fromNgn() {
  if (amountNgn.value && ngnPerNim.value) amountNim.value = Math.ceil(amountNgn.value / ngnPerNim.value)
}

async function useMyAddress() {
  walletMsg.value = ''
  const nimiq = await provider()
  if (!nimiq) { walletMsg.value = 'Open DuesBook inside Nimiq Pay to fill this in automatically, or paste your address.'; return }
  try {
    const accounts = await nimiq.listAccounts()
    if (accounts?.length) payee.value = normalizeAddress(accounts[0])
    else walletMsg.value = 'Nimiq Pay did not share an address.'
  } catch (e) {
    walletMsg.value = explainError(e)
  }
}

async function submit() {
  err.value = ''
  if (!name.value.trim()) return (err.value = 'Give the group a name.')
  if (!isValidAddress(payee.value)) return (err.value = 'That is not a valid Nimiq address. Check it, or tap "Use my Nimiq Pay address".')
  if (!amountNim.value || amountNim.value <= 0) return (err.value = 'Enter the dues amount in NIM.')
  if (!members.value.length) return (err.value = 'Add at least one member, one name per line.')
  if (members.value.length > 300) return (err.value = 'Up to 300 members per group.')
  busy.value = true
  try {
    const { group, adminToken } = await createGroup({
      name: name.value.trim(),
      payee: normalizeAddress(payee.value),
      amountLuna: nimToLuna(amountNim.value),
      cadence: cadence.value,
      start: start.value,
      members: members.value,
      network: network.value,
      note: note.value.trim() || undefined,
    })
    rememberGroup(group.id, group.name, { adminToken })
    location.hash = `#/g/${group.id}?created=1`
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="card">
    <h1>New dues group</h1>
    <p class="muted">You are the treasurer. Members pay straight to your address. DuesBook never holds funds.</p>
    <form @submit.prevent="submit" class="form">
      <label>Group name
        <input v-model="name" maxlength="60" placeholder="e.g. Unity Estate Residents, Phase 2" />
      </label>

      <label>Treasurer's Nimiq address (receives the dues)
        <input v-model="payee" placeholder="NQ.. .... .... ...." autocomplete="off" spellcheck="false" />
      </label>
      <div class="row">
        <button type="button" class="btn small ghost" @click="useMyAddress">Use my Nimiq Pay address</button>
        <span v-if="payee && !isValidAddress(payee)" class="error small">Address checksum does not match</span>
        <span v-else-if="payee" class="ok small">✓ Valid address</span>
      </div>
      <p v-if="walletMsg" class="hint">{{ walletMsg }}</p>

      <div class="grid2">
        <label>Dues per person (NIM)
          <input v-model.number="amountNim" type="number" min="0.00001" step="any" inputmode="decimal" placeholder="e.g. 15000" />
          <span v-if="ngnEquivalent" class="muted small">≈ {{ ngnEquivalent }} at today's rate</span>
        </label>
        <label>…or set it in Naira
          <input v-model.number="amountNgn" type="number" min="1" step="any" inputmode="decimal" placeholder="₦5,000" @input="fromNgn" :disabled="!ngnPerNim" />
          <span class="muted small">{{ ngnPerNim ? `1 NIM ≈ ${fmtFiat(ngnPerNim, 'ngn')} (CoinGecko)` : 'Live rate unavailable' }}</span>
        </label>
      </div>

      <label>How often?
        <select v-model="cadence">
          <option value="monthly">Monthly (from {{ periodKey('monthly', new Date()) }})</option>
          <option value="weekly">Weekly (from {{ periodKey('weekly', new Date()) }})</option>
          <option value="once">One-off levy</option>
        </select>
      </label>

      <label>Members, one per line ({{ members.length }})
        <textarea v-model="membersText" rows="6" placeholder="Mrs. Adebayo (Flat 1)&#10;Mr. Okafor (Flat 2)&#10;Chidi (Flat 3)"></textarea>
      </label>

      <label>Note to members (optional)
        <input v-model="note" maxlength="280" placeholder="e.g. Security + waste levy. Due by the 5th." />
      </label>

      <label v-if="!inNimiqPay()">Network
        <select v-model="network"><option value="mainnet">Mainnet (real NIM)</option><option value="testnet">Testnet (free test NIM)</option></select>
      </label>
      <p v-else class="hint">Network: <b>{{ hostNet ?? 'mainnet' }}</b>, taken from your Nimiq Pay.</p>

      <p class="hint small">Saved on DuesBook's server so the link works: the group name, the member names you type, the treasurer address and the amount. Payments are public on the Nimiq blockchain. Use first names or flat numbers if you prefer.</p>
      <p v-if="err" class="error">{{ err }}</p>
      <button class="btn block" :disabled="busy">{{ busy ? 'Creating…' : 'Create group' }}</button>
    </form>
  </section>
</template>
