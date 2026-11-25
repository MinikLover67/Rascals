// Deep probe of the blank-UI-after-reload-with-wallpaper state:
// what's in the DOM, what's visible, what's transparent, any rejections.
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
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } })
const page = await ctx.newPage()
const logs = []
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e).slice(0, 300)))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 200)) })
page.on('unhandledrejection', (e) => logs.push('UNHANDLED: ' + String(e && e.reason).slice(0, 300)))

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.getByTestId('onboard-name').fill('DeepProbe')
await page.getByTestId('onboard-create').click()
await page.getByTestId('show-code').waitFor({ timeout: 30000 })
const cl = page.getByTestId('changelog-continue')
if (await cl.isVisible({ timeout: 3000 }).catch(() => false)) await cl.click()
// set wallpaper through settings (image mode)
await page.locator('button[title^="Settings"]').first().click()
await page.getByRole('button', { name: 'Appearance' }).click()
await page.getByRole('button', { name: /^Image/ }).click()
await page.locator('input[type="file"]').setInputFiles('/tmp/imgbug/photo.jpg')
await page.waitForTimeout(1200)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
// sanity: UI alive BEFORE reload?
const alive1 = await page.evaluate(() => document.querySelectorAll('button').length)
console.log('buttons before reload:', alive1)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
const alive2 = await page.evaluate(() => ({
  buttons: document.querySelectorAll('button').length,
  rootChildren: document.getElementById('root')?.children.length ?? -1,
  bodyText: (document.body.innerText || '').slice(0, 120).replace(/\n/g, ' | '),
  topLayers: [...document.querySelectorAll('#root > div > *')].slice(0, 8).map((el) => {
    const cs = getComputedStyle(el)
    return `${el.tagName}.${String(el.className).slice(0, 30)} pos=${cs.position} z=${cs.zIndex} op=${cs.opacity} bg=${cs.backgroundColor} pe=${cs.pointerEvents}`
  }),
}))
console.log('after reload:', JSON.stringify(alive2, null, 1))
console.log('logs:', logs.slice(0, 8))
await page.screenshot({ path: '/tmp/imgbug/phone-deep.png' })
await browser.close()
vite.kill()
process.exit(0)
