// Persistent Nostr channel for presence + friend requests — independent of
// Trystero's peer discovery. Trystero's `send(data)` only reaches *locally
// discovered* peers, so when cross-network discovery fails (announce events
// don't cross), no hello/knock ever lands and both sides show each other
// offline. This channel publishes signed replaceable events (NIP-33,
// kind 30000) tagged `#r:<recipientUserId>` to a few durable relays. The
// recipient subscribes with no `since` and fetches the latest stored event
// on connect, plus live updates — so a hello arrives even if the peer's
// app was closed when it was sent, as long as both share one relay.
//
// Trust is unchanged: every payload carries the existing ed25519 `sig`
// verified by verifyHello(). The secp256k1 nostr key here only satisfies
// relays' event-signature requirement; it carries no identity weight.

import { schnorr, utils as secpUtils, hashes as secpHashes } from '@noble/secp256k1'
import { sha256 } from '@noble/hashes/sha2.js'
import { verifyHello } from './crypto'

secpHashes.sha256 = sha256

const KIND = 30000 // NIP-33 parameterized replaceable — relay stores only the latest per (pubkey, d-tag)
const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.sigit.io']
const KEY_STORAGE = 'rascals.nostr-key.v1'

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const hexToBytes = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface HelloPayload {
  v: number
  to: string
  userId: string
  name: string
  ts: number
  fv?: number
  sig: string
}

export interface NostrChannelCallbacks {
  onHello: (userId: string, displayName: string, ts?: number) => void
  onFriendRequest: (userId: string, displayName: string) => void
}

function getNostrKey(): { priv: string } {
  let priv = ''
  try {
    priv = localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    // storage unavailable — generate an ephemeral one for this session
  }
  const isValid = (hexPriv: string): boolean => {
    if (!/^[0-9a-f]{64}$/i.test(hexPriv)) return false
    try {
      return secpUtils.isValidSecretKey(hexToBytes(hexPriv))
    } catch {
      return false
    }
  }
  if (!isValid(priv)) {
    // randomSecretKey() returns a 32-byte Uint8Array in noble v3 — hex-encode
    // it so we can persist + reuse the same nostr key across sessions.
    priv = hex(secpUtils.randomSecretKey() as Uint8Array)
    try {
      localStorage.setItem(KEY_STORAGE, priv)
    } catch {
      // best effort
    }
  }
  return { priv }
}

function canonical(evt: Omit<NostrEvent, 'id' | 'sig'>): string {
  return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content])
}

async function signEvent(
  priv: string,
  kind: number,
  content: string,
  tags: string[][],
): Promise<NostrEvent> {
  const privBytes = hexToBytes(priv)
  const pubkey = hex(schnorr.getPublicKey(privBytes))
  const partial = { pubkey, created_at: Math.floor(Date.now() / 1000), kind, tags, content }
  const id = hex(await sha256(new TextEncoder().encode(canonical(partial))))
  const sig = hex(await schnorr.sign(hexToBytes(id), privBytes))
  return { ...partial, id, sig }
}

type Listener = (evt: NostrEvent) => void

// Minimal relay pool: one WebSocket per relay, auto-reconnect, fan-out EVENTs
// to all active subscriptions. Kept tiny on purpose — Trystero still owns the
// bulk transport; this only carries presence + friend-request beacons.
class RelayPool {
  private sockets = new Map<string, WebSocket>()
  private subs = new Map<string, { filter: object; listener: Listener }>()
  private subId = 0

  async connect(): Promise<void> {
    await Promise.allSettled(RELAYS.map((url) => this.open(url)))
  }

  private open(url: string): void {
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      return
    }
    this.sockets.set(url, ws)
    ws.onopen = () => {
      // (re)send all active subscriptions on (re)connect
      for (const [id, sub] of this.subs) {
        this.sendRaw(ws, JSON.stringify(['REQ', id, sub.filter]))
      }
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg[0] === 'EVENT' && msg[2] && this.subs.has(msg[1])) {
          this.subs.get(msg[1])!.listener(msg[2] as NostrEvent)
        }
        // OK / NOTICE / EOSE frames are intentionally ignored: presence is
        // fire-and-forget, and the next heartbeat re-publishes anyway.
      } catch {
        // ignore malformed frames
      }
    }
    ws.onclose = () => {
      this.sockets.delete(url)
      window.setTimeout(() => this.open(url), 5000) // backoff reconnect
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        // already closing
      }
    }
  }

  private sendRaw(ws: WebSocket, data: string): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(data)
  }

  subscribe(filter: object, listener: Listener): () => void {
    const id = `sub${this.subId++}`
    this.subs.set(id, { filter, listener })
    for (const ws of this.sockets.values()) this.sendRaw(ws, JSON.stringify(['REQ', id, filter]))
    return () => {
      this.subs.delete(id)
      for (const ws of this.sockets.values()) this.sendRaw(ws, JSON.stringify(['CLOSE', id]))
    }
  }

  publish(evt: NostrEvent): void {
    const data = JSON.stringify(['EVENT', evt])
    for (const ws of this.sockets.values()) this.sendRaw(ws, data)
  }

  close(): void {
    for (const ws of this.sockets.values()) {
      try {
        ws.close()
      } catch {
        // already closed
      }
    }
    this.sockets.clear()
    this.subs.clear()
  }
}

