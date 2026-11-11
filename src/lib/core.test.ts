import { describe, it, expect } from 'vitest'
import * as c from './core'

const G: c.Group = {
  id: 'abcd2345', name: 'Unity Estate', payee: 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3',
  amountLuna: 500_000, cadence: 'monthly', start: '2026-09',
  members: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bayo' }, { id: 3, name: 'Chi' }],
  network: 'mainnet', createdAt: 0, updatedAt: 0,
}
const hex = (s: string) => Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, '0')).join('')

describe('addresses', () => {
  it('accepts real mainnet addresses from the chain', () => {
    expect(c.isValidAddress('NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3')).toBe(true)
    expect(c.isValidAddress('NQ74 Q81N 8FSD XRRS X3DQ VSLG XRSM LA66 Y77H')).toBe(true)
    expect(c.isValidAddress('NQ07 0000 0000 0000 0000 0000 0000 0000 0000')).toBe(true)
  })
  it('rejects typos', () => {
    expect(c.isValidAddress('NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB4')).toBe(false)
    expect(c.isValidAddress('NQ02 31N6')).toBe(false)
    expect(c.isValidAddress('hello')).toBe(false)
  })
  it('normalizes spacing', () => {
    expect(c.normalizeAddress('nq0231n63km5t6g522tnepf55xpyrlhkrmb3')).toBe('NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3')
  })
})

describe('periods', () => {
  it('monthly range', () => {
    expect(c.periodsUntil('monthly', '2026-09', new Date('2026-11-11T07:00:00Z'))).toEqual(['2026-09', '2026-10', '2026-11'])
  })
  it('crosses year', () => {
    expect(c.periodsUntil('monthly', '2026-12', new Date('2027-02-01T00:00:00Z'))).toEqual(['2026-12', '2027-01', '2027-02'])
  })
  it('weekly keys', () => {
    expect(c.periodKey('weekly', new Date('2026-11-11T00:00:00Z'))).toBe('2026-W46')
    expect(c.periodsUntil('weekly', '2026-W44', new Date('2026-11-11T00:00:00Z'))).toEqual(['2026-W44', '2026-W45', '2026-W46'])
  })
  it('once', () => expect(c.periodsUntil('once', 'once', new Date())).toEqual(['once']))
})

describe('tags', () => {
  it('round-trips and fits 64 bytes', () => {
    const t = c.encodeTag('abcd2345', '2026-W46', 300)
    expect(new TextEncoder().encode(t).length).toBeLessThanOrEqual(64)
    expect(c.decodeTag(t)).toEqual({ groupId: 'abcd2345', period: '2026-W46', memberId: 300 })
  })
  it('ignores other data', () => {
    expect(c.decodeTag('hello')).toBeNull()
    expect(c.hexToUtf8('06c203643f4df673af0db8eea90f6755a28c6f9cf1')).toBe('')
  })
})

describe('ledger', () => {
  const tx = (h: string, value: number, data: string, extra: Partial<c.ChainTx> = {}): c.ChainTx => ({
    hash: h, from: 'NQ74 Q81N 8FSD XRRS X3DQ VSLG XRSM LA66 Y77H', to: G.payee, value,
    recipientData: hex(data), timestamp: 1, blockNumber: 1, executionResult: true, ...extra,
  })
  const txs = [
    tx('a', 500_000, 'DB1:abcd2345:2026-11:1'),
    tx('b', 200_000, 'DB1:abcd2345:2026-11:2'),
    tx('b', 200_000, 'DB1:abcd2345:2026-11:2'), // duplicate hash
    tx('c', 500_000, 'DB1:zzzz2345:2026-11:3'), // other group
    tx('d', 500_000, 'DB1:abcd2345:2026-11:3', { executionResult: false }), // failed
    tx('e', 500_000, 'DB1:abcd2345:2026-11:3', { to: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000' }), // outgoing elsewhere
    tx('f', 500_000, 'DB1:abcd2345:2026-11:9'), // unknown member
    tx('g', 300_000, 'DB1:abcd2345:2026-11:2'),
  ]
  it('extracts only valid payments for this group', () => {
    expect(c.extractPayments(G, txs).map((p) => p.hash).sort()).toEqual(['a', 'b', 'g'])
  })
  it('computes statuses and totals', () => {
    const ledger = c.buildLedger(G, c.extractPayments(G, txs))
    expect(c.cellFor(ledger, 1, '2026-11').status).toBe('paid')
    expect(c.cellFor(ledger, 2, '2026-11').status).toBe('paid') // 200k + 300k
    expect(c.cellFor(ledger, 3, '2026-11').status).toBe('unpaid')
    const s = c.periodSummary(G, ledger, '2026-11')
    expect(s).toMatchObject({ paid: 2, partial: 0, unpaid: 1, collected: 1_000_000, expected: 1_500_000 })
  })
  it('csv export', () => {
    const csv = c.ledgerCsv(G, c.extractPayments(G, txs))
    expect(csv.split('\n')[0]).toContain('tx_hash')
    expect(csv).toContain('"Ada"')
  })
})

describe('validateDraft', () => {
  const ok = { name: 'Unity', payee: G.payee, amountLuna: 100000, cadence: 'monthly', start: '2026-11', members: ['A'], network: 'mainnet' }
  it('accepts valid', () => expect(c.validateDraft(ok)).toBeNull())
  it('rejects bad address', () => expect(c.validateDraft({ ...ok, payee: 'NQ00' })).toMatch(/address/))
  it('rejects bad amount', () => expect(c.validateDraft({ ...ok, amountLuna: 0 })).toMatch(/Amount/))
})
