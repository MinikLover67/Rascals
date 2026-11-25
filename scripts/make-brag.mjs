// Brag GIF capture (v0.1.52): drives the REAL app headless and screenshots
// every beat of a true demo flow — onboarding, invite code, a real seeded
// conversation, live typing + send, accent + acrylic settings. No text
// cards, no floating icons: every pixel is the actual product UI.
// Frames land in /tmp/brag as sequential PNGs. ASCII only.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const WIN_EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const LINUX_EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const EXE = process.env.PW_CHROME || (existsSync(WIN_EXE) ? WIN_EXE : LINUX_EXE)
const URL = 'http://localhost:1420/'
const OUT = process.env.SHOT_DIR || '/tmp/brag'
mkdirSync(OUT, { recursive: true })

let frame = 0
const snap = async (page, ms = 260) => {
  await page.waitForTimeout(ms)
  frame++
  await page.screenshot({
    path: `${OUT}/${String(frame).padStart(4, '0')}.png`,
    type: 'png',
  })
}

log('starting dev server...')
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'ignore' })
let up = false
for (let i = 0; i < 45 && !up; i++) {
  try { if ((await fetch(URL)).ok) { up = true; break } } catch {}
  await new Promise((r) => setTimeout(r, 2000))
}
if (!up) { log('dev server failed'); vite.kill(); process.exit(1) }
log('dev server UP')

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()

// Fake cursor so clicks read on film.
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div')
    c.id = 'demo-cursor'
    c.style.cssText =
      'position:fixed;top:0;left:0;width:16px;height:16px;border-radius:50%;' +
      'background:#7c6cff;box-shadow:0 0 0 4px rgb(124 108 255 / 0.28);' +
      'z-index:999999;pointer-events:none;transition:transform 140ms ease-out;'
    document.body.appendChild(c)
    window.moveCursor = (x, y) => {
      c.style.transform = `translate(${x - 8}px, ${y - 8}px)`
    }
  })
})
// Start the cursor mid-screen; the init script adds it after DOM ready.
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => window.moveCursor(640, 400))

async function clickAt(locator, page) {
  const box = await locator.boundingBox()
  if (box) await page.evaluate((b) => window.moveCursor(b.x + b.width / 2, b.y + b.height / 2), box)
  await page.waitForTimeout(180)
  await locator.click()
}

// ── onboarding ──────────────────────────────────────────────────────────
await page.getByTestId('onboard-name').fill('Miki')
await snap(page, 200)
await clickAt(page.getByTestId('onboard-create'), page)
await page.getByTestId('show-code').waitFor({ timeout: 30000 })
const cl = page.getByTestId('changelog-continue')
if (await cl.isVisible({ timeout: 3000 }).catch(() => false)) await cl.click()

// ── invite code card ────────────────────────────────────────────────────
await clickAt(page.getByTestId('show-code'), page)
await snap(page, 500)
await snap(page)
await page.keyboard.press('Escape')
await snap(page, 150)

// ── seed a believable conversation with vivi, then open it ──────────────
await page.evaluate(() => {
  const id = JSON.parse(localStorage.getItem('rascals.identity.v1'))
  const vid = 'v1v1v1v1-vivi-demo-peer'
  const now = Date.now()
  const m = (mine, body, minAgo, status = 'delivered') => ({
    id: `demo-${minAgo}-${mine ? 'me' : 'vi'}`,
    friendId: vid,
    mine,
    ts: now - minAgo * 60000,
    rev: 1,
    body,
    replyTo: null,
    editedAt: null,
    deleted: false,
    status,
  })
  localStorage.setItem('rascals.friends.v1', JSON.stringify([
    { userId: vid, displayName: 'vivi', online: true, addedAt: now - 86400000 },
  ]))
  localStorage.setItem('rascals.messages.v2', JSON.stringify({
    [vid]: [
      m(false, 'so this really has no server?', 14),
      m(true, 'none. messages go straight to you', 13),
      m(false, 'and the invites? just a code?', 11),
      m(true, 'scan the qr and we are talking', 10),
      m(false, 'ok that is actually wild', 6),
      m(true, 'wait till you try the file drop', 5),
    ],
  }))
  localStorage.setItem('rascals.drafts.v1', '{}')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(600)
// the What's-New gate can re-show after a reload — clear it if present
const cl2 = page.getByTestId('changelog-continue')
if (await cl2.isVisible({ timeout: 2000 }).catch(() => false)) await cl2.click()
// Home shows the friends sidebar (fresh boot lands on the groups view)
await clickAt(page.locator('button[title="Home - friends and groups"]'), page)
await page.waitForTimeout(300)
// open vivi's chat: the friend row button opens the conversation
await clickAt(page.getByTestId('friend-row').first(), page)
await snap(page, 500)
await snap(page, 320)

// ── live typing + send ──────────────────────────────────────────────────
const input = page.getByTestId('composer')
await input.click()
const line = 'no servers. no accounts. just us'
for (let i = 1; i <= line.length; i++) {
  await input.pressSequentially(line[i - 1], { delay: 18 })
  if (i % 4 === 0) await snap(page, 40)
}
await snap(page, 300)
await page.keyboard.press('Enter')
await snap(page, 200)
await snap(page, 900) // delivered tick appears
await snap(page, 200)

// ── settings: accent + acrylic (gear in the chat header) ────────────────
await clickAt(page.locator('button[title="Settings"]'), page)
await snap(page, 220)
await clickAt(page.getByRole('button', { name: 'Appearance' }), page)
await snap(page, 420)
await clickAt(page.getByTestId('color-picker-button'), page)
await snap(page, 320)
await page.getByLabel('Hex color').fill('e0568d')
await page.waitForTimeout(200)
await snap(page, 260)
await page.keyboard.press('Escape')
await snap(page, 180)
// acrylic mode — click via JS; the option lives below the fold in the
// settings scroll and a Playwright visibility check can miss it
await page.waitForTimeout(200)
try {
  await page.evaluate(() => document.querySelector('[data-testid="bg-mode-acrylic"]')?.click())
  await page.waitForTimeout(400)
  await snap(page, 400)
  await snap(page, 300)
} catch (e) {
  log('acrylic scene skipped:', String(e).slice(0, 120))
}
await page.keyboard.press('Escape')
await snap(page, 260)
// closing modal — set accent affects chat; final beat with new accent
const input2 = page.locator('textarea, [contenteditable="true"]').first()
if (await input2.isVisible().catch(() => false)) {
  await input2.click()
  await input2.pressSequentially('see? even the accent is yours', { delay: 16 })
  await snap(page, 200)
  await page.keyboard.press('Enter')
  await snap(page, 200)
  await snap(page, 800)
}

await browser.close()
try { vite.kill() } catch {}
log(`done: ${frame} frames in ${OUT}`)
process.exit(0)

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a) }
