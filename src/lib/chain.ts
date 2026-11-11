import type { ChainTx, Network } from './core'

export const RPC: Record<Network, string> = {
  mainnet: 'https://rpc.nimiqwatch.com',
  testnet: 'https://rpc.testnet.nimiqwatch.com',
}
export const explorerTx = (net: Network, hash: string) =>
  net === 'mainnet' ? `https://nimiq.watch/#${hash}` : `https://test.nimiq.watch/#${hash}`

async function rpc<T>(net: Network, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC[net], {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (res.status === 429) throw new Error('The public Nimiq RPC is rate-limiting us. Wait a few seconds and refresh.')
  if (!res.ok) throw new Error(`Nimiq RPC error (HTTP ${res.status})`)
  const body = await res.json()
  if (body.error) throw new Error(body.error.message || 'Nimiq RPC error')
  return body.result?.data as T
}

/** Newest-first transactions touching `address`, paginated (up to `limit`). */
export async function transactionsFor(net: Network, address: string, limit = 2000): Promise<ChainTx[]> {
  const all: ChainTx[] = []
  let startAt: string | undefined
  while (all.length < limit) {
    const params: unknown[] = [address, 500]
    if (startAt) params.push(startAt)
    const page = await rpc<ChainTx[]>(net, 'getTransactionsByAddress', params)
    if (!page || !page.length) break
    all.push(...page)
    if (page.length < 500) break
    startAt = page[page.length - 1].hash
  }
  return all
}

export async function transactionByHash(net: Network, hash: string): Promise<ChainTx | null> {
  try {
    return await rpc<ChainTx>(net, 'getTransactionByHash', [hash])
  } catch {
    return null
  }
}

export async function blockNumber(net: Network): Promise<number> {
  return rpc<number>(net, 'getBlockNumber', [])
}
