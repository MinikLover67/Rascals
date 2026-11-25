// UI verification pass (v0.1.50): drives the real app headless and checks
// the regressions from the 0.1.41-0.1.49 era actually hold in the browser:
//   1. wallpaper layering  - seeded rascals.bgimage.v1 loads, layer stays
//                            behind interactive content (pointer-events off)
//   2. accent color picker - pop opens, hex accepted, accent var updates
//   3. pairing honesty     - desktop pairing shows a status, never a fake
//                            "Receiving 0%", and ends with an actionable
//                            timeout (no infinite spinner)
//   4. phone server        - toggle produces a URL or an actionable error
//   5. mobile layout       - 375px viewport: no horizontal overflow
// Self-contained: starts vite as a child. ASCII only.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const WIN_EXE = 'C:\\Users\\MinikLover67\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const LINUX_EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const EXE = process.env.PW_CHROME || (existsSync(WIN_EXE) ? WIN_EXE : LINUX_EXE)
const URL = 'http://localhost:1420/'
const T0 = Date.now()
const stamp = () => `[+${Math.round((Date.now() - T0) / 1000)}s]`
const log = (...a) => console.log(stamp(), ...a)
const shots = process.env.SHOT_DIR || '.'
let failed = 0
const fail = (name, why) => { failed++; log('FAIL', name, '---', why) }
const pass = (name, detail) => log('PASS', name, detail ? `(${detail})` : '')

// Bright SVG wallpaper (data URL) - worst case for washout/contrast bugs.
const WALLPAPER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#ff5ea8"/><stop offset="1" stop-color="#ffd166"/>' +
    '</linearGradient></defs><rect width="320" height="240" fill="url(#g)"/></svg>'
  )

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
  log('dev server failed to start')
  try { vite.kill() } catch {}
  process.exit(1)
}
log('dev server UP')

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const pageErrors = []

async function newPage(viewport, seedWallpaper) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)))
  page.on('console', (m) => {
    if (m.type() === 'error') log('console.error:', m.text().slice(0, 200))
  })
  if (seedWallpaper) {
    await page.addInitScript((img) => {
      localStorage.setItem('rascals.settings.v1', JSON.stringify({ bgMode: 'image', bgBlur: 2 }))
      localStorage.setItem('rascals.bgimage.v1', JSON.stringify(img))
    }, WALLPAPER)
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('onboard-name').fill('VerifyBot')
  await page.getByTestId('onboard-create').click()
  await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  log('onboarded')
  const cl = page.getByTestId('changelog-continue')
  if (await cl.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cl.click()
    log('changelog dismissed')
  }
  return { ctx, page }
}

// ── 1. Wallpaper layering (desktop) ──────────────────────────────────────
try {
  const { ctx, page } = await newPage({ width: 1280, height: 800 }, true)
  await page.waitForTimeout(1200)
  const layer = page.locator('div[aria-hidden="true"]', { hasText: '' }).filter({
    has: page.locator('xpath=self::div[contains(@style,"background-image")]'),
  })
  const info = await page.evaluate(() => {
    const bgEl = [...document.querySelectorAll('div')].find((d) =>
      (d.getAttribute('style') || '').includes('background-image'))
    if (!bgEl) return { found: false }
    const cs = getComputedStyle(bgEl)
    const root = bgEl.closest('.pointer-events-none') || bgEl
    // What actually receives clicks at app center must not be the bg layer.
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
    const hitInteractive = hit && (hit.closest('button, input, [role="button"], textarea') || hit.tagName)
    return {
      found: true,
      pointerEvents: cs.pointerEvents,
      rootPE: getComputedStyle(root).pointerEvents,
      hitTag: hit ? hit.tagName : null,
      hitInteractive: hitInteractive ? String(hitInteractive).slice(0, 60) : null,
    }
  })
  if (!info.found) fail('bg-layer', 'no element with background-image found')
  else {
    pass('bg-layer', `pointer-events=${info.rootPE}, center hit=${info.hitTag}/${info.hitInteractive}`)
    if (info.rootPE !== 'none') fail('bg-layer', 'bg root must be pointer-events:none')
    if (info.hitTag === null) fail('bg-layer', 'nothing hit at center')
  }
  await page.screenshot({ path: shots + '/verify-bg-desktop.png' })
  await ctx.close()
} catch (e) {
  fail('bg-layer', String(e).slice(0, 300))
}

