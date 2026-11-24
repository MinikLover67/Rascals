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
  urls: string | string[]
  username?: string
  credential?: string
}

export interface RoomOpts {
  appId: string
  relayConfig: { urls: string[]; redundancy: number }
  turnConfig?: TurnServer[]
  rtcConfig?: { iceTransportPolicy?: RTCIceTransportPolicy; iceServers?: Array<{ urls: string | string[] }> }
}

/** Built-in TURN fallback (metered.ca "Open Relay Project", free public
 * service). Lets strict-NAT / firewall networks connect out of the box and
 * makes "Hide my IP" usable without self-hosting. Trade-off: media can
 * traverse a third-party relay (still E2E-encrypted by Rascals' own layer).
 * Users who want zero third parties can turn it off or set their own TURN. */
export const BUILTIN_TURN: TurnServer = {
  urls: [
    'turn:openrelay.metered.ca:80',
    'turn:openrelay.metered.ca:443',
    'turn:openrelay.metered.ca:443?transport=tcp',
  ],
  username: 'openrelayproject',
  credential: 'openrelayproject',
}

/** Room options from explicit settings (param, not store import — keeps the
 * module graph acyclic: store -> p2p -> relays, never back). */
export function roomOpts(t: {
  turnUrl: string
  turnUser: string
  turnPass: string
  hideIp: boolean
  /** Use the built-in public TURN when no personal TURN is configured. */
  defaultTurn: boolean
}): RoomOpts {
  const opts: RoomOpts = {
    appId: APP_ID,
    // 7-of-11 redundancy: every signaling message goes to 7 relays, not all
    // 11 — halves per-peer relay load while any-common-relay discovery still
    // holds (two users share 7 relays with ~99.99% probability).
    relayConfig: { urls: SIGNAL_RELAYS, redundancy: 7 },
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
  if (t.hideIp && t.defaultTurn) {
    // Relay-only through the built-in TURN: hide IP works with zero setup.
    opts.turnConfig = [BUILTIN_TURN]
    opts.rtcConfig = { iceTransportPolicy: 'relay' }
    return opts
  }
  if (!t.hideIp) {
    // Default path: free public STUN so server-reflexive candidates exist.
    // Without this, same-NAT peers only get host candidates and many
    // consumer routers still fail to connect them. Skipped under hideIp
    // (a STUN query would itself reveal your IP to Google). The built-in
    // TURN (when enabled) sits on top as a fallback candidate for strict
    // NATs — ICE only uses it if direct paths fail.
    opts.rtcConfig = {
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun.relay.metered.ca:80'] },
        ...(t.defaultTurn ? [BUILTIN_TURN] : []),
      ],
    }
  }
  return opts
}
