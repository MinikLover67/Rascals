// Sends a REAL friend request to a given invite code and reports what happens.
// Usage: node scripts/send-request.mjs "rascal1:..."
// A DebugBot peer runs the actual app in Chromium over the live relay network.
import { chromium } from 'playwright-core'

const EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const URL = 'http://localhost:1420/'
const T0 = Date.now()
const stamp = () => `[+${Math.round((Date.now() - T0) / 1000)}s]`
const log = (...a) => console.log(stamp(), ...a)

const code = process.argv[2] || ''
if (!code.startsWith('rascal1:')) {
  console.log('usage: node scripts/send-request.mjs "rascal1:..."')
  process.exit(2)
}

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

let failed = false
try {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') log('console.error:', m.text().slice(0, 200))
    if (m.type() === 'warning' && /trystero|relay|rtc|peer|websocket/i.test(m.text()))
      log('console.warn:', m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 200)))

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('onboard-name').fill('DebugBot')
  await page.getByTestId('onboard-create').click()
  await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  log('debugbot onboarded')

  // read our own relay states via Settings > Connection
  await page.getByText('Settings', { exact: true }).first().click()
  await page.getByText('Connection', { exact: true }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(8000)
  const connText = await page.getByText(/Signaling:/).first().innerText().catch(() => 'n/a')
  log('our connection:', connText.slice(0, 160))
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(10, 200).catch(() => {})

  // send the request
  await page.getByTestId('add-input').fill(code)
  await page.getByTestId('add-button').click()
  await page.getByTestId('request-out').waitFor({ timeout: 30000 })
  log('request recorded as outgoing, knocking...')

  // watch for the full handshake: friend row + online dot means THEIR hello came back
  try {
    await page.locator('[data-testid="friend-row"]').first().waitFor({ timeout: 180000 })
    log('THEIR HELLO ARRIVED - they accepted (or auto-handshake completed)')
    try {
      await page.locator('[data-testid="friend-row"] span[title="online"]').first().waitFor({ timeout: 60000 })
      log('DM ROOM CONNECTED - fully online both ways')
    } catch {
      log('friend added but not online yet (DM room still connecting)')
    }
  } catch {
    log('no answer yet - request is pending on their side (or never arrived)')
  }

  const shot = await page.screenshot().catch(() => null)
  void shot
  log('done - browser left open for 10s for inspection, then closing')
  await page.waitForTimeout(10000)
} catch (e) {
  failed = true
  log('FAIL:', String(e && e.message ? e.message : e).slice(0, 500))
}
await browser.close()
process.exit(failed ? 1 : 0)
