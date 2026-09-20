// Nostr relay WRITABILITY probe: publishes a real signed ephemeral event
// and reports which relays answer OK:true. Handshake alone is not enough
// (some relays connect freely but reject writes).
import { schnorr } from '@noble/secp256k1'

const CANDIDATES = [
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://yabu.me',
  'wss://chorus.pjv.me',
  'wss://relay.artio.inf.unibe.ch',
  'wss://nostr.data.haus',
  'wss://purplerelay.com',
  'wss://relay.mostro.network',
  'wss://relay.sigit.io',
  'wss://relay02.lnfi.network',
  'wss://schnorr.me',
  'wss://strfry.shock.network',
]

const sk = crypto.getRandomValues(new Uint8Array(32))
const pub = Buffer.from(await schnorr.getPublicKey(sk)).toString('hex')

async function probe(url) {
  const result = { url, open: false, write: false, detail: '' }
  try {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('connect-timeout')), 10000)
      ws.onopen = () => { clearTimeout(to); resolve(0) }
      ws.onerror = () => { clearTimeout(to); reject(new Error('ws-error')) }
    })
    result.open = true
    const created = Math.floor(Date.now() / 1000)
    const ev = { kind: 20000, created_at: created, tags: [], content: 'rascals-probe', pubkey: pub }
    const idHex = Buffer.from(
      await crypto.subtle.digest('SHA-256', Buffer.from(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]))),
    ).toString('hex')
    const idBytes = Buffer.from(idHex, 'hex')
    const sig = Buffer.from(await schnorr.signAsync(idBytes, sk)).toString('hex')
    const verdict = await new Promise((resolve) => {
      const to = setTimeout(() => resolve('no-ok'), 8000)
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(String(m.data))
          if (msg[0] === 'OK') { clearTimeout(to); resolve(msg[2] === true ? 'OK-true' : 'OK-false:' + msg[3]) }
        } catch {}
      }
      ws.send(JSON.stringify(['EVENT', { ...ev, id: idHex, sig }]))
    })
    result.detail = verdict
    result.write = verdict === 'OK-true'
    try { ws.close() } catch {}
  } catch (e) {
    result.detail = String(e && e.message ? e.message : e).slice(0, 50)
  }
  return result
}

const rows = []
for (const url of CANDIDATES) {
  const r = await probe(url)
  rows.push(r)
  console.log((r.write ? 'WRITE' : r.open ? 'READ ' : 'DEAD ') + ' ' + url + '  ' + r.detail)
}
const good = rows.filter((r) => r.write).map((r) => r.url)
console.log('writable: ' + good.length + '/' + rows.length)
console.log(JSON.stringify(good))
process.exit(0)
