import { KeyPair, PrivateKey } from '@nimiq/core'
import fs from 'node:fs'
const F = new URL('./.keys.json', import.meta.url)
let k
if (fs.existsSync(F)) k = JSON.parse(fs.readFileSync(F, 'utf8'))
else {
  const a = KeyPair.generate(), b = KeyPair.generate()
  k = { payer: a.privateKey.toHex(), treasurer: b.privateKey.toHex() }
  fs.writeFileSync(F, JSON.stringify(k), { mode: 0o600 })
}
const addr = (hex) => KeyPair.derive(PrivateKey.fromHex(hex)).toAddress().toUserFriendlyAddress()
console.log(JSON.stringify({ payer: addr(k.payer), treasurer: addr(k.treasurer) }))
