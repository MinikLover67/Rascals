// Shared WebRTC room configuration.
// Signaling rides a curated set of reliable public Nostr relays (used ONLY to
// exchange connection offers — no chat content ever touches them). Both peers
// connect to ALL of them, so discovery only needs one working relay in common.
// Every relay below was verified writable (real signed event -> OK:true) on
// 2026-09-19/20; rejected ones: nostr.wine (account wall), noswhere (muted),
// nostr.band (unreachable), damus.io (flaky 503s), mostr.pub (dead 301s),
// artio.inf.unibe.ch (flaky). Spares if any die: sigit.io, lnfi.network,
// schnorr.me, strfry.shock.network. Re-check with scripts/probe-relays.mjs.
// TURN (when the user configures one in Settings) applies to every room so
// strict NATs fall back to relayed media instead of failing silently.

import { useApp } from '../store/app'
import { APP_ID } from './rooms'

export const SIGNAL_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://yabu.me',
  'wss://chorus.pjv.me',
  'wss://nostr.data.haus',
  'wss://purplerelay.com',
  'wss://relay.mostro.network',
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
  rtcConfig?: { iceTransportPolicy?: RTCIceTransportPolicy }
}

export function roomOpts(): RoomOpts {
  const t = useApp.getState().settings
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
  }
  return opts
}
