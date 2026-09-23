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
  s.removeRequest(userId)
  s.setTyping(userId, 0)
  s.removeFriend(userId)
  if (f) {
    s.rememberRecent({ userId, displayName: f.displayName, removedAt: Date.now() })
  }
}