export class NostrChannel {
  private pool = new RelayPool()
  private priv: string
  private myUserId: string
  private cb: NostrChannelCallbacks
  private seen = new Set<string>()
  private unsub: (() => void) | null = null

  constructor(myUserId: string, cb: NostrChannelCallbacks) {
    const k = getNostrKey()
    this.priv = k.priv
    this.myUserId = myUserId
    this.cb = cb
  }

  async start(): Promise<void> {
    await this.pool.connect()
    // Subscribe to events addressed to me (tagged #r = myUserId). No `since`:
    // relays return the latest stored replaceable event per sender plus live
    // updates, so a hello sent while we were offline is fetched on connect.
    this.unsub = this.pool.subscribe(
      { kinds: [KIND], ['#r']: [this.myUserId] },
      (evt) => this.handle(evt),
    )
  }

  private async handle(evt: NostrEvent): Promise<void> {
    if (this.seen.has(evt.id)) return
    this.seen.add(evt.id)
    // cap the dedupe set so it can't grow forever
    if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-250))
    // Freshness gate: relays return the last STORED replaceable event per
    // sender on (re)subscribe — without this, a peer offline for hours would
    // replay their old beacon and light up as online. Live beacons arrive
    // every ~30 s, so anything older than 2 min is a replay.
    const ageSec = Math.floor(Date.now() / 1000) - evt.created_at
    if (ageSec > 120 || ageSec < -600) return // stale replay / clock far ahead
    let payload: HelloPayload
    try {
      payload = JSON.parse(evt.content)
    } catch {
      return
    }
    if (!payload || payload.v !== 1 || payload.to !== this.myUserId) return
    if (payload.userId === this.myUserId) return
    // Signed ts: reject payloads older than 5 min (generous clock-skew budget
    // for the sender) — the signature covers ts, so this cannot be forged.
    if (typeof payload.ts === 'number' && Date.now() - payload.ts > 300000) return
    const ok = await verifyHello(payload.userId, payload.name, payload.ts, payload.sig)
    if (!ok) return
    const d = evt.tags.find((t) => t[0] === 'd')?.[1] ?? ''
    if (d.startsWith('rascal-pres:')) {
      this.cb.onHello(payload.userId, payload.name, payload.ts)
    } else if (d.startsWith('rascal-freq:')) {
      this.cb.onFriendRequest(payload.userId, payload.name)
    }
  }

  /** Publish (or refresh) a presence beacon to a friend's channel. */
  async publishPresence(targetUserId: string, payload: HelloPayload): Promise<void> {
    const evt = await signEvent(this.priv, KIND, JSON.stringify(payload), [
      ['d', `rascal-pres:${targetUserId}`],
      ['r', targetUserId],
    ])
    this.pool.publish(evt)
  }

  /** Publish (or refresh) a friend-request beacon to a target's channel. */
  async publishFriendRequest(targetUserId: string, payload: HelloPayload): Promise<void> {
    const evt = await signEvent(this.priv, KIND, JSON.stringify(payload), [
      ['d', `rascal-freq:${targetUserId}`],
      ['r', targetUserId],
    ])
    this.pool.publish(evt)
  }

  /** Overwrite the friend-request beacon with an empty tombstone. */
  async removeFriendRequest(targetUserId: string): Promise<void> {
    const evt = await signEvent(this.priv, KIND, JSON.stringify({ removed: true }), [
      ['d', `rascal-freq:${targetUserId}`],
      ['r', targetUserId],
    ])
    this.pool.publish(evt)
  }

  stop(): void {
    this.unsub?.()
    this.pool.close()
  }
}
