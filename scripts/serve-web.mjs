// Serves the static web build (dist-web) on Windows and Linux with no
// extra dependencies. SPA fallback serves index.html for unknown paths.
// Web auto-login: if the desktop app published a login (weblink.json in its
// private app-data dir), it is served at /rascals-account.json so browsers
// on THIS machine sign in automatically. Localhost only, never cached.
// Usage: node scripts/serve-web.mjs [--dir dist-web] [--port 4173] [--host 127.0.0.1]
//        [--account-file PATH] [--no-account]
import { createServer } from 'node:http'
import { stat } from 'node:fs/promises'
import { createReadStream, readFileSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { homedir, platform } from 'node:os'

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const root = resolve(flag('--dir', 'dist-web'))
const port = Number(flag('--port', process.env.PORT ?? '4173'))
const host = flag('--host', process.env.HOST ?? '127.0.0.1')
const noAccount = args.includes('--no-account')

// Same location the desktop app (Tauri app_data_dir, identifier
// com.rascals.chat) writes weblink.json to. Same OS user only.
function defaultAccountFile() {
  if (process.env.RASCALS_ACCOUNT_FILE) return resolve(process.env.RASCALS_ACCOUNT_FILE)
  const override = flag('--account-file', '')
  if (override) return resolve(override)
  if (platform() === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'com.rascals.chat', 'weblink.json')
  }
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'com.rascals.chat', 'weblink.json')
  }
  const xdg = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return join(xdg, 'com.rascals.chat', 'weblink.json')
}

const accountFile = noAccount ? null : defaultAccountFile()

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}

async function sendFile(res, path) {
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' })
  createReadStream(path).pipe(res)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    // Desktop-published auto-login. Same-origin fetch from the web app;
    // never cached, 404 when the desktop hasn't enabled it.
    if (url.pathname === '/rascals-account.json') {
      if (!accountFile) {
        res.writeHead(404).end('auto-login disabled')
        return
      }
      try {
        const text = readFileSync(accountFile, 'utf8')
        // Refuse to serve anything that isn't our own account format.
        const parsed = JSON.parse(text)
        if (!parsed || (parsed.app !== 'rascals-identity' && parsed.app !== 'rascals-snapshot')) {
          throw new Error('bad shape')
        }
        if (parsed.app === 'rascals-snapshot' && (typeof parsed.data !== 'object' || !parsed.data)) {
          throw new Error('bad shape')
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(text)
      } catch {
        res.writeHead(404).end('no desktop login published')
      }
      return
    }
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
    // Block path traversal — stay inside the web root.
    const file = resolve(join(root, rel))
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end('forbidden')
      return
    }
    try {
      const st = await stat(file)
      if (st.isDirectory()) return sendFile(res, join(file, 'index.html'))
      return sendFile(res, file)
    } catch {
      // SPA fallback: single-page app, unknown routes boot from index.html.
      const index = join(root, 'index.html')
      try {
        await stat(index)
        return sendFile(res, index)
      } catch {
        res.writeHead(404).end('not found — run `npm run build:web` first')
      }
    }
  } catch {
    res.writeHead(500).end('server error')
  }
})

server.on('error', (err) => {
  console.error(`serve-web: ${err.message}`)
  process.exit(1)
})

try {
  await stat(join(root, 'index.html'))
} catch {
  console.error(`serve-web: no web build at ${root} — run \`npm run build:web\` first.`)
  process.exit(1)
}

server.listen(port, host, () => {
  console.log(`Rascals web: http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (serving ${root})`)
  try {
    if (accountFile) {
      stat(accountFile).then(
        () => console.log('Web auto-login: ON (desktop login found)'),
        () => console.log('Web auto-login: off (enable it in desktop Settings)'),
      )
    }
  } catch {
    // status line is garnish
  }
})