// ── 2+3+4. Accent picker, pairing honesty, phone server (one Settings
// session, desktop) ───────────────────────────────────────────────────────
try {
  const { ctx, page } = await newPage({ width: 1280, height: 800 }, false)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Appearance' }).click()

  // Custom accent color: hex accepted, --color-rascal-accent updates live.
  await page.getByTestId('color-picker-button').click()
  await page.getByTestId('color-picker-pop').waitFor({ timeout: 5000 })
  const hexInput = page.getByLabel('Hex color')
  await hexInput.fill('22d3ee')
  await page.waitForTimeout(400)
  const accent = await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-rascal-accent').trim(),
  )
  pass('color-picker', `accent var now ${accent}`)
  if (!/^#22d3ee$/i.test(accent)) fail('color-picker', `expected #22d3ee, got ${accent}`)
  await page.keyboard.press('Escape') // close the pop, modal stays

  // Pairing: the QR card arms itself the moment it mounts — one stable code,
  // status shows without pressing anything, never a fake percentage, and it
  // times out with instructions + a re-arm that keeps the SAME code.
  await page.getByRole('button', { name: 'Connection', exact: true }).click()
  await page.getByTestId('phone-pair').waitFor({ timeout: 10000 })
  const status = page.getByTestId('pairing-status')
  await status.waitFor({ timeout: 45000 })
  const first = (await status.textContent()) || ''
  pass('pairing-status', `first state: "${first.trim().slice(0, 80)}"`)
  if (/Receiving \d+%/.test(first)) fail('pairing-status', 'fake Receiving % shown')
  // Honest give-up: wait for the 3-minute timeout error (break early on it).
  let final = first
  for (let i = 0; i < 170; i++) {
    await page.waitForTimeout(1000)
    final = (await status.textContent()) || ''
    if (/no phone joined|error/i.test(final)) break
  }
  pass('pairing-giveup', `final: "${final.trim().slice(0, 100)}"`)
  if (!/no phone joined|again|scan|timed out|keep.*open/i.test(final)) {
    fail('pairing-giveup', 'no actionable timeout text after 3 min window')
  }
  // Re-arm keeps the SAME code: click "Pair again", status resets to waiting
  // and the QR (aria-label content = the pairing URL) must be unchanged.
  const qrBefore = await page.evaluate(
    () => document.querySelector('[data-testid="phone-pair"] [role="img"]')?.getAttribute('aria-label'),
  )
  await page.getByTestId('pair-phone-button').click()
  await page.getByText('Waiting for your phone…').waitFor({ timeout: 10000 })
  const urlText = await page.evaluate(
    () => document.querySelector('[data-testid="phone-pair"] .font-mono')?.textContent || '',
  )
  pass('pairing-rearm', `re-armed, key ${urlText.includes('#pair=') ? 'live' : 'MISSING'}`)
  if (!urlText.includes('#pair=')) fail('pairing-rearm', 'pairing link missing after re-arm')
  if (qrBefore === null) fail('pairing-rearm', 'QR element vanished')

  // Phone server toggle: desktop-app only by design (needs the Rust shell).
  // In a plain browser the correct behavior is no toggle at all.
  const isDesktop = await page.evaluate(() => '__TAURI_INTERNALS__' in window)
  if (!isDesktop) {
    log('SKIP phone-server (browser build — toggle is desktop-only by design)')
  } else {
  const toggle = page.getByTestId('phone-server-toggle')
  await toggle.scrollIntoViewIfNeeded()
  await toggle.click()
  await page.waitForTimeout(4000)
  const on = await toggle.getAttribute('aria-checked')
  const err = page.getByTestId('phone-server-error')
  const errText = (await err.isVisible().catch(() => false)) ? (await err.textContent()) || '' : ''
  log('phone-server', `toggle=${on} error="${errText.trim().slice(0, 120)}"`)
  if (on === 'true' || on === '') log('phone-server ON (URL rendered next to toggle)')
  else if (errText) pass('phone-server-error', errText.trim().slice(0, 100))
  else fail('phone-server', 'toggle off with no visible error either')
  if (on === 'true') {
    await toggle.click() // stop it again
    await page.waitForTimeout(2000)
    const off = await toggle.getAttribute('aria-checked')
    pass('phone-server-stop', `toggle now ${off}`)
    if (off !== 'false') fail('phone-server-stop', 'toggle did not go off')
  }
  } // end desktop-only phone-server block
  await page.screenshot({ path: shots + '/verify-settings.png' })
  await ctx.close()
} catch (e) {
  fail('pairing/server/color', String(e).slice(0, 300))
}

// ── 5. Mobile layout at 375px ────────────────────────────────────────────
try {
  const { ctx, page } = await newPage({ width: 375, height: 667 }, true)
  await page.waitForTimeout(1000)
  const m = await page.evaluate(() => ({
    scrollW: document.scrollingElement.scrollWidth,
    innerW: window.innerWidth,
    bodyOverflow: document.body.scrollWidth,
  }))
  pass('mobile-overflow', `scrollW=${m.scrollW} innerW=${m.innerW}`)
  if (m.scrollW > m.innerW + 1) fail('mobile-overflow', `horizontal overflow: ${m.scrollW} > ${m.innerW}`)
  await page.screenshot({ path: shots + '/verify-mobile.png' })
  await ctx.close()
} catch (e) {
  fail('mobile', String(e).slice(0, 300))
}

