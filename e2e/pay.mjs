// Sends a real DuesBook-tagged payment on Nimiq testnet (same tx shape as sendBasicTransactionWithData).
import { KeyPair, PrivateKey, Address, TransactionBuilder } from '@nimiq/core'
import fs from 'node:fs'
const RPC = 'https://rpc.testnet.nimiqwatch.com'
const rpc = async (method, params) => {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result.data
}
const [, , tag, lunaStr] = process.argv
const k = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url), 'utf8'))
const payer = KeyPair.derive(PrivateKey.fromHex(k.payer))
const treasurer = KeyPair.derive(PrivateKey.fromHex(k.treasurer)).toAddress()
const height = await rpc('getBlockNumber', [])
const tx = TransactionBuilder.newBasicWithData(payer.toAddress(), treasurer, new TextEncoder().encode(tag), BigInt(lunaStr), 0n, height, 5)
tx.sign(payer)
const hash = await rpc('sendRawTransaction', [tx.toHex()])
console.log(JSON.stringify({ tag, luna: Number(lunaStr), hash }))
