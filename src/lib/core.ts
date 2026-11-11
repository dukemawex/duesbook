// Pure helpers shared by the browser app and the serverless API. No I/O here.

export const LUNA_PER_NIM = 100_000
export const TAG_PREFIX = 'DB1'

export type Cadence = 'monthly' | 'weekly' | 'once'
export type Network = 'mainnet' | 'testnet'

export interface Member { id: number; name: string }
export interface Group {
  id: string
  name: string
  payee: string // Nimiq user-friendly address of the treasurer
  amountLuna: number // dues per period, in Luna
  cadence: Cadence
  start: string // first period key, e.g. 2026-11 / 2026-W46 / once
  members: Member[]
  network: Network
  note?: string
  createdAt: number
  updatedAt: number
}

// ---------- Nimiq addresses (IBAN-style, custom base32 alphabet) ----------
const NIM_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'

function ibanCheck(str: string): number {
  const num = str
    .toUpperCase()
    .split('')
    .map((c) => {
      const code = c.charCodeAt(0)
      return code >= 48 && code <= 57 ? c : (code - 55).toString()
    })
    .join('')
  let tmp = ''
  for (let i = 0; i < Math.ceil(num.length / 6); i++) {
    tmp = (parseInt(tmp + num.substr(i * 6, 6), 10) % 97).toString()
  }
  return parseInt(tmp, 10)
}

export function normalizeAddress(input: string): string {
  const raw = input.replace(/\s+/g, '').toUpperCase()
  return raw.replace(/(.{4})/g, '$1 ').trim()
}

export function isValidAddress(input: string): boolean {
  if (typeof input !== 'string') return false
  const raw = input.replace(/\s+/g, '').toUpperCase()
  if (!/^NQ[0-9]{2}[0-9A-Z]{32}$/.test(raw)) return false
  for (const c of raw.slice(4)) if (!NIM_ALPHABET.includes(c)) return false
  return ibanCheck(raw.slice(4) + raw.slice(0, 4)) === 1
}

// ---------- amounts ----------
export function nimToLuna(nim: number): number {
  return Math.round(nim * LUNA_PER_NIM)
}
export function lunaToNim(luna: number): number {
  return luna / LUNA_PER_NIM
}
export function fmtNim(luna: number): string {
  const nim = lunaToNim(luna)
  return nim.toLocaleString('en-US', { maximumFractionDigits: 5 }) + ' NIM'
}

// ---------- periods ----------
function pad(n: number) {
  return n < 10 ? '0' + n : String(n)
}

export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: t.getUTCFullYear(), week }
}

export function periodKey(cadence: Cadence, d: Date): string {
  if (cadence === 'once') return 'once'
  if (cadence === 'monthly') return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
  const { year, week } = isoWeek(d)
  return `${year}-W${pad(week)}`
}

export function isValidPeriod(cadence: Cadence, p: string): boolean {
  if (cadence === 'once') return p === 'once'
  if (cadence === 'monthly') return /^\d{4}-(0[1-9]|1[0-2])$/.test(p)
  return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(p)
}

function mondayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const day = jan4.getUTCDay() || 7
  const mon = new Date(jan4)
  mon.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7)
  return mon
}

/** All periods from `start` up to and including the period containing `now` (max 104). */
export function periodsUntil(cadence: Cadence, start: string, now: Date): string[] {
  if (cadence === 'once') return ['once']
  const out: string[] = []
  const nowKey = periodKey(cadence, now)
  if (cadence === 'monthly') {
    let [y, m] = start.split('-').map(Number)
    for (let i = 0; i < 104; i++) {
      const k = `${y}-${pad(m)}`
      out.push(k)
      if (k >= nowKey) break
      m++
      if (m > 12) { m = 1; y++ }
    }
    return out
  }
  const [ys, ws] = start.split('-W').map(Number)
  let d = mondayOfIsoWeek(ys, ws)
  for (let i = 0; i < 104; i++) {
    const k = periodKey('weekly', d)
    out.push(k)
    if (k >= nowKey) break
    d = new Date(d.getTime() + 7 * 86400000)
  }
  return out
}

