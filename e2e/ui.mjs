import { chromium } from 'playwright-core'
const BASE = process.env.BASE || 'https://duesbook-app.vercel.app'
const G = process.argv[2]
const out = '/workspace/nimiq-miniapp/media'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(BASE + '/')
await page.waitForSelector('text=Collect group dues')
await page.screenshot({ path: `${out}/01-home.png` })

await page.goto(BASE + '/#/new')
await page.waitForSelector('text=New dues group')
await page.fill('input[placeholder^="e.g. Unity"]', 'Unity Estate Residents, Phase 2')
await page.fill('input[placeholder^="NQ"]', 'NQ87 5S4Y S4K6 RY45 2D1F YVDL LCFR PLB7 441N')
await page.waitForTimeout(1500)
await page.fill('input[placeholder="₦5,000"]', '5000')
await page.dispatchEvent('input[placeholder="₦5,000"]', 'input')
await page.fill('textarea', 'Mrs. Adebayo (Flat 1)\nMr. Okafor (Flat 2)\nChidi (Flat 3)\nAisha (Flat 4)')
await page.screenshot({ path: `${out}/02-create.png`, fullPage: true })
const nimVal = await page.inputValue('input[placeholder="e.g. 15000"]')
const valid = await page.isVisible('text=✓ Valid address')

await page.goto(BASE + `/#/g/${G}`)
await page.waitForSelector('text=Which member are you?')
await page.waitForSelector('text=Read from the Nimiq testnet blockchain', { timeout: 30000 })
await page.screenshot({ path: `${out}/03-register.png`, fullPage: true })
const statuses = await page.$$eval('button.list-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))
const summary = await page.$eval('.summary', (e) => e.innerText.replace(/\s+/g, ' '))

await page.click('button.chip:has-text("Bayo")')
await page.waitForSelector('text=Hi Bayo')
await page.screenshot({ path: `${out}/04-member.png`, fullPage: true })
const owe = await page.$eval('section.card:has-text("Hi Bayo")', (e) => e.innerText.replace(/\s+/g, ' '))
await page.click('button:has-text("Pay ")')
await page.waitForSelector('.sheet img[alt="Nimiq payment QR code"]')
await page.screenshot({ path: `${out}/05-pay-sheet.png` })
const sheet = await page.$eval('.sheet', (e) => e.innerText.replace(/\s+/g, ' '))
await page.click('.sheet button:has-text("Try Nimiq Pay anyway")')
await page.waitForSelector('.sheet .error', { timeout: 10000 })
const outsideMsg = await page.$eval('.sheet .error', (e) => e.innerText)
console.log(JSON.stringify({ nimFromNgn: nimVal, validAddress: valid, statuses, summary, owe, sheet, outsideMsg, errors }, null, 1))
await browser.close()
