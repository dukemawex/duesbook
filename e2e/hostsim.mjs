// E2E harness: real app + real Nimiq testnet. Only Nimiq Pay's native bridge (window.nimiq) is
// stood in for by Node, which signs with a local testnet key and broadcasts via public RPC.
import { chromium } from 'playwright-core'
import { KeyPair, PrivateKey, TransactionBuilder, Address } from '@nimiq/core'
import fs from 'node:fs'
const BASE = 'https://duesbook-app.vercel.app'
const OUT = '/workspace/nimiq-miniapp/media'
const RPC = 'https://rpc.testnet.nimiqwatch.com'
const rpc = async (method, params) => {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result.data
}
const keys = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url), 'utf8'))
const kp = (hex) => KeyPair.derive(PrivateKey.fromHex(hex))
const log = []
let rejectNext = false

async function device(name, keyHex) {
  const wallet = kp(keyHex)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await ctx.exposeBinding('__host', async (_src, method, arg) => {
    log.push(`${name}: ${method}`)
    if (method === 'listAccounts') return [wallet.toAddress().toUserFriendlyAddress()]
    if (method === 'getBalance') return (await rpc('getAccountByAddress', [arg])).balance
    if (method === 'sendBasicTransactionWithData') {
      if (rejectNext) { rejectNext = false; return { error: { type: 'PERMISSION_DENIED', message: 'User rejected the request', code: 4001 } } }
      const height = await rpc('getBlockNumber', [])
      const tx = TransactionBuilder.newBasicWithData(wallet.toAddress(), Address.fromUserFriendlyAddress(arg.recipient), new TextEncoder().encode(arg.data), BigInt(arg.value), 0n, height, 5)
      tx.sign(wallet)
      const hash = await rpc('sendRawTransaction', [tx.toHex()])
      log.push(`${name}: broadcast ${hash} data=${arg.data} value=${arg.value}`)
      return hash
    }
    throw new Error('unsupported ' + method)
  })
  await ctx.addInitScript(() => {
    window.nimiqPay = { network: 'testnet', language: 'en' }
    const call = (m, a) => window.__host(m, a)
    window.nimiq = {
      listAccounts: () => call('listAccounts'),
      getBalance: (a) => call('getBalance', a),
      sendBasicTransactionWithData: (tx) => call('sendBasicTransactionWithData', tx),
      isConsensusEstablished: async () => true,
    }
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log.push(`${name} pageerror: ${e}`))
  return page
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
// Treasurer device
const t = await device('treasurer', keys.treasurer)
await t.goto(BASE + '/#/new')
await t.fill('input[placeholder^="e.g. Unity"]', 'Unity Estate Residents (testnet demo)')
await t.click('button:has-text("Use my Nimiq Pay address")')
await t.waitForSelector('text=✓ Valid address')
await t.fill('input[placeholder="e.g. 15000"]', '3')
await t.fill('textarea', 'Mrs. Adebayo (Flat 1)\nMr. Okafor (Flat 2)\nChidi (Flat 3)\nAisha (Flat 4)')
await t.fill('input[placeholder^="e.g. Security"]', 'Security + waste levy. Due by the 5th.')
await t.screenshot({ path: `${OUT}/h1-create-in-nimiq-pay.png`, fullPage: true })
await t.click('button:has-text("Create group")')
await t.waitForSelector('text=Your group is ready')
const gid = /#\/g\/([a-z0-9]{8})/.exec(t.url())[1]
await t.waitForSelector('text=Read from the Nimiq testnet blockchain', { timeout: 30000 })
await t.screenshot({ path: `${OUT}/h2-group-created.png`, fullPage: true })

// Member device
const m = await device('member', keys.payer)
await m.goto(`${BASE}/#/g/${gid}`)
await m.click('button.chip:has-text("Mr. Okafor")')
await m.waitForSelector('text=Hi Mr. Okafor')
await m.click('button:has-text("Pay 3 NIM")')
await m.waitForSelector('text=Your balance')
const sheetBefore = await m.$eval('.sheet', (e) => e.innerText.replace(/\s+/g, ' '))
await m.screenshot({ path: `${OUT}/h3-pay-sheet.png` })
rejectNext = true
await m.click('button:has-text("Pay with Nimiq Pay")')
await m.waitForSelector('.sheet .error')
const cancelMsg = await m.$eval('.sheet .error', (e) => e.innerText)
await m.click('.sheet button:has-text("Close")')
await m.click('button:has-text("Pay 3 NIM")')
await m.waitForSelector('text=Pay with Nimiq Pay')
await m.click('button:has-text("Pay with Nimiq Pay")')
const t0 = Date.now()
await m.waitForSelector('text=✓ Paid and confirmed', { timeout: 100000 })
const confirmSecs = ((Date.now() - t0) / 1000).toFixed(1)
const receipt = await m.$eval('.sheet', (e) => e.innerText.replace(/\s+/g, ' '))
await m.screenshot({ path: `${OUT}/h4-paid-confirmed.png` })
await m.click('.sheet button:has-text("Done")')
await m.waitForSelector('text=You\'re fully paid up')
await m.screenshot({ path: `${OUT}/h5-member-paid-up.png`, fullPage: true })

// Treasurer refreshes
await t.click('button:has-text("Refresh")')
await t.waitForFunction(() => document.querySelector('.summary')?.innerText.includes('1 paid'), null, { timeout: 30000 })
const summary = await t.$eval('.summary', (e) => e.innerText.replace(/\s+/g, ' '))
await t.screenshot({ path: `${OUT}/h6-treasurer-register.png`, fullPage: true })
console.log(JSON.stringify({ gid, sheetBefore, cancelMsg, confirmSecs, receipt, summary, log }, null, 1))
await browser.close()