export function periodLabel(cadence: Cadence, p: string): string {
  if (cadence === 'once') return 'One-off'
  if (cadence === 'monthly') {
    const [y, m] = p.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const [y, w] = p.split('-W').map(Number)
  const mon = mondayOfIsoWeek(y, w)
  return 'Week of ' + mon.toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

// ---------- on-chain tag ----------
// Attached to each payment as transaction data (public, max 64 bytes):  DB1:<groupId>:<period>:<memberId>
export function encodeTag(groupId: string, period: string, memberId: number): string {
  const tag = `${TAG_PREFIX}:${groupId}:${period}:${memberId}`
  if (new TextEncoder().encode(tag).length > 64) throw new Error('Tag too long')
  return tag
}

export interface ParsedTag { groupId: string; period: string; memberId: number }
export function decodeTag(text: string): ParsedTag | null {
  const m = /^DB1:([a-z0-9]{8}):(once|\d{4}-\d{2}|\d{4}-W\d{2}):(\d{1,4})$/.exec(text.trim())
  if (!m) return null
  return { groupId: m[1], period: m[2], memberId: Number(m[3]) }
}

export function hexToUtf8(hex: string): string {
  if (!hex || hex.length % 2) return ''
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return ''
  }
}

// ---------- ledger ----------
export interface ChainTx {
  hash: string
  from: string
  to: string
  value: number
  recipientData?: string
  senderData?: string
  timestamp: number
  blockNumber: number
  confirmations?: number
  executionResult?: boolean
}

export interface Payment {
  hash: string
  from: string
  valueLuna: number
  period: string
  memberId: number
  timestamp: number
  blockNumber: number
}

export type Status = 'paid' | 'partial' | 'unpaid'
export interface Cell { status: Status; paidLuna: number; payments: Payment[] }

export function extractPayments(group: Group, txs: ChainTx[]): Payment[] {
  const payee = group.payee.replace(/\s+/g, '')
  const seen = new Set<string>()
  const out: Payment[] = []
  for (const tx of txs) {
    if (seen.has(tx.hash)) continue
    seen.add(tx.hash)
    if (tx.executionResult === false) continue
    if ((tx.to || '').replace(/\s+/g, '') !== payee) continue
    const tag = decodeTag(hexToUtf8(tx.recipientData || ''))
    if (!tag || tag.groupId !== group.id) continue
    if (!isValidPeriod(group.cadence, tag.period)) continue
    if (!group.members.some((m) => m.id === tag.memberId)) continue
    out.push({
      hash: tx.hash,
      from: tx.from,
      valueLuna: tx.value,
      period: tag.period,
      memberId: tag.memberId,
      timestamp: tx.timestamp,
      blockNumber: tx.blockNumber,
    })
  }
  return out.sort((a, b) => b.timestamp - a.timestamp)
}

export function buildLedger(group: Group, payments: Payment[]): Map<string, Cell> {
  const map = new Map<string, Cell>()
  for (const p of payments) {
    const key = `${p.memberId}|${p.period}`
    const cell = map.get(key) || { status: 'unpaid' as Status, paidLuna: 0, payments: [] }
    cell.paidLuna += p.valueLuna
    cell.payments.push(p)
    map.set(key, cell)
  }
  for (const cell of map.values()) {
    cell.status = cell.paidLuna >= group.amountLuna ? 'paid' : cell.paidLuna > 0 ? 'partial' : 'unpaid'
  }
  return map
}

export function cellFor(ledger: Map<string, Cell>, memberId: number, period: string): Cell {
  return ledger.get(`${memberId}|${period}`) || { status: 'unpaid', paidLuna: 0, payments: [] }
}

export function periodSummary(group: Group, ledger: Map<string, Cell>, period: string) {
  let paid = 0, partial = 0, collected = 0
  for (const m of group.members) {
    const c = cellFor(ledger, m.id, period)
    if (c.status === 'paid') paid++
    else if (c.status === 'partial') partial++
    collected += c.paidLuna
  }
  const expected = group.amountLuna * group.members.length
  return { paid, partial, unpaid: group.members.length - paid - partial, collected, expected }
}

export function ledgerCsv(group: Group, payments: Payment[]): string {
  const name = (id: number) => group.members.find((m) => m.id === id)?.name ?? `#${id}`
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const rows = [['date_utc', 'period', 'member', 'amount_nim', 'from_address', 'tx_hash', 'block']]
  for (const p of payments) {
    rows.push([
      new Date(p.timestamp).toISOString(),
      p.period,
      name(p.memberId),
      String(lunaToNim(p.valueLuna)),
      p.from,
      p.hash,
      String(p.blockNumber),
    ])
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n'
}

// ---------- validation of a group draft (used by API) ----------
export interface GroupDraft {
  name: string
  payee: string
  amountLuna: number
  cadence: Cadence
  start: string
  members: string[] | Member[]
  network: Network
  note?: string
}

export function validateDraft(d: any): string | null {
  if (!d || typeof d !== 'object') return 'Missing body'
  if (typeof d.name !== 'string' || !d.name.trim() || d.name.trim().length > 60) return 'Group name must be 1–60 characters'
  if (!isValidAddress(d.payee)) return 'Treasurer address is not a valid Nimiq address'
  if (!Number.isInteger(d.amountLuna) || d.amountLuna < 1 || d.amountLuna > 1e15) return 'Amount must be a positive NIM amount'
  if (!['monthly', 'weekly', 'once'].includes(d.cadence)) return 'Cadence must be monthly, weekly or once'
  if (!isValidPeriod(d.cadence, d.start)) return 'Start period is invalid'
  if (!['mainnet', 'testnet'].includes(d.network)) return 'Network must be mainnet or testnet'
  if (!Array.isArray(d.members) || d.members.length < 1 || d.members.length > 300) return 'Add between 1 and 300 members'
  for (const m of d.members) {
    const n = typeof m === 'string' ? m : m?.name
    if (typeof n !== 'string' || !n.trim() || n.trim().length > 40) return 'Each member name must be 1–40 characters'
  }
  if (d.note != null && (typeof d.note !== 'string' || d.note.length > 280)) return 'Note must be at most 280 characters'
  return null
}
