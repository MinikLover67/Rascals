// Builds rascals-web.html: the web beta as ONE self-contained file.
// Inlines the CSS (fonts as base64 data URIs) and the JS bundle into
// dist-single/index.html. Output: single-file/rascals-web.html — runs
// from file:// or any static host with zero server-side assets.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist-single')
let html = readFileSync(join(dist, 'index.html'), 'utf8')

// CSS: find the stylesheet link, inline its content, embed fonts as data URIs.
html = html.replace(
  /<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/,
  (_, cssFile) => {
    let css = readFileSync(join(dist, 'assets', cssFile), 'utf8')
    // Font urls come out as url(./Font.ttf) — relative to the CSS file,
    // i.e. dist-single/assets/. Vite only rewrites the path, it does not
    // inline files this large, so we do it here.
    css = css.replace(/url\(\.?\/?([^)]+\.ttf)\)/g, (_, file) => {
      const font = readFileSync(join(dist, 'assets', file))
      return `url(data:font/ttf;base64,${font.toString('base64')})`
    })
    return `<style>\n${css}\n</style>`
  },
)

// JS: inline the module bundle.
html = html.replace(
  /<script type="module"[^>]*src="\.\/assets\/([^"]+)"[^>]*><\/script>/,
  (_, jsFile) => {
    const js = readFileSync(join(dist, 'assets', jsFile), 'utf8')
    // Guard against a literal </script> inside the bundle (would end the tag).
    return `<script type="module">\n${js.replace(/<\/script>/g, '<\\/script>')}\n</script>`
  },
)

if (html.includes('/assets/') || /\.ttf\)/.test(html)) {
  throw new Error('unresolved asset/font reference left in HTML — aborting')
}

const outDir = join(root, 'single-file')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, 'rascals-web.html')
writeFileSync(out, html)
console.log('wrote', out, `${(html.length / 1024 / 1024).toFixed(1)} MB`)
