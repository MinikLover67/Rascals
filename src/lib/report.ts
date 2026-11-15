// Connection diagnostics report: everything an AI (or human) needs to figure
// out why invites/presence fail, plus rule-based findings. The MCP debug
// server (mcp/rascals-mcp.mjs) consumes this exact shape.

import { diagnostics } from './session'
import { useApp } from '../store/app'
import { encodeInvite } from './invite'

export interface Finding {
  severity: 'ok' | 'info' | 'warn' | 'error'
  /** Short headline, e.g. "No signaling relays reachable". */
  title: string
  /** What it means for invites/presence, concretely. */
  detail: string
  /** Ordered fix steps the user can act on. */
  steps: string[]
}

/** Rule-based findings from a diagnostics snapshot + app state.
 * Pure function — same shape is re-implemented in mcp/rascals-mcp.mjs
 * so the AI-side analysis matches the in-app doctor. */
export function analyzeSnapshot(d: {
  relays: Array<{ url: string; state: string }>
  lobbyPeers: number
  dmRooms: number
  dmPeers: number
  groupRooms: number
  groupPeers: number
  serverRooms: number
}, app: {
  friendCount: number
  outgoingRequests: number
  incomingRequests: number
  turnConfigured: boolean
  hideIp: boolean
  oldestOutgoingMs: number | null
}): Finding[] {
  const out: Finding[] = []
  const up = d.relays.filter((r) => r.state === 'connected').length
  const peers = d.lobbyPeers + d.dmPeers + d.groupPeers

  if (d.relays.length === 0) {
    out.push({
      severity: 'info',
      title: 'Diagnostics not ready yet',
      detail: 'The P2P layer is still starting. Wait a few seconds and refresh.',
      steps: ['Wait ~5 seconds', 'Press Refresh in the doctor panel'],
    })
    return out
  }

  if (up === 0) {
    out.push({
      severity: 'error',
      title: `No signaling relays reachable (0/${d.relays.length})`,
      detail:
        'Invites, friend requests and calls all ride the Nostr relays. With zero ' +
        'connected, nothing you send can reach anyone and nothing can reach you. ' +
        'This is the #1 cause of "added each other but nothing happened".',
      steps: [
        'Check the device has working internet at all (load any website)',
        'Corporate/school Wi-Fi, hotels and some VPNs block WebSocket relays — switch to phone hotspot or home Wi-Fi and press Refresh',
        'If a VPN/firewall is on, turn it off (or allow wss:// connections) and press Refresh',
      ],
    })
  } else if (up <= 1) {
    out.push({
      severity: 'warn',
      title: `Weak signaling (only ${up}/${d.relays.length} relays reachable)`,
      detail:
        'Discovery needs ONE relay in common with the other person, but a single ' +
        'relay is fragile — if it drops, invites silently stop mid-chat.',
      steps: ['Keep going if the other person is already online', 'If invites stall, switch networks and Refresh'],
    })
  } else {
    out.push({
      severity: 'ok',
      title: `Signaling healthy (${up}/${d.relays.length} relays reachable)`,
      detail: 'Invite codes and presence can flow.',
      steps: [],
    })
  }

  const wantsPeople = app.friendCount > 0 || app.outgoingRequests + app.incomingRequests > 0
  if (up >= 2 && peers === 0 && wantsPeople) {
    out.push({
      severity: 'warn',
      title: 'Relays fine but no peer anywhere (possible NAT/firewall block)',
      detail:
        'Signaling works, but no device has connected to you directly. If the other ' +
        'person is definitely online right now, your networks cannot form a direct ' +
        'WebRTC connection (strict NAT, carrier CGNAT, or client isolation on the ' +
        'Wi-Fi). Friend requests will keep retrying but may never land.',
      steps: [
        'Confirm the other person has Rascals open right now (a closed app = nobody to connect to)',
        'Both on the same Wi-Fi? Router "client isolation"/guest mode blocks device-to-device — use a different network',
        'One of you on cellular/CGNAT? Add a TURN server in Settings → Connection ("Network relay") — media stays end-to-end encrypted through it',
        'Or try Tailscale on both devices, then add your tailscale TURN',
      ],
    })
  }

  if (app.hideIp && !app.turnConfigured) {
    out.push({
      severity: 'error',
      title: '"Hide my IP" is on without a TURN server',
      detail:
        'Hide-IP forces relay-only WebRTC, but there is no TURN server configured, ' +
        'so there is nothing to relay through — no friend can ever connect while ' +
        'this combination is set.',
      steps: [
        'Either turn "Hide my IP from peers" off in Settings → Connection',
        'Or add a TURN server (Settings → Connection → Network relay) with its username/password',
      ],
    })
  }

  if (app.turnConfigured && app.hideIp && up >= 2 && peers === 0 && wantsPeople) {
    out.push({
      severity: 'warn',
      title: 'Relay-only mode with no relayed peers',
      detail:
        'Everything must flow through the configured TURN server. If its URL, ' +
        'username or password is wrong (or the TURN itself is unreachable), every ' +
        'connection fails while signaling still looks green.',
      steps: [
        'Double-check the TURN URL scheme (turn:/turns:), port, username and credential',
        'Test the TURN server from another tool before blaming Rascals',
        'As a last resort clear the TURN fields and try a direct connection',
      ],
    })
  }

  if (app.outgoingRequests > 0 && app.oldestOutgoingMs !== null && app.oldestOutgoingMs > 120000) {
    const mins = Math.round(app.oldestOutgoingMs / 60000)
    out.push({
      severity: 'info',
      title: `A friend request has been pending for ~${mins} min`,
      detail:
        'Requests retry automatically every minute, but only reach the other person ' +
        'while their app is open. A request stuck this long usually means their ' +
        'device is offline, their app is closed, or their signaling is blocked.',
      steps: [
        'Ask them to open Rascals and check THEIR Connection doctor (both sides must have at least one relay)',
        'Verify you pasted their FULL invite code (starts with rascal1:)',
        'If they accepted and it still shows pending, press "Repair connections" here and have them do the same',
      ],
    })
  }

  if (peers > 0 && up >= 2) {
    out.push({
      severity: 'ok',
      title: `Peers connected (${peers} across lobby/DM/groups)`,
      detail: 'The transport layer is working right now.',
      steps: [],
    })
  }

  return out
}

/** Full AI-ready report. Clipboard-safe JSON; contains no message content. */
export function connectionReport(): Record<string, unknown> {
  const d = diagnostics()
  const s = useApp.getState()
  const outReq = s.requests.filter((r) => r.direction === 'out')
  const oldest = outReq.length
    ? Math.max(...outReq.map((r) => Date.now() - r.ts))
    : null
  return {
    schema: 'rascals-connection-report/1',
    when: new Date().toISOString(),
    transport: d ?? null,
    identityPresent: !!s.identity,
    friendCount: s.friends.length,
    onlineFriendCount: s.friends.filter((f) => f.online).length,
    outgoingRequests: outReq.length,
    incomingRequests: s.requests.filter((r) => r.direction === 'in').length,
    oldestOutgoingMs: oldest,
    settings: {
      turnConfigured: !!s.settings.turnUrl.trim(),
      hideIp: s.settings.hideIp,
      // never include the credential itself
      turnUrlSet: !!s.settings.turnUrl.trim(),
    },
    myInvitePrefix: s.identity ? encodeInvite(s.identity.userId, '').slice(0, 8) + '…' : null,
  }
}
