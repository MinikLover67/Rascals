// REAL file/image sharing E2E: Alice attaches a generated PNG, Bob must see it
// render (E2EE chunks over the live relay network), then Bob replies in text.
// Self-contained: starts vite as a child. ASCII only.
import { spawn } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import { chromium } from 'playwright-core'
import path from 'node:path'

const EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const URL = 'http://localhost:1420/'
const T0 = Date.now()
const stamp = () => `[+${Math.round((Date.now() - T0) / 1000)}s]`
const log = (...a) => console.log(stamp(), ...a)

// 8x8 red PNG, generated inline (no fixtures needed)
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAACu+CtlAAAAFUlEQVR4nGP8z8AARQwMDAwMDEAMAwAsQgIkX+C6nwAAAABJRU5ErkJggg=='
const IMG_PATH = path.join(process.cwd(), 'e2e-test-image.png')
writeFileSync(IMG_PATH, Buffer.from(PNG_B64, 'base64'))

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
const watch = (name, page) => {
  page.on('console', (m) => {
    if (m.type() === 'error') log(name, 'console.error:', m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => log(name, 'PAGEERROR:', String(e && e.stack ? e.stack : e).slice(0, 400)))
  page.on('crash', () => log(name, 'PAGE CRASHED'))
}

async function onboard(page, name) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('onboard-name').fill(name)
  await page.getByTestId('onboard-create').click()
  await page.getByTestId('show-code').waitFor({ timeout: 30000 })
}

try {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  watch('alice', a)
  watch('bob', b)
  await onboard(a, 'AliceF')
  await onboard(b, 'BobF')
  log('both onboarded')

  await a.getByTestId('show-code').click()
  const code = (await a.getByTestId('invite-code').innerText()).trim()
  await b.getByTestId('add-input').fill(code)
  await b.getByTestId('add-button').click()
  await a.getByTestId('request-in').waitFor({ timeout: 180000 })
  await a.getByTestId('accept-request').click()
  await a.locator('[data-testid="friend-row"] span[title="online"]').first().waitFor({ timeout: 120000 })
  log('friends + online both ways')

  // both open the DM
  await a.locator('[data-testid="friend-row"]').first().click()
  await b.locator('[data-testid="friend-row"]').first().click()
  await a.locator('textarea').first().waitFor({ timeout: 15000 })
  log('chats open')

  // Alice attaches the PNG (hidden input works with setInputFiles)
  await a.getByTestId('file-input').setInputFiles(IMG_PATH)
  log('alice attached image, waiting for bob to render it...')
  const bobImg = b.locator('[data-testid="attachment"] img').first()
  await bobImg.waitFor({ timeout: 180000 })
  log('BOB SEES THE IMAGE - E2EE file transfer works')
  const src = await bobImg.getAttribute('src')
  log('image src is blob url:', src && src.startsWith('blob:') ? 'yes' : 'NO (' + String(src).slice(0, 40) + ')')
  if (!src || !src.startsWith('blob:')) throw new Error('image did not load from local blob')

  // Bob replies in text, Alice reads it back
  await b.locator('textarea').first().fill('got the pic!')
  await b.keyboard.press('Enter')
  await a.getByText('got the pic!').first().waitFor({ timeout: 60000 })
  log('text reply arrived back - full duplex ok')

  // Removal flow: alice removes bob with confirm dialog
  a.on('dialog', (d) => void d.accept())
  await a.getByTestId('remove-friend').first().click()
  await a.getByTestId('recent-row').first().waitFor({ timeout: 15000 })
  log('removed -> appears in Recently removed')
  await a.screenshot({ path: 'e2e-files.png' }).catch(() => {})
  if (a.isClosed() || b.isClosed()) throw new Error('a page died')
  log('E2E FILES PASS - pages alive')
} catch (e) {
  failed = true
  log('FAIL:', String(e && e.message ? e.message : e).slice(0, 500))
}
try { rmSync(IMG_PATH) } catch {}
await browser.close().catch(() => {})
try { vite.kill() } catch {}
log('dev server stopped')
process.exit(failed ? 1 : 0)
