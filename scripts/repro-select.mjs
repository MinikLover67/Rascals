// Repro: open a friend chat (the action that crashes laptop 2) with full capture.
// Self-contained: starts vite as a child, two peers, invite+accept, select row,
// exchange tricky messages, screenshot. ASCII only.
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
const watch = (name, page) => {
  page.on('console', (m) => {
    if (m.type() === 'error') log(name, 'console.error:', m.text().slice(0, 300))
  })
  page.on('pageerror', (e) => log(name, 'PAGEERROR:', String(e && e.stack ? e.stack : e).slice(0, 500)))
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
  await onboard(a, 'AliceR')
  await onboard(b, 'BobR')
  log('both onboarded')

  await a.getByTestId('show-code').click()
  const code = (await a.getByTestId('invite-code').innerText()).trim()
  await b.getByTestId('add-input').fill(code)
  await b.getByTestId('add-button').click()
  await a.getByTestId('request-in').waitFor({ timeout: 180000 })
  log('request arrived')
  await a.getByTestId('accept-request').click()
  await a.getByText('BobR').first().waitFor({ timeout: 30000 })
  log('accepted, both friends')

  // THE CRASH ACTION: open the chat by pressing the friend row
  await a.locator('[data-testid="friend-row"]').first().click()
  log('alice pressed friend row')
  await a.locator('textarea').first().waitFor({ timeout: 15000 })
  log('chat panel rendered, textarea visible')
  await a.waitForTimeout(3000)

  // tricky content both directions
  const tricky = '**bold** *ital* `code` [link](https://example.com) @user https://www.youtube.com/watch?v=dQw4w9WgXcQ smile:ok'
  await b.locator('[data-testid="friend-row"]').first().click()
  await b.locator('textarea').first().fill(tricky)
  await b.keyboard.press('Enter')
  log('bob sent tricky message')
  await a.waitForTimeout(8000)
  const bodyText = await a.content()
  log('alice sees message:', bodyText.includes('bold') ? 'yes' : 'NO')
  await a.screenshot({ path: 'repro-chat.png' }).catch(() => {})
  log('screenshot saved, pages alive:', !a.isClosed() && !b.isClosed())
  if (a.isClosed() || b.isClosed()) throw new Error('a page died')
  log('REPRO DONE - no crash here')
} catch (e) {
  failed = true
  log('FAIL:', String(e && e.message ? e.message : e).slice(0, 500))
}
await browser.close().catch(() => {})
try { vite.kill() } catch {}
log('dev server stopped')
process.exit(failed ? 1 : 0)
