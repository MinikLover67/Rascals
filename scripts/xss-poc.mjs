// XSS PoC: a "friend" sends crafted markdown trying to break out of href="".
// Listens for dialog (alert) and scans rendered HTML for event handlers.
// Self-contained: starts vite as a child. ASCII only.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const URL = 'http://localhost:1420/'
const T0 = Date.now()
const stamp = () => `[+${Math.round((Date.now() - T0) / 1000)}s]`
const log = (...a) => console.log(stamp(), ...a)

const PAYLOADS = [
  'https://e.com/"onmouseover="alert(1);',
]

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

let fired = []
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  b.on('dialog', async (d) => {
    fired.push(d.message())
    await d.dismiss().catch(() => {})
  })
  async function onboard(page, name) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('onboard-name').fill(name)
    await page.getByTestId('onboard-create').click()
    await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  }
  await onboard(a, 'Attacker')
  await onboard(b, 'Victim')
  await a.getByTestId('show-code').click()
  const code = (await a.getByTestId('invite-code').innerText()).trim()
  await b.getByTestId('add-input').fill(code)
  await b.getByTestId('add-button').click()
  await a.getByTestId('request-in').waitFor({ timeout: 180000 })
  await a.getByTestId('accept-request').click()
  await b.locator('[data-testid="friend-row"]').first().click()
  await a.locator('[data-testid="friend-row"]').first().click()
  log('peers friended, victim chat open - firing payloads from attacker')
  for (const p of PAYLOADS) {
    await b.locator('textarea').first().fill(p)
    await b.keyboard.press('Enter')
    await b.waitForTimeout(4000)
  }
  await b.waitForTimeout(3000)
  const html = await b.content()
  const handlers = (html.match(/on\w+\s*=/gi) || []).filter((h) => !/^on$/.test(h))
  log('alert() dialogs fired:', JSON.stringify(fired))
  log('event-handler attributes in DOM:', JSON.stringify([...new Set(handlers)].slice(0, 10)))
  // dump exact rendered HTML of every link for analysis
  const links = await b.evaluate(() => {
    return [...document.querySelectorAll('a')].map((x) => x.outerHTML.slice(0, 300))
  })
  for (const l of links) log('LINK:', l)
  // hover like a real user would
  try {
    const targets = b.locator('a[onmouseover]')
    const n = await targets.count()
    log('injectable links found:', n)
    for (let i = 0; i < n; i++) {
      await targets.nth(i).hover({ timeout: 5000 }).catch(() => {})
      await b.waitForTimeout(800)
    }
  } catch {}
  log('alert() dialogs after hover:', JSON.stringify(fired))
  await b.screenshot({ path: 'xss-poc.png' }).catch(() => {})
  if (fired.length > 0) log('XSS CONFIRMED - arbitrary JS executed in victim context')
  else if (handlers.length > 0) log('XSS LIKELY - injected handlers present (need interaction)')
  else log('no XSS - payloads neutralized')
} catch (e) {
  log('FAIL:', String(e && e.message ? e.message : e).slice(0, 300))
}
await browser.close().catch(() => {})
try { vite.kill() } catch {}
process.exit(0)
