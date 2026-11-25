// Phone web app E2E: serve single-file/rascals-web.html over HTTP (exactly
// what the desktop's built-in server does) and drive the real phone flow at
// 375x667: onboarding, seeded chat, send, wallpaper image (baked blur —
// no fullscreen CSS filter), settings. Screenshots to /tmp/phone-e2e/.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
mkdirSync('/tmp/phone-e2e', { recursive: true })

const HTML = readFileSync('single-file/rascals-web.html')
const srv = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(HTML)
})
await new Promise((r) => srv.listen(46123, r))
console.log('static server UP on :46123')

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))

const URL = 'http://localhost:46123/'

// The What's-New modal mounts after the profile loads — wait for it and
// dismiss; if something re-shows it (stale baked version), clear it again.
async function dismissChangelog() {
  const cl = page.getByTestId('changelog-continue')
  if (await cl.isVisible({ timeout: 6000 }).catch(() => false)) await cl.click()
  await page.waitForTimeout(300)
  if (await cl.isVisible({ timeout: 1500 }).catch(() => false)) await cl.click()
  await page.waitForTimeout(200)
}

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.getByTestId('onboard-name').fill('Miki')
await page.screenshot({ path: '/tmp/phone-e2e/1-onboard.png' })
await page.getByTestId('onboard-create').click()
await page.getByTestId('show-code').waitFor({ timeout: 30000 })
await dismissChangelog()
console.log('onboarded on phone viewport')

// bottom nav exists (phone-native navigation)
const nav = await page.evaluate(() =>
  [...document.querySelectorAll('nav button')].map((b) => b.textContent?.trim()).filter(Boolean),
)
console.log('bottom nav:', JSON.stringify(nav))

// seed a chat, reload, open it — like the real paired phone would have
await page.evaluate(() => {
  localStorage.setItem('rascals.friends.v1', JSON.stringify([
    { userId: 'phone-vivi-peer', displayName: 'vivi', online: true, addedAt: Date.now() },
  ]))
  localStorage.setItem('rascals.messages.v2', JSON.stringify({
    'phone-vivi-peer': [{
      id: 'p1', friendId: 'phone-vivi-peer', mine: false, ts: Date.now() - 300000,
      rev: 1, body: 'phone check!', replyTo: null, editedAt: null, deleted: false, status: 'delivered',
    }],
  }))
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(700)
await dismissChangelog()
await page.getByTestId('friend-row').first().click()
await page.waitForTimeout(500)
await page.getByTestId('composer').fill('typing from my phone')
await page.screenshot({ path: '/tmp/phone-e2e/2-chat.png' })
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/phone-e2e/3-sent.png' })
console.log('chat + send OK on phone')

// wallpaper image mode through the REAL upload path — baked blur, no
// fullscreen CSS filter (the desktop break must not exist on phone either)
// Settings opens from the phone bottom nav (same as a thumb tap).
await page.locator('nav button[aria-label="Settings"]').click({ timeout: 6000 })
await dismissChangelog()
await page.getByRole('button', { name: 'Appearance' }).click({ timeout: 6000 })
await page.waitForTimeout(300)
// the mode buttons sit below the fold on a phone — click via JS if needed
await page.getByRole('button', { name: /^Image/ }).click({ timeout: 4000 }).catch(async () => {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').startsWith('Image'))
    btn?.click()
  })
})
await page.waitForTimeout(400)
const dbg = await page.evaluate(() => ({
  inputs: [...document.querySelectorAll('input[type="file"]')].map((i) => ({
    cls: String(i.className).slice(0, 20), accept: i.accept, parent: String(i.parentElement?.textContent).slice(0, 30),
  })),
  preview: !!document.querySelector('[data-testid="bg-preview"]'),
  modalText: (document.querySelector('.z-50')?.textContent || '').slice(0, 80).replace(/\s+/g, ' '),
}))
console.log('file inputs before setInputFiles:', JSON.stringify(dbg, null, 1))
// the chat's hidden file-input also exists behind the modal — target the
// bg picker by its unique accept attribute
await page.locator('input[type="file"][accept="image/*"]').setInputFiles('scripts/fixtures-wallpaper-test.jpg')
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/phone-e2e/4-wallpaper-set.png' })
const wp = await page.evaluate(() => {
  const blurred = [...document.querySelectorAll('div')]
    .filter((d) => /blur\(/.test(getComputedStyle(d).filter))
    .filter((d) => {
      const r = d.getBoundingClientRect()
      return r.width > innerWidth * 0.8 && r.height > innerHeight * 0.8
    }).length
  return { fullscreenBlurs: blurred, overflow: document.scrollingElement.scrollWidth - window.innerWidth }
})
console.log('wallpaper on phone:', JSON.stringify(wp))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/phone-e2e/5-final.png' })

console.log('page errors:', errs.length ? errs.slice(0, 3) : 'none')
await browser.close()
srv.close()
process.exit(0)
