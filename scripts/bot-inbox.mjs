// DebugBot inbox watcher (persistent identity in .bot-profile).
// Self-contained: starts vite as a child, onboards if needed, befriends Test2,
// then dumps every message in the Test2 chat, watching for new arrivals.
// Usage: node scripts/bot-inbox.mjs
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import path from 'node:path'

const EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const URL = 'http://localhost:1420/'
const PROFILE = path.join(process.cwd(), '.bot-profile')
const CODE = 'rascal1:VxtXqoMrhyYxbzbMjqp0WY1YgNU4BO0-IxBptgShQjM:Test2'
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

let failed = false
try {
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

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  if (await page.getByTestId('onboard-name').count()) {
    log('onboarding permanent DebugBot')
    await page.getByTestId('onboard-name').fill('DebugBot')
    await page.getByTestId('onboard-create').click()
    await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  } else {
    await page.getByTestId('show-code').waitFor({ timeout: 30000 })
    log('reusing saved DebugBot identity')
  }

  // ensure Test2 friendship
  let rows = page.locator('[data-testid="friend-row"]')
  if ((await rows.count()) === 0) {
    log('not friends yet - sending request to Test2')
    await page.getByTestId('add-input').fill(CODE)
    await page.getByTestId('add-button').click()
    log('waiting for Test2 to accept (up to 3 min)...')
    await rows.first().waitFor({ timeout: 180000 })
    log('accepted!')
  } else {
    log('already friends with', await rows.count(), 'friend(s)')
  }

  // open Test2 chat (or first friend) and dump messages
  const n = await rows.count()
  let target = rows.first()
  for (let i = 0; i < n; i++) {
    const t = await rows.nth(i).innerText()
    if (/test2/i.test(t)) {
      target = rows.nth(i)
      break
    }
  }
  await target.click()
  log('chat opened')

  // simpler: read the message list text content
  async function readChat() {
    return page.evaluate(() => {
      const main = document.body.innerText || ''
      return main.slice(0, 3000)
    })
  }

  log('--- chat content ---')
  log(await readChat())
  log('--- watching 3 min for new arrivals ---')
  let last = await readChat()
  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(5000)
    const cur = await readChat()
    if (cur !== last) {
      log('--- NEW CONTENT ---')
      log(cur)
      last = cur
    }
  }
  log('watch done')
} catch (e) {
  failed = true
  log('FAIL:', String(e && e.message ? e.message : e).slice(0, 400))
}
process.exit(failed ? 1 : 0)
