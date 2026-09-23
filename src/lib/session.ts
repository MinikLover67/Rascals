// Session glue: owns the P2P singleton, wires network events into the store.
// No UI imports here — components call startSession/stopSession/getP2P.

import { bindChat, type ChatApi } from './chat'
import { bindGroupChat, type GroupApi } from './chat-group'
import { bindServerChat, type ServerApi } from './chat-server'
import { alertFriendRequest } from './alerts'
import { bindVoice, type VoiceApi } from './voice'
import type { Identity } from './identity'
import { shapeDisplayName, shortUid } from './format'
import { P2P } from './p2p'
import { playSound } from './sound'
import { useApp } from '../store/app'

let p2p: P2P | null = null
let chat: ChatApi | null = null
let groupChat: GroupApi | null = null
let serverChat: ServerApi | null = null
let voice: VoiceApi | null = null
let retryTimer: number | null = null
let helloTimer: number | null = null
/** Last hello (or room join) seen per friend — drives the stale sweep. */
const lastSeen = new Map<string, number>()
/** Last wedge-heal pass (room rejoins for silent-but-listed peers). */
let lastWedgeHeal = 0
/** Last lobby rejoin (request listening also dies silently on flaps). */
let lastLobbyRejoin = 0
/** Random per app launch — tells two diagnostics captures apart. */
let sessionNonce = ''

/** Outgoing friend requests re-knock every minute while still pending. */
const RETRY_MS = 60000

export function getP2P(): P2P | null {
  return p2p
}

export function getChat(): ChatApi | null {
  return chat
}

export function getGroupChat(): GroupApi | null {
  return groupChat
}

export function getServerChat(): ServerApi | null {
  return serverChat
}

export function getVoice(): VoiceApi | null {
  return voice
}

export function diagnostics(): (ReturnType<P2P['diagnostics']> & { session: string }) | null {
  try {
    if (!p2p) return null
    return { ...p2p.diagnostics(), session: sessionNonce }
  } catch {
    return null
  }
}

export function stopSession(): void {
  if (retryTimer !== null) {
    clearInterval(retryTimer)
    retryTimer = null
  }
  if (helloTimer !== null) {
    clearInterval(helloTimer)
    helloTimer = null
  }
  try {
    window.removeEventListener('focus', refreshHellos)
    window.removeEventListener('online', refreshHellos)
  } catch {
    // listeners never attached — nothing to do
  }
  voice?.teardown()
  p2p?.stop()
  p2p = null
  chat = null
  groupChat = null
  serverChat = null
  voice = null
}

