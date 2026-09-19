// Shared WebRTC room configuration.
// Signaling rides a curated set of reliable public Nostr relays (used ONLY to
// exchange connection offers — no chat content ever touches them). Both peers
// connect to ALL of them, so discovery only needs one working relay in common.
// Every relay below was verified writable (real signed event -> OK:true) on
// 2026-09-19; rejected ones: nostr.wine (account wall), noswhere (muted),
// nostr.band (unreachable). Re-check with scripts/probe-relays.mjs.
// TURN (when the user configures one in Settings) applies to every room so
// strict NATs fall back to relayed media instead of failing silently.

import { useApp } from '../store/app'
import { APP_ID } from './rooms'

export const SIGNAL_RELAYS = [
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://yabu.me',
  'wss://chorus.pjv.me',
  'wss://nostr.data.haus',
  'wss://relay.artio.inf.unibe.ch',
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
  }
  return opts
}
