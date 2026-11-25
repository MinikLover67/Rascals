// Pin down the flaky blank-UI trigger: reload with settings modal open vs
// closed, phone viewport, N iterations each. Reports buttons count after
// reload (blank = very few buttons) for each variant.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const URL = 'http://localhost:1420/'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'ignore' })
let up = false
for (let i = 0; i < 45 && !up; i++) {
  try { if ((await fetch(URL)).ok) { up = true; break } } catch {}
  await new Promise((r) => setTimeout(r, 2000))
}
if (!up) { vite.kill(); process.exit(1) }

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

async function oneRun(modalOpenAtReload, withWallpaper, idx) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('onboard-name').fill('Flick' + idx)
  await page.getByTestId('onboard-create').click()
  await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  const cl = page.getByTestId('changelog-continue')
  if (await cl.isVisible({ timeout: 3000 }).catch(() => false)) await cl.click()
  if (withWallpaper) {
    await page.locator('button[title^="Settings"]').first().click()
    await page.getByRole('button', { name: 'Appearance' }).click()
    await page.getByRole('button', { name: /^Image/ }).click()
    await page.locator('input[type="file"]').setInputFiles('/tmp/imgbug/photo.jpg')
    await page.waitForTimeout(1000)
    if (!modalOpenAtReload) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  } else if (!modalOpenAtReload) {
    // control: no wallpaper, modal closed
  } else {
    await page.locator('button[title^="Settings"]').first().click()
    await page.waitForTimeout(300)
  }
  const modalState = await page.evaluate(() => ({
    modal: !!document.querySelector('[data-testid="changelog-overlay"], .fixed.inset-0'),
    modalKind: document.querySelector('.fixed.inset-0') ? String(document.querySelector('.fixed.inset-0').className).slice(0, 40) : null,
  }))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const after = await page.evaluate(() => ({
    buttons: document.querySelectorAll('button').length,
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
  }))
  console.log(`wallpaper=${withWallpaper ? 1 : 0} modalOpen=${modalOpenAtReload ? 1 : 0}`,
    'pre-reload modal:', JSON.stringify(modalState), '→', JSON.stringify(after), errs.length ? 'ERRS: ' + errs[0] : '')
  await ctx.close()
}

let n = 0
for (const [wp, mo] of [[1, 0], [1, 0], [1, 1], [1, 1], [0, 1], [0, 1], [0, 0]]) {
  await oneRun(mo, wp, n++)
}
await browser.close()
vite.kill()
process.exit(0)