export async function startSession(identity: Identity): Promise<void> {
  stopSession()
  try {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    sessionNonce = [...bytes].map((b) => b.toString(36)).join('').slice(0, 8)
  } catch {
    sessionNonce = String(Date.now() % 100000)
  }
  const getter = () => p2p
  const api = bindChat(identity, getter)
  chat = api
  const gapi = bindGroupChat(identity, getter, {
    sendDmCtrl: (friendId, payload) => api.sendCtrl(friendId, payload),
  })
  groupChat = gapi
  const sapi = bindServerChat(identity, getter, {
    sendDmCtrl: (friendId, payload) => api.sendCtrl(friendId, payload),
    group: () => groupChat,
  })
  serverChat = sapi
  api.onInvite((from, invite) => {
    if (invite.kind === 'ginvite') {
      void gapi.handleInvite(from, invite).catch(() => {})
    } else {
      void sapi.handleInvite(from, invite.server).catch(() => {})
    }
  })
  const vapi = bindVoice({
    identity: () => useApp.getState().identity,
    displayNameOf: (uid) =>
      useApp.getState().friends.find((f) => f.userId === uid)?.displayName ?? `${uid.slice(0, 8)}...`,
    sendCall: (friendId, kind, callId) => api.sendCall(friendId, kind, callId),
    peerOnline: (friendId) =>
      useApp.getState().friends.some((f) => f.userId === friendId && f.online),
    postSys: (chatKey, text, mine) => {
      useApp.getState().upsertMessage({
        id: crypto.randomUUID(),
        friendId: chatKey,
        mine,
        ts: Date.now(),
        rev: 1,
        body: text,
        replyTo: null,
        editedAt: null,
        deleted: false,
        status: 'delivered',
        sys: 'call',
      })
    },
  })
  voice = vapi
  api.onCallSignal((from, kind, callId) => vapi.handleSignal(from, kind, callId))
  const inst = new P2P(
    identity,
    {
      onFriendRequest: (userId, displayName) => {
        // Peer-controlled: shape before it touches state or notifications.
        const name = shapeDisplayName(displayName) || shortUid(userId)
        useApp.getState().upsertRequest({
          userId,
          displayName: name,
          direction: 'in',
          ts: Date.now(),
        })
        alertFriendRequest(name)
      },
      onHello: (userId, displayName) => {
        const s = useApp.getState()
        // Peer-controlled: shape before storing (hello re-sends on every connect).
        const name = shapeDisplayName(displayName) || shortUid(userId)
        lastSeen.set(userId, Date.now())
        const known = s.friends.some((f) => f.userId === userId)
        if (!known) {
          // Stranger said hello in our pairwise room: only accept if WE
          // requested them first (completes the handshake without extra round trips).
          const outgoing = s.requests.some(
            (r) => r.userId === userId && r.direction === 'out',
          )
          if (outgoing) {
            s.removeRequest(userId)
            s.addFriend({ userId, displayName: name, online: true, addedAt: Date.now() })
          }
          return
        }
        s.renameFriend(userId, name)
        s.setOnline(userId, true)
      },
      onPeerOnline: (friendId) => {
        lastSeen.set(friendId, Date.now())
        useApp.getState().setOnline(friendId, true)
        // Flush anything queued while offline + pull missed history.
        void api.peerBecameAvailable(friendId).catch(() => {})
        // Retry group/server invites they may have missed while offline.
        void gapi.resendInvites(friendId).catch(() => {})
        void sapi.resendInvites(friendId).catch(() => {})
      },
      onPeerOffline: (friendId) => useApp.getState().setOnline(friendId, false),
    },
    {
      onGroupPeer: (groupId, online) => {
        useApp.getState().setGroupOnline(groupId, online)
        if (online) {
          playSound('join')
          void gapi.groupAvailable(groupId).catch(() => {})
        } else {
          playSound('leave')
        }
      },
    },
  )
  p2p = inst
  inst.setMsgHandlers(api.handlers)
  inst.setGroupHandlers(gapi.handlers)
  inst.setServerHandlers(sapi.handlers)
  await inst.start()
  const s = useApp.getState()
  for (const f of s.friends) await inst.ensureDmRoom(f.userId)
  for (const r of s.requests)
    if (r.direction === 'out') await inst.ensureDmRoom(r.userId)
  await gapi.joinAll()
  await sapi.joinAll()
  // Keep knocking for pending outgoing requests (the other side may come
  // online at any time). Stops with the session.
  if (retryTimer !== null) clearInterval(retryTimer)
  retryTimer = window.setInterval(() => {
    try {
      const st = useApp.getState()
      for (const r of st.requests) {
        if (r.direction !== 'out') continue
        if (st.friends.some((f) => f.userId === r.userId)) continue
        void p2p?.sendFriendRequest(r.userId).catch(() => {})
      }
    } catch {
      // retry must never break the app
    }
  }, RETRY_MS)
  // Presence self-heal: re-broadcast hellos every 30 s so a rebooted peer
  // flips back online without anyone restarting. Two guards keep it honest:
  // the stale sweep only applies to peers speaking the heartbeat protocol
  // (fv>=2 — older clients never heartbeat, sweeping them would force them
  // offline wrongly), and silent-but-listed rooms get rejoined on cadence.
  if (helloTimer !== null) clearInterval(helloTimer)
  const beat = (): void => {
    try {
      const inst = getP2P()
      void inst?.broadcastHellos().catch(() => {})
      const st = useApp.getState()
      const now = Date.now()
      for (const f of st.friends) {
        if (!f.online) continue
        if ((inst?.peerFileVersionOf(f.userId) ?? 0) < 2) continue
        if (now - (lastSeen.get(f.userId) ?? 0) > 90000) st.setOnline(f.userId, false)
      }
      maybeWedgeHeal(120000)
      // Lobby request listening dies silently too (sleep/flaps) — rejoin on
      // a slow cadence so incoming requests keep working without restarts.
      if (now - lastLobbyRejoin > 300000) {
        lastLobbyRejoin = now
        void inst?.rejoinLobby().catch(() => {})
      }
    } catch {
      // heartbeat must never break the app
    }
  }
  helloTimer = window.setInterval(beat, 30000)
  window.addEventListener('focus', refreshHellos)
  window.addEventListener('online', refreshHellos)
}

