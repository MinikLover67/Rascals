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
import { NostrChannel } from './nostr-channel'
import { playSound } from './sound'
import { useApp } from '../store/app'

let p2p: P2P | null = null
let nostr: NostrChannel | null = null
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

/** Outgoing friend requests re-knock every 30 s while still pending.
 *  Ephemeral Nostr events have no store-and-forward, so we keep knocking
 *  (and stay in the target's lobby) until the recipient is online to catch one. */
const RETRY_MS = 30000

export function getP2P(): P2P | null {
  return p2p
}

export function getNostr(): NostrChannel | null {
  return nostr
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
  nostr?.stop()
  p2p = null
  nostr = null
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
  // A peer coming back (room join OR first hello after silence): flush
  // queued messages, restream files, retry missed invites. Without this,
  // anything queued while they were offline waits for OUR restart.
  function peerReturned(friendId: string): void {
    lastSeen.set(friendId, Date.now())
    useApp.getState().setOnline(friendId, true)
    void api.peerBecameAvailable(friendId).catch(() => {})
    void gapi.resendInvites(friendId).catch(() => {})
    void sapi.resendInvites(friendId).catch(() => {})
  }
  voice = vapi
  api.onCallSignal((from, kind, callId) => vapi.handleSignal(from, kind, callId))
  // Shared network callbacks — used by both the Trystero transport (below)
  // and the persistent Nostr channel, so a hello/request arriving over either
  // path is handled identically. Defined as closures so they can reach
  // peerReturned and the chat apis bound above.
  const onFriendRequest = (userId: string, displayName: string): void => {
    // Peer-controlled: shape before it touches state or notifications.
    const name = shapeDisplayName(displayName) || shortUid(userId)
    const s = useApp.getState()
    // One knock, one notification: the sender re-knocks every minute
    // plus a targeted + broadcast pair ~5 s apart, so an already-known
    // request only refreshes silently (no new toast/sound). Knocks from
    // existing friends are just presence noise — ignore them.
    if (s.friends.some((f) => f.userId === userId)) return
    // Mutual add: they knocked while we already added them (both pasted
    // each other's codes). A verified freq IS their signed intent, so
    // complete the friendship now — recording an 'in' request here would
    // overwrite our 'out' record and strand the handshake (the hello
    // that follows looks like it came from a stranger).
    const outgoing = s.requests.find((r) => r.userId === userId && r.direction === 'out')
    if (outgoing) {
      s.removeRequest(userId)
      s.addFriend({ userId, displayName: name, online: false, addedAt: Date.now() })
      // Complete the handshake on the wire too, not just in state: join
      // the pairwise room and announce presence so both sides flip online
      // without a restart. Also stop knocking — they're a friend now.
      void getP2P()?.stopFriendRequest(userId).catch(() => {})
      void getNostr()?.removeFriendRequest(userId).catch(() => {})
      void getP2P()
        ?.ensureDmRoom(userId)
        .then(() => getP2P()?.broadcastHellos())
        .catch(() => {})
      return
    }
    const known = s.requests.some((r) => r.userId === userId && r.direction === 'in')
    s.upsertRequest({ userId, displayName: name, direction: 'in', ts: Date.now() })
    if (!known) alertFriendRequest(name)
  }
  const onHello = (userId: string, displayName: string): void => {
    const s = useApp.getState()
    // Peer-controlled: shape before storing (hello re-sends on every connect).
    const name = shapeDisplayName(displayName) || shortUid(userId)
    lastSeen.set(userId, Date.now())
    const known = s.friends.some((f) => f.userId === userId)
    if (!known) {
      // Stranger said hello in our pairwise room: only accept if WE
      // requested them first (completes the handshake without extra round trips).
      const outgoing = s.requests.some((r) => r.userId === userId && r.direction === 'out')
      if (outgoing) {
        s.removeRequest(userId)
        s.addFriend({ userId, displayName: name, online: true, addedAt: Date.now() })
        // Friendship completed via hello — stop knocking at their lobby.
        void getP2P()?.stopFriendRequest(userId).catch(() => {})
        void getNostr()?.removeFriendRequest(userId).catch(() => {})
      }
      return
    }
    const wasOffline = !s.friends.some((f) => f.userId === userId && f.online)
    s.renameFriend(userId, name)
    s.setOnline(userId, true)
    // Hello-driven return (join handshake missed): flush queued traffic
    // now, not on our next restart.
    if (wasOffline) peerReturned(userId)
  }
  const inst = new P2P(
    identity,
    {
      onFriendRequest,
      onHello,
      onPeerOnline: (friendId) => {
        peerReturned(friendId)
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
  // Persistent Nostr channel — carries presence + friend requests over stored
  // replaceable events so they land even when Trystero's peer discovery fails
  // cross-network (the cause of "both sides show each other offline").
  nostr = new NostrChannel(identity.userId, {
    onHello: (userId, displayName) => {
      // Reuse the same handler Trystero's onHello uses — defined below as a
      // closure so it can reach peerReturned / the chat apis.
      onHello(userId, displayName)
    },
    onFriendRequest: (userId, displayName) => {
      onFriendRequest(userId, displayName)
    },
  })
  void nostr.start().catch(() => {
    // relays unreachable now — the pool keeps retrying in the background
  })
  // Announce presence + pending requests immediately so peers flipping online
  // see us within seconds, not after the first 30 s heartbeat.
  window.setTimeout(() => {
    try {
      const n = getNostr()
      const inst = getP2P()
      if (!n || !inst) return
      const st = useApp.getState()
      for (const f of st.friends) {
        void inst
          .helloPayload(f.userId)
          .then((p) => n.publishPresence(f.userId, p))
          .catch(() => {})
      }
      for (const r of st.requests) {
        if (r.direction !== 'out') continue
        if (st.friends.some((f) => f.userId === r.userId)) continue
        void inst
          .helloPayload(r.userId)
          .then((p) => n.publishFriendRequest(r.userId, p))
          .catch(() => {})
      }
    } catch {
      // initial publish must never break the app
    }
  }, 3000)
  const s = useApp.getState()
  for (const f of s.friends) await inst.ensureDmRoom(f.userId)
  for (const r of s.requests)
    if (r.direction === 'out') await inst.ensureDmRoom(r.userId)
  // Knock immediately for pending outgoing requests — don't wait up to a
  // minute for the first retry. The recipient may be online right now.
  for (const r of s.requests) {
    if (r.direction !== 'out') continue
    if (s.friends.some((f) => f.userId === r.userId)) continue
    void inst.sendFriendRequest(r.userId).catch(() => {})
  }
  await gapi.joinAll()
  await sapi.joinAll()
  // Keep knocking for pending outgoing requests (the other side may come
  // online at any time). Stops with the session.
  if (retryTimer !== null) clearInterval(retryTimer)
  retryTimer = window.setInterval(() => {
    try {
      const st = useApp.getState()
      const pendingOut = new Set<string>()
      for (const r of st.requests) {
        if (r.direction !== 'out') continue
        if (st.friends.some((f) => f.userId === r.userId)) continue
        pendingOut.add(r.userId)
        void p2p?.sendFriendRequest(r.userId).catch(() => {})
      }
      // Drop lobby-send rooms for requests that got fulfilled/removed.
      p2p?.reconcileLobbySends(pendingOut)
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
      // Also push presence over the persistent Nostr channel — independent of
      // Trystero discovery, so cross-network peers still see us online.
      const n = getNostr()
      if (n) {
        const st0 = useApp.getState()
        for (const f of st0.friends) {
          void inst
            ?.helloPayload(f.userId)
            .then((p) => n.publishPresence(f.userId, p))
            .catch(() => {})
        }
        // Re-publish pending outgoing friend requests over Nostr too.
        for (const r of st0.requests) {
          if (r.direction !== 'out') continue
          if (st0.friends.some((f) => f.userId === r.userId)) continue
          void inst
            ?.helloPayload(r.userId)
            .then((p) => n.publishFriendRequest(r.userId, p))
            .catch(() => {})
        }
      }
      const st = useApp.getState()
      const now = Date.now()
      for (const f of st.friends) {
        if (!f.online) continue
        if ((inst?.peerFileVersionOf(f.userId) ?? 0) < 2) continue
        if (now - (lastSeen.get(f.userId) ?? 0) > 180000) st.setOnline(f.userId, false)
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
    // Re-knock pending outgoing requests — the recipient may have just come
    // online while we were away. Cheap: cached rooms just re-publish.
    const st = useApp.getState()
    for (const r of st.requests) {
      if (r.direction !== 'out') continue
      if (st.friends.some((f) => f.userId === r.userId)) continue
      void getP2P()?.sendFriendRequest(r.userId).catch(() => {})
    }
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

/** One-shot connection reset: rejoin lobby + every DM room, rebroadcast.
 * For when invites/presence stall and waiting on the timers is too slow.
 * Returns a human summary for the button. Never throws. */
export async function resetConnection(): Promise<string> {
  const inst = getP2P()
  if (!inst) return 'Not connected yet — try again in a moment.'
  let rooms = 0
  try {
    await inst.rejoinLobby().catch(() => {})
    const st = useApp.getState()
    for (const f of st.friends) {
      try {
        await inst.rejoinDmRoom(f.userId)
        rooms++
      } catch {
        // keep healing the rest
      }
    }
    await inst.broadcastHellos().catch(() => {})
    const now = Date.now()
    lastLobbyRejoin = now
    lastWedgeHeal = now
  } catch {
    return 'Reconnect hit a snag — try again.'
  }
  return `Reconnected — lobby plus ${rooms} chat room${rooms === 1 ? '' : 's'} refreshed. Give it half a minute.`
}

/** Ask a friend for their profile look (avatar/banner/theme/name style). */
export async function requestPeerProfile(userId: string): Promise<void> {
  await getChat()?.requestPeerProfile(userId).catch(() => {})
}

/** Push our current profile look to every online friend.
 * Call after editing it so their caches update without a manual Refresh. */
export async function broadcastOwnProfile(): Promise<void> {
  await getChat()?.broadcastOwnProfile().catch(() => {})
}

/** Accept an incoming request: befriend + join pairwise room, then announce
 *  presence so the requester flips online without a restart. Also stop any
 *  outgoing knock to them (mutual case). */
export async function acceptRequest(userId: string, displayName: string): Promise<void> {
  const s = useApp.getState()
  s.removeRequest(userId)
  s.dropRecent(userId)
  s.addFriend({ userId, displayName: shapeDisplayName(displayName) || shortUid(userId), online: false, addedAt: Date.now() })
  await getP2P()?.ensureDmRoom(userId)
  // Stop knocking if we also had a pending outgoing request to them.
  void getP2P()?.stopFriendRequest(userId).catch(() => {})
  // Announce presence in the pairwise room so the requester sees us online
  // immediately (don't rely on their onPeerJoin catching our join).
  void getP2P()?.broadcastHellos().catch(() => {})
  // And over the persistent channel — same reason as everywhere else.
  const n = getNostr()
  if (n) {
    void getP2P()
      ?.helloPayload(userId)
      .then((p) => n.publishPresence(userId, p))
      .catch(() => {})
    void n.removeFriendRequest(userId).catch(() => {})
  }
  await getChat()?.peerBecameAvailable(userId).catch(() => {})
}

/** Request a friend by userId: record outgoing, join DM room, send lobby knock. */
export async function requestFriend(userId: string, displayName: string): Promise<void> {
  const s = useApp.getState()
  s.dropRecent(userId)
  s.upsertRequest({ userId, displayName: shapeDisplayName(displayName) || shortUid(userId), direction: 'out', ts: Date.now() })
  await getP2P()?.ensureDmRoom(userId)
  await getP2P()?.sendFriendRequest(userId)
  // Persistent channel too — lands even if the peer is offline right now.
  const n = getNostr()
  if (n) {
    void getP2P()
      ?.helloPayload(userId)
      .then((p) => n.publishFriendRequest(userId, p))
      .catch(() => {})
  }
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
  void getP2P()?.stopFriendRequest(userId).catch(() => {})
  lastSeen.delete(userId)
  s.removeRequest(userId)
  s.setTyping(userId, 0)
  s.removeFriend(userId)
  if (f) {
    s.rememberRecent({ userId, displayName: f.displayName, removedAt: Date.now() })
  }
}