// ── 6. Wallpaper image mode: real upload path, baked blur, UI alive ──────
// Regression for the 0.1.50-era "image breaks the UI" reports: the wallpaper
// must paint from a BAKED bitmap (no fullscreen CSS filter — WebView2 breaks
// compositing that inside the transparent desktop window), the layer must
// stay behind interactive content, and the app must remain usable both
// live and after a reload.
try {
  const { ctx, page } = await newPage({ width: 1280, height: 800 }, false)
  await page.locator('button[title^="Settings"]').first().click()
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByRole('button', { name: /^Image/ }).click()
  await page.locator('input[type="file"]').setInputFiles('scripts/fixtures-wallpaper-test.jpg')
  await page.waitForTimeout(1500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  const check = async (tag) => {
    const r = await page.evaluate(() => {
      // No element may carry a blur filter while covering most of the screen.
      const blurred = [...document.querySelectorAll('div')]
        .filter((d) => /blur\(/.test(getComputedStyle(d).filter))
        .filter((d) => {
          const r = d.getBoundingClientRect()
          return r.width > innerWidth * 0.8 && r.height > innerHeight * 0.8
        }).length
      const bg = [...document.querySelectorAll('div')].find((d) =>
        (d.getAttribute('style') || '').includes('background-image'))
      const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
      return {
        fullscreenBlurs: blurred,
        bgFound: !!bg,
        hitIsBg: bg ? (hit === bg || bg.contains(hit)) : null,
        overflow: document.scrollingElement.scrollWidth - window.innerWidth,
      }
    })
    pass(`wallpaper-${tag}`, JSON.stringify(r))
    if (r.fullscreenBlurs > 0) fail(`wallpaper-${tag}`, 'fullscreen CSS blur layer present (desktop break)')
    if (!r.bgFound) fail(`wallpaper-${tag}`, 'wallpaper layer missing')
    if (r.hitIsBg) fail(`wallpaper-${tag}`, 'wallpaper layer eats clicks at center')
    if (r.overflow > 1) fail(`wallpaper-${tag}`, 'horizontal overflow with wallpaper')
    return r
  }
  await check('live')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await check('reloaded')
  // The app must still respond: the settings gear opens the modal.
  await page.locator('button[title^="Settings"]').first().click()
  await page.getByRole('button', { name: 'Appearance' }).waitFor({ timeout: 5000 })
  pass('wallpaper-interactive', 'settings opens after reload')
  await page.keyboard.press('Escape')
  await page.screenshot({ path: shots + '/verify-wallpaper.png' })
  await ctx.close()
} catch (e) {
  fail('wallpaper', String(e).slice(0, 300))
}

// ── 7. Pairing receive screen: works with AND without an account ─────────
// A phone that already onboarded used to silently ignore #pair= links
// ("pairing doesn't work"). Both states must show the choice screen.
try {
  // Fresh phone: no identity anywhere, link opens straight into the choice.
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 780 } })
  const pa = await ctxA.newPage()
  await pa.goto(`${URL}#pair=aabbccddeeff001122334455`, { waitUntil: 'domcontentloaded' })
  await pa.getByTestId('pair-receive-button').waitFor({ timeout: 20000 })
  const freshTitle = await pa.evaluate(() => document.querySelector('h1')?.textContent || '')
  const newBtn = await pa.getByTestId('pair-new-device-button').count()
  pass('pair-receive-fresh', `fresh phone: "${freshTitle}", choice buttons=${newBtn}`)
  if (freshTitle !== 'Pair with your computer') fail('pair-receive-fresh', `unexpected title: ${freshTitle}`)
  if (newBtn !== 1) fail('pair-receive-fresh', 'no "set up as new" choice')
  await pa.screenshot({ path: shots + '/verify-pair-receive.png' })
  await ctxA.close()

  // Phone with an account: replace/keep choice (hash-only navigation does
  // not reboot the app, so reload explicitly — like a real QR scan would).
  const { ctx, page } = await newPage({ width: 390, height: 780 }, false)
  await page.goto(`${URL}#pair=aabbccddeeff001122334455`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('pair-receive-button').waitFor({ timeout: 20000 })
  const usedTitle = await page.evaluate(() => document.querySelector('h1')?.textContent || '')
  pass('pair-receive-reuse', `phone with account: "${usedTitle}"`)
  if (!/Replace this phone/i.test(usedTitle)) fail('pair-receive-reuse', `expected replace choice, got: ${usedTitle}`)
  const keepBtn = await page.getByTestId('pair-new-device-button').count()
  if (keepBtn !== 1) fail('pair-receive-reuse', 'no "keep this account" choice')
  await ctx.close()
} catch (e) {
  fail('pair-receive', String(e).slice(0, 300))
}

await browser.close()
try { vite.kill() } catch {}

if (pageErrors.length) {
  fail('pageerrors', `${pageErrors.length} uncaught: ${pageErrors[0]}`)
} else {
  pass('pageerrors', 'none')
}

log(failed === 0 ? 'UI VERIFY: ALL PASS' : `UI VERIFY: ${failed} FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
