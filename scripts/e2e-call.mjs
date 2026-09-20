// REAL 1:1 voice call E2E with fake media devices: offer, accept, media flows
// both ways (remote audio elements + participants), hangup tears down.
// Self-contained: starts vite as a child. ASCII only.
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
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
})

let failed = false
const watch = (name, page) => {
  page.on('console', (m) => {
    if (m.type() === 'error') log(name, 'console.error:', m.text().slice(0, 220))
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

async function mediaState(page) {
  return page.evaluate(() => {
    const audios = [...document.querySelectorAll('audio')]
    return {
      audioEls: audios.length,
      withStream: audios.filter((a) => !!a.srcObject).length,
      tracks: audios.flatMap((a) => {
        const s = a.srcObject
        return s ? [...s.getTracks()].map((t) => t.kind + ':' + t.readyState + ':' + (t.enabled ? 'on' : 'off')) : []
      }),
    }
  })
}

try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  watch('alice', a)
  watch('bob', b)
  await onboard(a, 'AliceV')
  await onboard(b, 'BobV')
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

  // Alice calls Bob
  await a.getByTestId('call-button').click()
  log('alice dialing...')
  await b.getByTestId('accept-call').waitFor({ timeout: 120000 })
  log('RINGING on bob - signaling works')
  await b.screenshot({ path: 'e2e-call-ringing.png' }).catch(() => {})
  await b.getByTestId('accept-call').click()
  log('bob accepted')

  // both sides show the in-call bar
  await a.getByTestId('leave-call').waitFor({ timeout: 60000 })
  await b.getByTestId('leave-call').waitFor({ timeout: 60000 })
  log('call bars up on both sides')
  await a.waitForTimeout(8000)

  // media actually flowing both ways?
  const ma = await mediaState(a)
  const mb = await mediaState(b)
  log('alice media:', JSON.stringify(ma))
  log('bob media:', JSON.stringify(mb))
  if (ma.withStream < 1 || mb.withStream < 1) throw new Error('no remote audio stream on one side')

  // participants visible (identity-bound, not just peer ids)
  const paCount = await a.locator('text=BobV').count()
  const pbCount = await b.locator('text=AliceV').count()
  log('name mentions - alice sees BobV:', paCount > 0, '| bob sees AliceV:', pbCount > 0)

  // hangup tears everything down
  await a.getByTestId('leave-call').click()
  log('alice hung up')
  await a.waitForTimeout(5000)
  const barA = await a.getByTestId('leave-call').count()
  const barB = await b.getByTestId('leave-call').count()
  log('call bars after hangup - alice:', barA, 'bob:', barB)
  if (barA !== 0 || barB !== 0) throw new Error('call did not tear down on both sides')

  if (a.isClosed() || b.isClosed()) throw new Error('a page died')
  log('E2E CALL PASS')
} catch (e) {
  failed = true
  log('FAIL:', String(e && e.message ? e.message : e).slice(0, 500))
  try {
    const pages = browser.contexts().flatMap((c) => c.pages())
    for (let i = 0; i < pages.length; i++) {
      await pages[i].screenshot({ path: `e2e-call-fail-${i}.png` }).catch(() => {})
    }
  } catch {}
}
await browser.close().catch(() => {})
try { vite.kill() } catch {}
log('dev server stopped')
process.exit(failed ? 1 : 0)
