// Self-contained live message run: starts vite as a CHILD (stays alive for the
// whole run), drives DebugBot, sends the message, shuts everything down.
// Usage: node scripts/live-message.mjs "message" ["rascal1:..."]
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import path from 'node:path'

const EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const URL = 'http://localhost:1420/'
const PROFILE = path.join(process.cwd(), '.bot-profile')
const T0 = Date.now()
const stamp = () => `[+${Math.round((Date.now() - T0) / 1000)}s]`
const log = (...a) => console.log(stamp(), ...a)

const text = process.argv[2] || 'Hey - live message from the Rascals test rig.'
const maybeCode = process.argv[3] || ''

log('starting dev server (child process)...')
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
  log('dev server failed to start')
  try { vite.kill() } catch {}
  process.exit(1)
}
log('dev server UP')

const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: EXE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  void browser
  const page = ctx.pages()[0] || (await ctx.newPage())
  page.on('console', (m) => {
    if (m.type() === 'error') log('console.error:', m.text().slice(0, 160))
  })
  page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 160)))

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  const onboard = page.getByTestId('onboard-name')
  if (await onboard.count()) {
    log('first run - onboarding DebugBot')
    await onboard.fill('DebugBot')
    await page.getByTestId('onboard-create').click()
    await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  } else {
    await page.getByTestId('show-code').waitFor({ timeout: 30000 })
    log('reusing saved DebugBot identity')
  }

  if (maybeCode.startsWith('rascal1:')) {
    await page.getByTestId('add-input').fill(maybeCode)
    await page.getByTestId('add-button').click()
    log('friend request sent - waiting for them to accept...')
    await page.locator('[data-testid="friend-row"]').first().waitFor({ timeout: 180000 })
    log('request accepted!')
  }

  const rows = page.locator('[data-testid="friend-row"]')
  const n = await rows.count()
  log('friend rows visible:', n)
  let target = null
  for (let i = 0; i < n; i++) {
    const t = await rows.nth(i).innerText()
    if (/test2/i.test(t)) {
      target = rows.nth(i)
      break
    }
  }
  if (!target) {
    if (n === 0) throw new Error('no friends yet - they must accept the request first')
    target = rows.first()
    log('Test2 row not found by name, using first friend row')
  }
  await target.click()
  log('chat opened, typing message...')
  await page.locator('textarea').first().fill(text)
  await page.keyboard.press('Enter')
  log('message sent, watching for delivery...')
  await page.getByText(text.slice(0, 24)).first().waitFor({ timeout: 30000 })
  log('bubble rendered locally')
  let delivered = false
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(5000)
    const html = await page.content()
    if (html.includes('title="delivered"')) {
      delivered = true
      break
    }
  }
  log(delivered ? 'DELIVERED (their app acked receipt)' : 'sent, no delivery ack within 2 min (their app may be closed)')
  await page.screenshot({ path: 'send-message.png' }).catch(() => {})
} catch (e) {
  failed = true
  log('FAIL:', String(e && e.message ? e.message : e).slice(0, 400))
}
await ctx.close().catch(() => {})
try { vite.kill() } catch {}
log('dev server stopped')
process.exit(failed ? 1 : 0)
