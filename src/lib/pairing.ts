// Device pairing: push the whole account from the desktop to the phone.
// The desktop renders a QR of `origin#pair=<one-time key>`; the phone opens
// the same webapp through that link and joins a one-time Trystero room
// derived from the key. The desktop streams a full backup (identity + every
// data bucket) in 32 KB chunks — identical framing to the file protocol,
// staying well under the ~256 KB SCTP ceiling. The key in the QR is the only
// capability needed to receive, and it never touches a server.
import { joinRoom } from 'trystero'
import { roomOpts, type RoomOpts } from './relays'
import { exportBackup } from './backup'
import { useApp } from '../store/app'

const CHUNK = 32 * 1024
/** How long the desktop waits for a phone to scan before it gives up. */
const SENDER_TIMEOUT = 180_000
/** How long the phone waits in the room before declaring the PC gone. */
const RECEIVER_TIMEOUT = 120_000

/** One-time pairing room; the hex key (24 chars ≈ 96 bit) gates entry. */
function pairRoomFor(key: string): string {
  return `rascals-pair:${key}`
}

export interface PairingSenderStatus {
  phase: 'waiting' | 'sending' | 'done' | 'error'
  /** 0..1 while phase === 'sending' */
  progress?: number
  detail?: string
}

export type PairingLink = { key: string; url: string }

/** Build the QR payload the desktop shows: same webapp, pairing key in the
 *  hash (hash survives static hosting and is never sent to any server).
 *  `base` overrides the app URL — the desktop app passes its built-in phone
 *  server address (http://100.x.y.z:port over Tailscale) here. */
export function createPairingLink(base?: string): PairingLink {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const origin =
    base ?? window.location.origin + window.location.pathname
  const url = origin + '#pair=' + key
  return { key, url }
}

/** Desktop side: join the pairing room and stream the backup when the phone
 *  shows up. Status callbacks drive the UI; the room closes after the ack. */
export function runPairingSender(
  key: string,
  onStatus: (s: PairingSenderStatus) => void,
): void {
  const room = joinRoom(roomOpts(useApp.getState().settings) as RoomOpts, pairRoomFor(key))
  const offer = room.makeAction<{ key: string }>('p-offer')
  const chunk = room.makeAction<{ i: number; t: number; d: string }>('p-chunk')
  const done = room.makeAction<{ bytes: number }>('p-done')
  let sending = false
  let finished = false

  const giveUp = window.setTimeout(() => {
    if (!finished) {
      finished = true
      onStatus({ phase: 'error', detail: 'No phone joined within 3 minutes.' })
      void room.leave()
    }
  }, SENDER_TIMEOUT)

  const nudge = window.setTimeout(() => {
    if (!sending && !finished) {
      onStatus({ phase: 'waiting', detail: 'Still waiting — point the camera at the QR again.' })
    }
  }, 30_000)

  const ackAct = room.makeAction<{ ok: boolean; err?: string }>('p-ack')
  ackAct.onMessage = (msg) => {
    if (finished) return
    finished = true
    window.clearTimeout(giveUp)
    window.clearTimeout(nudge)
    void room.leave()
    onStatus(
      msg.ok
        ? { phase: 'done', detail: 'Account received — check your phone.' }
        : { phase: 'error', detail: msg.err ?? 'The phone rejected the transfer.' },
    )
  }

  room.onPeerJoin = (peerId: string) => {
    if (finished || sending) return
    sending = true
    window.clearTimeout(nudge)
    onStatus({ phase: 'waiting', detail: 'Phone connected — preparing transfer…' })
    void (async () => {
      const backup = await exportBackup().catch(() => null)
      if (!backup || finished) {
        if (!finished) {
          finished = true
          onStatus({ phase: 'error', detail: 'Could not serialize your data.' })
          void room.leave()
        }
        return
      }
      const total = Math.ceil(backup.length / CHUNK)
      // Sequential sends keep the SCTP queue shallow, like the file protocol.
      for (let i = 0; i < total; i++) {
        if (finished) return
        await chunk.send({ i, t: total, d: backup.slice(i * CHUNK, (i + 1) * CHUNK) }, { target: peerId })
        onStatus({ phase: 'sending', progress: (i + 1) / total })
      }
      if (finished) return
      await done.send({ bytes: backup.length }, { target: peerId })
    })().catch((e) => {
      if (!finished) {
        finished = true
        window.clearTimeout(giveUp)
        onStatus({ phase: 'error', detail: `Transfer failed: ${String(e)}` })
        void room.leave()
      }
    })
  }
  void offer
}

