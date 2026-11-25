// Reproduce "image breaks the UI": drive the REAL upload path (file input),
// live-set without reload, then probe interaction + overflow at desktop and
// phone sizes. Screenshots to /tmp/imgbug/.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const URL = 'http://localhost:1420/'
mkdirSync('/tmp/imgbug', { recursive: true })

// A real-feeling 3000x2000 JPEG "photo" (busy gradient + shapes)
const png = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000">
     <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="#e74c8d"/><stop offset="1" stop-color="#f4d35e"/>
     </linearGradient></defs>
     <rect width="3000" height="2000" fill="url(#g)"/>
     ${Array.from({ length: 40 }, (_, i) =>
       `<circle cx="${(i * 767) % 3000}" cy="${(i * 533) % 2000}" r="${40 + (i % 7) * 30}" fill="#${((i * 97) % 900 + 100)}" opacity="0.5"/>`).join('')}
   </svg>`).toString()
writeFileSync('/tmp/imgbug/photo.png', png)

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'ignore' })
let up = false
for (let i = 0; i < 45 && !up; i++) {
  try { if ((await fetch(URL)).ok) { up = true; break } } catch {}
  await new Promise((r) => setTimeout(r, 2000))
}
if (!up) { console.log('dev server failed'); vite.kill(); process.exit(1) }
console.log('dev server UP')

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

async function probe(width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('onboard-name').fill('ImgProbe')
  await page.getByTestId('onboard-create').click()
  await page.getByTestId('show-code').waitFor({ timeout: 30000 })
  const cl = page.getByTestId('changelog-continue')
  if (await cl.isVisible({ timeout: 3000 }).catch(() => false)) await cl.click()
  // seed a friend + history so interaction probes are meaningful
  await page.evaluate(() => {
    localStorage.setItem('rascals.friends.v1', JSON.stringify([
      { userId: 'imgprobe-vivi-peer', displayName: 'vivi', online: true, addedAt: Date.now() },
    ]))
    localStorage.setItem('rascals.messages.v2', JSON.stringify({
      'imgprobe-vivi-peer': [{
        id: 'probe-1', friendId: 'imgprobe-vivi-peer', mine: false, ts: Date.now() - 60000,
        rev: 1, body: 'does the wallpaper break things?', replyTo: null, editedAt: null,
        deleted: false, status: 'delivered',
      }],
    }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)
  const cl2 = page.getByTestId('changelog-continue')
  if (await cl2.isVisible({ timeout: 2000 }).catch(() => false)) await cl2.click()
  await page.waitForTimeout(300)

  // Real upload path: settings → appearance → choose image (file input)
  const gear = page.locator('button[title^="Settings"]').first()
  await gear.click()
  await page.getByRole('button', { name: 'Appearance' }).click()
  // the file input mounts only after the "Image" mode is active
  await page.getByRole('button', { name: /^Image/ }).click()
  await page.waitForTimeout(300)
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles('/tmp/imgbug/photo.jpg')
  await page.waitForTimeout(1200) // decode + resize + store
  await page.screenshot({ path: `/tmp/imgbug/${label}-live-set.png` })

  // Close settings, probe the live app without reload
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `/tmp/imgbug/${label}-live-app.png` })

  const probe1 = await page.evaluate(() => {
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
    const bg = [...document.querySelectorAll('div')].find((d) =>
      (d.getAttribute('style') || '').includes('background-image'))
    const bgCs = bg ? getComputedStyle(bg) : null
    let rootPE = null
    if (bg) {
      const root = bg.closest('.pointer-events-none') || bg.parentElement
      rootPE = root ? getComputedStyle(root).pointerEvents : null
    }
    return {
      hit: hit ? hit.tagName + '/' + String(hit.className).slice(0, 40) : null,
      bgFound: !!bg,
      bgPE: bgCs ? bgCs.pointerEvents : null,
      rootPE,
      overflow: document.scrollingElement.scrollWidth - window.innerWidth,
      settingsBytes: (localStorage.getItem('rascals.bgimage.v1') || '').length,
    }
  })
  console.log(label, JSON.stringify(probe1, null, 1))

  // Try to actually interact: open a chat, type, click a friend row
  try {
    await page.getByTestId('friend-row').first().click({ timeout: 4000 })
    await page.waitForTimeout(400)
    console.log(label, 'friend-row click OK')
  } catch { console.log(label, 'friend-row click FAILED (image layer eating clicks?)') }

  // Reload persistence probe
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `/tmp/imgbug/${label}-reloaded.png` })
  const probe2 = await page.evaluate(() => {
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
    return {
      hit: hit ? hit.tagName : null,
      overflow: document.scrollingElement.scrollWidth - window.innerWidth,
    }
  })
  console.log(label, 'reloaded:', JSON.stringify(probe2))
  if (errors.length) console.log(label, 'PAGE ERRORS:', errors.slice(0, 3))
  await ctx.close()
}

await probe(1280, 800, 'desktop')
await probe(375, 667, 'phone')
await browser.close()
vite.kill()
process.exit(0)
