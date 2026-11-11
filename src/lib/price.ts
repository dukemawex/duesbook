// Live NIM price from CoinGecko (free, no key). Used only to show local-currency equivalents.
export type Fiat = 'ngn' | 'usd' | 'ghs' | 'kes'
export const FIAT_SYMBOL: Record<Fiat, string> = { ngn: '₦', usd: '$', ghs: 'GH₵', kes: 'KSh' }
let cache: { at: number; prices: Record<Fiat, number> } | null = null

export async function nimPrices(): Promise<Record<Fiat, number> | null> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.prices
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=ngn,usd,ghs,kes')
    if (!r.ok) return cache?.prices ?? null
    const j = await r.json()
    const p = j['nimiq-2']
    if (!p || typeof p.ngn !== 'number') return cache?.prices ?? null
    cache = { at: Date.now(), prices: p }
    return p
  } catch {
    return cache?.prices ?? null
  }
}

export function fmtFiat(amount: number, fiat: Fiat): string {
  const digits = amount >= 100 ? 0 : 2
  return FIAT_SYMBOL[fiat] + amount.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}