export interface PairingReceiverStatus {
  phase: 'connecting' | 'receiving' | 'done' | 'error'
  progress?: number
  detail?: string
}
/** Phone side: wait in the pairing room, take the backup stream, return the
 *  full backup JSON string for importBackup(). */
export function receivePairing(
  key: string,
  onStatus: (s: PairingReceiverStatus) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const room = joinRoom(roomOpts(useApp.getState().settings) as RoomOpts, pairRoomFor(key))
    const chunks = new Map<number, string>()
    let total = 0
    let bytes = 0
    let settled = false
    let gotOffer = false

    const ready = room.makeAction<Record<string, never>>('p-ready')
    const ack = room.makeAction<{ ok: boolean; err?: string }>('p-ack')

    const cleanup = () => {
      void room.leave()
    }
    const fail = (detail: string, err = new Error(detail)) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      onStatus({ phase: 'error', detail })
      cleanup()
      reject(err)
    }

    const timer = window.setTimeout(() => {
      fail(
        gotOffer
          ? 'The transfer stalled halfway — check that both devices are online and try again.'
          : 'No offer from the computer in 2 minutes. Keep this screen open, press "Pair my phone" on the computer again, and scan the fresh QR.',
      )
    }, RECEIVER_TIMEOUT)

    const chunkAct = room.makeAction<{ i: number; t: number; d: string }>('p-chunk')
    // WebRTC takes a moment to negotiate — tell the phone the computer is
    // actually there, otherwise it sits on a bare "waiting" screen and
    // nobody knows whether the QR did anything.
    room.onPeerJoin = () => {
      if (settled) return
      onStatus({
        phase: 'connecting',
        detail: 'Computer found — opening the data line…',
      })
    }
    chunkAct.onMessage = (msg) => {
      if (settled || chunks.has(msg.i)) return
      chunks.set(msg.i, msg.d)
      bytes += msg.d.length
      total = Math.max(total, msg.t)
      onStatus({
        phase: 'receiving',
        progress: chunks.size / msg.t,
        detail: `${(bytes / 1024).toFixed(0)} KB received`,
      })
    }

    const doneAct = room.makeAction<{ bytes: number }>('p-done')
    doneAct.onMessage = () => {
      if (settled) return
      const text = Array.from({ length: total }, (_, i) => chunks.get(i) ?? '').join('')
      try {
        const parsed = JSON.parse(text) as { app?: string }
        if (parsed.app !== 'rascals-backup-full' && parsed.app !== 'rascals-identity') {
          throw new Error('unexpected payload')
        }
      } catch {
        void ack.send({ ok: false, err: 'Transfer arrived corrupted.' })
        fail('Transfer arrived corrupted — try again.')
        return
      }
      settled = true
      window.clearTimeout(timer)
      onStatus({ phase: 'done' })
      void ack.send({ ok: true })
      cleanup()
      resolve(text)
    }

    const offerAct = room.makeAction<{ key: string }>('p-offer')
    offerAct.onMessage = () => {
      if (gotOffer || settled) return
      gotOffer = true
      onStatus({ phase: 'receiving', progress: 0, detail: 'Connected — waiting for data…' })
      void ready.send({})
    }

    room.onPeerLeave = () => {
      // Sender side left without a done marker — the timeout decides whether
      // this was a stall or a cancelled transfer.
    }
  })
}

/** True when this browser was opened through a pairing QR link. */
export function pairingKeyFromUrl(): string | null {
  const m = window.location.hash.match(/^#pair=([0-9a-f]{24})$/)
  return m ? m[1] : null
}

export function clearPairingHash(): void {
  if (window.location.hash.startsWith('#pair=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}