/** Rejoin DM rooms that list peers but went silent (wedged discovery).
 * Gated by minAgeMs so healthy rooms and focus spam never churn. */
function maybeWedgeHeal(minAgeMs: number): void {
  try {
    const inst = getP2P()
    if (!inst) return
    const now = Date.now()
    if (now - lastWedgeHeal < minAgeMs) return
    lastWedgeHeal = now
    const st = useApp.getState()
    for (const f of st.friends) {
      if ((inst.peerCount(f.userId) ?? 0) === 0) continue
      if (now - (lastSeen.get(f.userId) ?? 0) <= 60000) continue
      void inst.rejoinDmRoom(f.userId).catch(() => {})
    }
  } catch {
    // healing must never break the app
  }
}

function refreshHellos(): void {
  try {
    void getP2P()?.broadcastHellos().catch(() => {})
    maybeWedgeHeal(30000)
    // Sleep/wake is the classic room killer — rejoin the lobby whenever the
    // user returns (gated so alt-tabbing doesn't churn).
    const now = Date.now()
    if (now - lastLobbyRejoin > 60000) {
      lastLobbyRejoin = now
      void getP2P()?.rejoinLobby().catch(() => {})
    }
  } catch {
    // ignore
  }
}

/** Accept an incoming request: befriend + join pairwise room (hellos do the rest). */
export async function acceptRequest(userId: string, displayName: string): Promise<void> {
  const s = useApp.getState()
  s.removeRequest(userId)
  s.dropRecent(userId)
  s.addFriend({ userId, displayName: shapeDisplayName(displayName) || shortUid(userId), online: false, addedAt: Date.now() })
  await getP2P()?.ensureDmRoom(userId)
  await getChat()?.peerBecameAvailable(userId).catch(() => {})
}

/** Request a friend by userId: record outgoing, join DM room, send lobby knock. */
export async function requestFriend(userId: string, displayName: string): Promise<void> {
  const s = useApp.getState()
  s.dropRecent(userId)
  s.upsertRequest({ userId, displayName: shapeDisplayName(displayName) || shortUid(userId), direction: 'out', ts: Date.now() })
  await getP2P()?.ensureDmRoom(userId)
  await getP2P()?.sendFriendRequest(userId)
}

/**
 * Fully remove a friend: disconnect the DM room (no further traffic either
 * way), drop pending requests, clear typing, remember them for one-click
 * re-add. Chat history is kept and reappears if they are re-added.
 */
export async function unfriend(userId: string): Promise<void> {
  const s = useApp.getState()
  const f = s.friends.find((x) => x.userId === userId)
  getP2P()?.leaveDmRoom(userId)
  lastSeen.delete(userId)
  s.removeRequest(userId)
  s.setTyping(userId, 0)
  s.removeFriend(userId)
  if (f) {
    s.rememberRecent({ userId, displayName: f.displayName, removedAt: Date.now() })
  }
}
