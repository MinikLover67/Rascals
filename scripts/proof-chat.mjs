// Proof shot: two real peers exchange text + an image over the live network,
// then screenshots the receiving chat. Saved as proof-chat.png. ASCII only.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const URL = 'http://localhost:1420/'
const T0 = Date.now()
const stamp = () => `[+${Math.round((Date.now() - T0) / 1000)}s]`
const log = (...a) => console.log(stamp(), ...a)

log('starting dev server...')
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  cwd: process.cwd(),
  stdio: 'ignore',
})
let viteDead = false
vite.on('exit', () => { viteDead = true })
let devUp = false
for (let i = 0; i < 45 && !viteDead; i++) {
  try {
    const res = await fetch(URL)
    if (res.ok) { devUp = true; break }
  } catch {}
  await new Promise((r) => setTimeout(r, 2000))
}
if (!devUp) {
  log('dev server failed')
  try { vite.kill() } catch {}
  process.exit(1)
}
log('dev server UP')

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

let failed = false
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  for (const [name, page] of [['alice', a], ['bob', b]]) {
    page.on('pageerror', (e) => log(name, 'PAGEERROR:', String(e).slice(0, 160)))
  }

  async function onboard(page, name) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('onboard-name').fill(name)
    await page.getByTestId('onboard-create').click()
    await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  }
  await onboard(a, 'AliceP')
  await onboard(b, 'BobP')
  log('both onboarded')

  await a.getByTestId('show-code').click()
  const code = (await a.getByTestId('invite-code').innerText()).trim()
  await b.getByTestId('add-input').fill(code)
  await b.getByTestId('add-button').click()
  await a.getByTestId('request-in').waitFor({ timeout: 180000 })
  await a.getByTestId('accept-request').click()
  await a.locator('[data-testid="friend-row"] span[title="online"]').first().waitFor({ timeout: 120000 })
  log('friends + online')

  await a.locator('[data-testid="friend-row"]').first().click()
  await b.locator('[data-testid="friend-row"]').first().click()

  // Alice sends a text message first
  await a.locator('textarea').first().fill('Hey Bob - this text traveled peer to peer with no server.')
  await a.keyboard.press('Enter')
  await b.getByText('Hey Bob - this text traveled').first().waitFor({ timeout: 60000 })
  log('text delivered')

  // Then the image: paint a guaranteed-valid PNG in-browser and drop it on
  // the real file input (same path as a user picking a file).
  await a.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 96
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 96, 96)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px sans-serif'
    ctx.fillText('R!', 18, 66)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
    const file = new File([blob], 'red-square.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const input = document.querySelector('[data-testid="file-input"]')
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  log('image attached, waiting for render on bob...')
  await b.locator('[data-testid="attachment"] img').first().waitFor({ timeout: 180000 })
  log('image rendered on bob')
  await b.waitForTimeout(3000)
  await b.screenshot({ path: 'proof-chat.png' })
  log('saved proof-chat.png')
} catch (e) {
  failed = true
  log('FAIL:', String(e && e.message ? e.message : e).slice(0, 400))
}
try { rmSync(IMG_PATH) } catch {}
await browser.close().catch(() => {})
try { vite.kill() } catch {}
process.exit(failed ? 1 : 0)
