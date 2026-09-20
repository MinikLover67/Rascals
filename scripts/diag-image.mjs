// Diagnoses image rendering: sends text+image like proof-chat, then inspects
// the receiver's img element (complete? naturalWidth? src kind?) + console.
import { spawn } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import { chromium } from 'playwright-core'
import path from 'node:path'

const EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const URL = 'http://localhost:1420/'
const T0 = Date.now()
const stamp = () => `[+${Math.round((Date.now() - T0) / 1000)}s]`
const log = (...a) => console.log(stamp(), ...a)

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAACu+CtlAAAAFUlEQVR4nGP8z8AARQwMDAwMDEAMAwAsQgIkX+C6nwAAAABJRU5ErkJggg=='
const IMG_PATH = path.join(process.cwd(), 'proof-image.png')
writeFileSync(IMG_PATH, Buffer.from(PNG_B64, 'base64'))

log('starting dev server...')
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  cwd: process.cwd(),
  stdio: 'ignore',
})
let devUp = false
for (let i = 0; i < 45; i++) {
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

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  for (const [name, page] of [['alice', a], ['bob', b]]) {
    page.on('console', (m) => {
      if (m.type() === 'error') log(name, 'console.error:', m.text().slice(0, 300))
    })
    page.on('pageerror', (e) => log(name, 'PAGEERROR:', String(e).slice(0, 300)))
  }
  async function onboard(page, name) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('onboard-name').fill(name)
    await page.getByTestId('onboard-create').click()
    await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  }
  await onboard(a, 'AliceD')
  await onboard(b, 'BobD')
  await a.getByTestId('show-code').click()
  const code = (await a.getByTestId('invite-code').innerText()).trim()
  await b.getByTestId('add-input').fill(code)
  await b.getByTestId('add-button').click()
  await a.getByTestId('request-in').waitFor({ timeout: 180000 })
  await a.getByTestId('accept-request').click()
  await a.locator('[data-testid="friend-row"] span[title="online"]').first().waitFor({ timeout: 120000 })
  log('friends online')
  await a.locator('[data-testid="friend-row"]').first().click()
  await b.locator('[data-testid="friend-row"]').first().click()
  await a.getByTestId('file-input').setInputFiles(IMG_PATH)
  log('attached, polling image load state...')
  for (let i = 0; i < 12; i++) {
    await b.waitForTimeout(5000)
    const state = await b.evaluate(async () => {
      const img = document.querySelector('[data-testid="attachment"] img')
      if (!img) return { present: false }
      let blobInfo = null
      try {
        const res = await fetch(img.src)
        const buf = new Uint8Array(await res.arrayBuffer())
        blobInfo = {
          len: buf.length,
          head: [...buf.slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join(''),
        }
      } catch (e) {
        blobInfo = { error: String(e).slice(0, 80) }
      }
      return {
        present: true,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        srcKind: img.src.slice(0, 20),
        blobInfo,
      }
    })
    log('img state:', JSON.stringify(state))
    if (state.present && state.naturalWidth > 0) break
  }
  await b.screenshot({ path: 'proof-chat2.png' })
  log('screenshot saved')
} catch (e) {
  log('FAIL:', String(e && e.message ? e.message : e).slice(0, 400))
}
try { rmSync(IMG_PATH) } catch {}
await browser.close().catch(() => {})
try { vite.kill() } catch {}
process.exit(0)
