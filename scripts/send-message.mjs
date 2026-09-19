// Sends a REAL chat message as DebugBot (persistent identity in .bot-profile).
// Usage: node scripts/send-message.mjs "message text" [rascal1:... (only if not friends yet)]
import { chromium } from 'playwright-core'
import path from 'node:path'

const EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const URL = 'http://localhost:1420/'
const PROFILE = path.join(process.cwd(), '.bot-profile')
const T0 = Date.now()
const stamp = () => `[+${Math.round((Date.now() - T0) / 1000)}s]`
const log = (...a) => console.log(stamp(), ...a)

const text = process.argv[2] || 'Hello from DebugBot - live test message'
const maybeCode = process.argv[3] || ''

const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: EXE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = ctx.pages()[0] || (await ctx.newPage())
page.on('console', (m) => {
  if (m.type() === 'error') log('console.error:', m.text().slice(0, 160))
})
page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 160)))

let failed = false
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  // onboard only on first run (persistent profile keeps identity after that)
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

  // open the Test2 chat: pick the friend row mentioning Test2
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
  const box = page.locator('textarea').first()
  await box.fill(text)
  await page.keyboard.press('Enter')
  log('message sent, watching for delivery...')
  // our own bubble with the text should appear
  await page.getByText(text.slice(0, 24)).first().waitFor({ timeout: 30000 })
  log('bubble rendered locally')
  // delivered = double tick somewhere in our bubbles; poll briefly
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
await ctx.close()
process.exit(failed ? 1 : 0)
