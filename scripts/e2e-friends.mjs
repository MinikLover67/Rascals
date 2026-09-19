// REAL end-to-end: two isolated Chromium contexts run the actual app,
// Alice sends a friend request to Bob over the real relay network.
// Asserts the request arrives, gets accepted, and both see each other online.
import { chromium } from 'playwright-core'

const EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const URL = 'http://localhost:1420/'
const T0 = Date.now()
const stamp = () => `[+${Math.round((Date.now() - T0) / 1000)}s]`
const log = (...a) => console.log(stamp(), ...a)

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

async function newPeer(name) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log(name, 'console.' + m.type() + ':', m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => log(name, 'PAGEERROR:', String(e).slice(0, 200)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('onboard-name').fill(name)
  await page.getByTestId('onboard-create').click()
  await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  log(name, 'onboarded')
  return { ctx, page }
}

let failed = false
try {
  const alice = await newPeer('AliceE2E')
  const bob = await newPeer('BobE2E')

  // Alice copies her invite code
  await alice.page.getByTestId('show-code').click()
  const code = (await alice.page.getByTestId('invite-code').innerText()).trim()
  log('alice code len:', code.length, 'prefix:', code.slice(0, 12))
  if (!code.startsWith('rascal1:')) throw new Error('bad invite code: ' + code.slice(0, 40))

  // Bob pastes it and sends the request
  await bob.page.getByTestId('add-input').fill(code)
  await bob.page.getByTestId('add-button').click()
  log('bob sent request, waiting for arrival on alice...')
  await alice.page.getByTestId('request-in').waitFor({ timeout: 180000 })
  log('REQUEST ARRIVED on alice')

  // Alice accepts
  await alice.page.getByTestId('accept-request').click()
  log('alice accepted')

  // Both see each other as friends
  await alice.page.getByText('BobE2E').first().waitFor({ timeout: 30000 })
  await bob.page.getByText('AliceE2E').first().waitFor({ timeout: 30000 })
  log('both list each other as friends')

  // Online presence both ways (may take a bit for DM room handshake)
  await alice.page.locator('[data-testid="friend-row"] span[title="online"]').first().waitFor({ timeout: 120000 })
  log('alice sees bob ONLINE')
  await bob.page.locator('[data-testid="friend-row"] span[title="online"]').first().waitFor({ timeout: 120000 })
  log('bob sees alice ONLINE')

  log('E2E PASS')
} catch (e) {
  failed = true
  log('E2E FAIL:', String(e && e.message ? e.message : e).slice(0, 500))
  try {
    const pages = browser.contexts().flatMap((c) => c.pages())
    for (let i = 0; i < pages.length; i++) {
      await pages[i].screenshot({ path: `e2e-fail-${i}.png` }).catch(() => {})
    }
    log('screenshots saved')
  } catch {}
}
await browser.close()
process.exit(failed ? 1 : 0)
