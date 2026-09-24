// Shared WebRTC room configuration.
// Signaling rides a curated set of reliable public Nostr relays (used ONLY to
// exchange connection offers — no chat content ever touches them). Both peers
// connect to ALL of them, so discovery only needs one working relay in common.
// Every relay below verified writable (real signed event -> OK:true) on
// 2026-09-24. Removed as dead/read-only: chorus.pjv.me (DNS dead),
// relay.mostr.pub (dead), relay.mostro.network (read-only, useless for
// presence writes), nostr.wine (account wall), noswhere (muted),
// nostr.band (unreachable), damus.io (flaky 503s).

import { APP_ID } from './rooms'

const SIGNAL_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://yabu.me',
  'wss://relay.artio.inf.unibe.ch',
  'wss://nostr.data.haus',
  'wss://purplerelay.com',
  'wss://relay.sigit.io',
  'wss://relay02.lnfi.network',
  'wss://schnorr.me',
  'wss://strfry.shock.network',
]

export interface TurnServer {
  urls: string
  username?: string
  credential?: string
}

export interface RoomOpts {
  appId: string
  relayConfig: { urls: string[]; redundancy: number }
  turnConfig?: TurnServer[]
  rtcConfig?: { iceTransportPolicy?: RTCIceTransportPolicy; iceServers?: Array<{ urls: string | string[] }> }
}

/** Room options from explicit settings (param, not store import — keeps the
 * module graph acyclic: store -> p2p -> relays, never back). */
export function roomOpts(t: {
  turnUrl: string
  turnUser: string
  turnPass: string
  hideIp: boolean
}): RoomOpts {
  const opts: RoomOpts = {
    appId: APP_ID,
    relayConfig: { urls: SIGNAL_RELAYS, redundancy: SIGNAL_RELAYS.length },
  }
  if (t.turnUrl.trim()) {
    opts.turnConfig = [
      {
        urls: t.turnUrl.trim(),
        username: t.turnUser.trim() || undefined,
        credential: t.turnPass || undefined,
      },
    ]
    // Relay-only: no host/srflx candidates, so peers never learn your IP.
    // Useless without TURN (nothing to relay through), hence the coupling.
    if (t.hideIp) {
      opts.rtcConfig = { iceTransportPolicy: 'relay' }
    }
    return opts
  }
  if (!t.hideIp) {
    // Default path: free public STUN so server-reflexive candidates exist.
    // Without this, same-NAT peers only get host candidates and many
    // consumer routers still fail to connect them. Skipped under hideIp
    // (a STUN query would itself reveal your IP to Google).
    opts.rtcConfig = {
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.relay.metered.ca:80'] }],
    }
  }
  return opts
}
