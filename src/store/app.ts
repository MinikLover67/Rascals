import { create } from 'zustand'
import type { Identity } from '../lib/identity'
import type { GMsg } from '../lib/p2p'

export interface Friend {
  userId: string
  displayName: string
  online: boolean
  addedAt: number
}

export interface FriendRequest {
  userId: string
  displayName: string
  direction: 'in' | 'out'
  ts: number
}

/** Ex-friends, remembered so re-adding is one click (no code needed). */
export interface RecentRemoval {
  userId: string
  displayName: string
  removedAt: number
}

export type MsgStatus = 'queued' | 'sent' | 'delivered'

export interface FileMeta {
  id: string
  name: string
  mime: string
  size: number
  /** voice message flag + seconds */
  voice?: boolean
  duration?: number
  /** small data-URL thumbnail for images (also carried in history) */
  thumb?: string
}

export interface ChatMessage {
  id: string
  friendId: string
  mine: boolean
  ts: number
  rev: number
  body: string
  replyTo: string | null
  editedAt: number | null
  deleted: boolean
  status: MsgStatus
  file?: FileMeta
  /** Author for group messages (peer userId). DM messages omit it. */
  sender?: string
  /** Original group envelope (for re-serving history verbatim). */
  genv?: GMsg
  /** System note (missed call, etc.) — rendered distinctly, not editable. */
  sys?: string
}

export interface FileTransfer {
  total: number
  received: number
  ready: boolean
  friendId: string
}

export type ThemeName = 'dark' | 'light'
export type SoundPackName = 'default' | 'silent'

export interface Settings {
  tenorKey: string
  micId: string
  speakerId: string
  turnUrl: string
  turnUser: string
  turnPass: string
  /** Force all WebRTC through TURN so peers never see your IP (needs TURN). */
  hideIp: boolean
  theme: ThemeName
  soundPack: SoundPackName
  /** Per-event custom sound (IndexedDB file id). Empty = synth default. */
  customSounds: Partial<Record<SoundEvent, string>>
  notifications: boolean
  autostart: boolean
}

/** Chat/message sound events. */
export type SoundEvent = 'message' | 'request' | 'ring' | 'join' | 'leave' | 'send'

export interface VoiceParticipant {
  peerId: string
  userId: string
  name: string
  muted: boolean
  sharing: boolean
  speaking: boolean
  self: boolean
}

export interface VoiceState {
  /** Active 1:1 call, if any. */
  call: {
    callId: string
    peerId: string // friend userId
    peerName: string
    outgoing: boolean
    state: 'ringing' | 'active'
    startedAt: number
  } | null
  /** Joined voice channel (group/channel chat key), if any. */
  channel: {
    chatKey: string
    title: string
  } | null
  muted: boolean
  deafened: boolean
  sharing: boolean
  participants: VoiceParticipant[]
}

export interface GroupInfo {
  id: string
  name: string
  creator: string
  members: string[]
  epoch: number
  createdAt: number
  /** Set for server channels: managed by the server, not the group UI. */
  serverId?: string
  topic?: string
}

export type ServerRole = 'owner' | 'admin' | 'member'

export interface ServerChannel {
  id: string
  name: string
  topic?: string
}

export interface ServerInfo {
  id: string
  name: string
  creator: string
  members: Record<string, ServerRole>
  channels: ServerChannel[]
  epoch: number
  createdAt: number
}

/** Chat key for a group: 'g:' + group id (DM keys are bare userIds). */
export function groupChatKey(groupId: string): string {
  return `g:${groupId}`
}

export function groupIdFromChatKey(chatKey: string): string | null {
  return chatKey.startsWith('g:') ? chatKey.slice(2) : null
}

// Stable empty refs for selectors. NEVER return a fresh [] or {} from a
// zustand selector: useSyncExternalStore sees a new reference every snapshot
// and React spirals into "Maximum update depth exceeded" (frozen app).
export const EMPTY_MESSAGES: ChatMessage[] = []
export const EMPTY_PINS: string[] = []

interface AppState {
  identity: Identity | null
  friends: Friend[]
  requests: FriendRequest[]
  recent: RecentRemoval[]
  selectedFriend: string | null
  selectedGroup: string | null
  selectedServer: string | null
  servers: Record<string, ServerInfo>
  groups: Record<string, GroupInfo>
  /** groupId -> someone online in the room */
  groupOnline: Record<string, boolean>
  messages: Record<string, ChatMessage[]>
  /** friendId -> timestamp of last typing=true seen */
  typing: Record<string, number>
  /** chatKey -> display name of who is typing (groups) */
  typingName: Record<string, string>
  drafts: Record<string, string>
  /** friendId -> ts below which everything counts as read */
  lastRead: Record<string, number>
  /** friendId -> msgId -> userId -> emoji */
  reactions: Record<string, Record<string, Record<string, string>>>
  /** friendId -> pinned msg ids */
  pins: Record<string, string[]>
  /** fileId -> transfer progress (bytes live in IndexedDB) */
  files: Record<string, FileTransfer>
  settings: Settings
  /** Sender-chain keys: my latest + each peer's latest, base64. */
  gkeys: {
    my: Record<string, { key: string; seq: number }>
    peers: Record<string, Record<string, { key: string; seq: number }>>
  }
  /** Sealed file-content keys by file id. */
  fkeys: Record<string, string>
  /** Transient voice/call state (never persisted). */
  voice: VoiceState
  setIdentity: (id: Identity | null) => void
  addFriend: (f: Friend) => void
  removeFriend: (userId: string) => void
  renameFriend: (userId: string, displayName: string) => void
  setOnline: (userId: string, online: boolean) => void
  upsertRequest: (r: FriendRequest) => void
  removeRequest: (userId: string) => void
  rememberRecent: (r: RecentRemoval) => void
  dropRecent: (userId: string) => void
  selectFriend: (userId: string | null) => void
  upsertMessage: (m: ChatMessage) => void
  setStatus: (friendId: string, id: string, status: MsgStatus) => void
  markDelivered: (friendId: string, id: string) => void
  setTyping: (friendId: string, ts: number) => void
  setDraft: (friendId: string, draft: string) => void
  markRead: (friendId: string) => void
  setReaction: (friendId: string, msgId: string, userId: string, emoji: string) => void
  setPin: (friendId: string, msgId: string, pinned: boolean) => void
  setFileProgress: (fileId: string, t: FileTransfer) => void
  markFileReady: (fileId: string) => void
  setTenorKey: (key: string) => void
  setSettings: (patch: Partial<Settings>) => void
  selectGroup: (groupId: string | null) => void
  upsertGroup: (g: GroupInfo) => void
  removeGroup: (groupId: string) => void
  setGroupOnline: (groupId: string, online: boolean) => void
  setTypingName: (chatKey: string, name: string) => void
  setMyChain: (groupId: string, key: string, seq: number) => void
  setPeerChain: (groupId: string, userId: string, key: string, seq: number) => void
  dropGroupKeys: (groupId: string) => void
  setGenv: (chatKey: string, id: string, genv: GMsg) => void
  /** Persist a sealed file-content key (openable after restart). */
  setFileKey: (fileId: string, sealed: string) => void
  dropFileKey: (fileId: string) => void
  setVoice: (v: Partial<VoiceState>) => void
  setParticipants: (p: VoiceParticipant[]) => void
  resetVoice: () => void
  /** Pending app update found by the updater (in-memory only). */
  availableUpdate: { version: string; notes: string } | null
  setAvailableUpdate: (u: { version: string; notes: string }) => void
  dismissUpdate: () => void
  selectServer: (serverId: string | null) => void
  upsertServer: (s: ServerInfo) => void
  removeServer: (serverId: string) => void
}

const FRIENDS_KEY = 'rascals.friends.v1'
const REQUESTS_KEY = 'rascals.requests.v1'
const RECENT_KEY = 'rascals.recent.v1'
const MAX_RECENT = 20
const MESSAGES_KEY = 'rascals.messages.v2'
const DRAFTS_KEY = 'rascals.drafts.v1'
const LASTREAD_KEY = 'rascals.lastread.v1'
const REACTIONS_KEY = 'rascals.reactions.v1'
const PINS_KEY = 'rascals.pins.v1'
const FILES_KEY = 'rascals.files.v1'
const SETTINGS_KEY = 'rascals.settings.v1'
const GROUPS_KEY = 'rascals.groups.v1'
const GKEYS_KEY = 'rascals.gkeys.v1'
const FKEYS_KEY = 'rascals.fkeys.v1'
const SERVERS_KEY = 'rascals.servers.v1'
const MAX_STORED_PER_CHAT = 2000

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export const useApp = create<AppState>((set) => ({
  identity: null,
  friends: load<Friend[]>(FRIENDS_KEY, []).map((f) => ({ ...f, online: false })),
  requests: load<FriendRequest[]>(REQUESTS_KEY, []),
  recent: load<RecentRemoval[]>(RECENT_KEY, []),
  selectedFriend: null,
  messages: load<Record<string, ChatMessage[]>>(MESSAGES_KEY, {}),
  typing: {},
  typingName: {},
  drafts: load<Record<string, string>>(DRAFTS_KEY, {}),
  lastRead: load<Record<string, number>>(LASTREAD_KEY, {}),
  reactions: load<AppState['reactions']>(REACTIONS_KEY, {}),
  pins: load<AppState['pins']>(PINS_KEY, {}),
  files: load<AppState['files']>(FILES_KEY, {}),
  settings: {
    tenorKey: '',
    micId: '',
    speakerId: '',
    turnUrl: '',
    turnUser: '',
    turnPass: '',
    hideIp: false,
    theme: 'dark' as const,
    soundPack: 'default' as const,
    customSounds: {},
    notifications: true,
    autostart: false,
    ...load<Partial<Settings>>(SETTINGS_KEY, {}),
  },
  selectedGroup: null,
  selectedServer: null,
  servers: load<Record<string, ServerInfo>>(SERVERS_KEY, {}),
  groups: load<Record<string, GroupInfo>>(GROUPS_KEY, {}),
  groupOnline: {},
  gkeys: load<AppState['gkeys']>(GKEYS_KEY, { my: {}, peers: {} }),
  fkeys: load<Record<string, string>>(FKEYS_KEY, {}),
  voice: { call: null, channel: null, muted: false, deafened: false, sharing: false, participants: [] },
  availableUpdate: null,
  setIdentity: (identity) => set({ identity }),
  addFriend: (f) =>
    set((s) =>
      s.friends.some((x) => x.userId === f.userId)
        ? s
        : { friends: [...s.friends, f] },
    ),
  removeFriend: (userId) =>
    set((s) => ({
      friends: s.friends.filter((f) => f.userId !== userId),
      selectedFriend: s.selectedFriend === userId ? null : s.selectedFriend,
    })),
  renameFriend: (userId, displayName) =>
    set((s) => ({
      friends: s.friends.map((f) =>
        f.userId === userId && f.displayName !== displayName
          ? { ...f, displayName }
          : f,
      ),
    })),
  setOnline: (userId, online) =>
    set((s) => ({
      friends: s.friends.map((f) =>
        f.userId === userId ? { ...f, online } : f,
      ),
    })),
  upsertRequest: (r) =>
    set((s) => {
      if (s.friends.some((f) => f.userId === r.userId)) return s
      const rest = s.requests.filter((x) => x.userId !== r.userId)
      return { requests: [...rest, r] }
    }),
  removeRequest: (userId) =>
    set((s) => ({ requests: s.requests.filter((r) => r.userId !== userId) })),
  rememberRecent: (r) =>
    set((s) => ({
      recent: [...s.recent.filter((x) => x.userId !== r.userId), r].slice(-MAX_RECENT),
    })),
  dropRecent: (userId) =>
    set((s) => ({ recent: s.recent.filter((r) => r.userId !== userId) })),
  selectFriend: (selectedFriend) =>
    set((s) => {
      if (!selectedFriend) return { selectedFriend }
      const chat = s.messages[selectedFriend] ?? []
      const maxTs = chat.reduce((m, x) => Math.max(m, x.ts), 0)
      return {
        selectedFriend,
        selectedGroup: null,
        selectedServer: null,
        lastRead: { ...s.lastRead, [selectedFriend]: Math.max(s.lastRead[selectedFriend] ?? 0, maxTs, Date.now()) },
      }
    }),
  selectGroup: (selectedGroup) =>
    set((s) => {
      if (!selectedGroup) return { selectedGroup }
      const key = groupChatKey(selectedGroup)
      const chat = s.messages[key] ?? []
      const maxTs = chat.reduce((m, x) => Math.max(m, x.ts), 0)
      // NOTE: keeps selectedServer — channels are selected through it.
      return {
        selectedGroup,
        selectedFriend: null,
        lastRead: { ...s.lastRead, [key]: Math.max(s.lastRead[key] ?? 0, maxTs, Date.now()) },
      }
    }),
  selectServer: (selectedServer) =>
    set({ selectedServer, selectedFriend: null, selectedGroup: null }),
  upsertServer: (info) =>
    set((s) => ({ servers: { ...s.servers, [info.id]: info } })),
  removeServer: (serverId) =>
    set((s) => {
      const servers = { ...s.servers }
      delete servers[serverId]
      return {
        servers,
        selectedServer: s.selectedServer === serverId ? null : s.selectedServer,
      }
    }),
  upsertGroup: (g) =>
    set((s) => ({ groups: { ...s.groups, [g.id]: g } })),
  removeGroup: (groupId) =>
    set((s) => {
      const groups = { ...s.groups }
      delete groups[groupId]
      return {
        groups,
        selectedGroup: s.selectedGroup === groupId ? null : s.selectedGroup,
      }
    }),
  setGroupOnline: (groupId, online) =>
    set((s) => ({ groupOnline: { ...s.groupOnline, [groupId]: online } })),
  setTypingName: (chatKey, name) =>
    set((s) => ({ typingName: { ...s.typingName, [chatKey]: name } })),
  setMyChain: (groupId, key, seq) =>
    set((s) => ({ gkeys: { ...s.gkeys, my: { ...s.gkeys.my, [groupId]: { key, seq } } } })),
  setPeerChain: (groupId, userId, key, seq) =>
    set((s) => ({
      gkeys: {
        ...s.gkeys,
        peers: {
          ...s.gkeys.peers,
          [groupId]: { ...(s.gkeys.peers[groupId] ?? {}), [userId]: { key, seq } },
        },
      },
    })),
  dropGroupKeys: (groupId) =>
    set((s) => {
      const my = { ...s.gkeys.my }
      delete my[groupId]
      const peers = { ...s.gkeys.peers }
      delete peers[groupId]
      return { gkeys: { my, peers } }
    }),
  setGenv: (chatKey, id, genv) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatKey]: (s.messages[chatKey] ?? []).map((m) =>
          m.id === id ? { ...m, genv } : m,
        ),
      },
    })),
  setFileKey: (fileId, sealed) =>
    set((s) => ({ fkeys: { ...s.fkeys, [fileId]: sealed } })),
  dropFileKey: (fileId) =>
    set((s) => {
      if (!(fileId in s.fkeys)) return s
      const fkeys = { ...s.fkeys }
      delete fkeys[fileId]
      return { fkeys }
    }),
  setVoice: (v) => set((s) => ({ voice: { ...s.voice, ...v } })),
  setParticipants: (participants) =>
    set((s) => ({ voice: { ...s.voice, participants } })),
  resetVoice: () =>
    set({ voice: { call: null, channel: null, muted: false, deafened: false, sharing: false, participants: [] } }),
  setAvailableUpdate: (availableUpdate) => set({ availableUpdate }),
  dismissUpdate: () => set({ availableUpdate: null }),
  upsertMessage: (m) =>
    set((s) => {
      const chat = s.messages[m.friendId] ?? []
      const i = chat.findIndex((x) => x.id === m.id)
      let next: ChatMessage[]
      if (i === -1) {
        next = [...chat, m].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1))
      } else if (m.rev > chat[i].rev) {
        // Last-writer-wins; keep my local delivery status on my own messages.
        const keep =
          chat[i].mine && (chat[i].status === 'delivered' || m.status === 'queued')
            ? chat[i].status
            : m.status
        next = [...chat]
        next[i] = { ...m, status: keep }
      } else {
        return s
      }
      if (next.length > MAX_STORED_PER_CHAT)
        next = next.slice(next.length - MAX_STORED_PER_CHAT)
      return { messages: { ...s.messages, [m.friendId]: next } }
    }),
  setStatus: (friendId, id, status) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [friendId]: (s.messages[friendId] ?? []).map((m) =>
          m.id === id ? { ...m, status } : m,
        ),
      },
    })),
  markDelivered: (friendId, id) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [friendId]: (s.messages[friendId] ?? []).map((m) =>
          m.id === id && m.mine ? { ...m, status: 'delivered' } : m,
        ),
      },
    })),
  setTyping: (friendId, ts) =>
    set((s) => ({ typing: { ...s.typing, [friendId]: ts } })),
  setDraft: (friendId, draft) =>
    set((s) => ({ drafts: { ...s.drafts, [friendId]: draft } })),
  markRead: (friendId) =>
    set((s) => ({
      lastRead: { ...s.lastRead, [friendId]: Date.now() },
    })),
  setReaction: (friendId, msgId, userId, emoji) =>
    set((s) => {
      const chat = s.reactions[friendId] ?? {}
      const entry = { ...(chat[msgId] ?? {}) }
      if (emoji) entry[userId] = emoji
      else delete entry[userId]
      return {
        reactions: { ...s.reactions, [friendId]: { ...chat, [msgId]: entry } },
      }
    }),
  setPin: (friendId, msgId, pinned) =>
    set((s) => {
      const cur = s.pins[friendId] ?? []
      const next = pinned
        ? cur.includes(msgId)
          ? cur
          : [...cur, msgId]
        : cur.filter((id) => id !== msgId)
      return { pins: { ...s.pins, [friendId]: next } }
    }),
  setFileProgress: (fileId, t) =>
    set((s) => ({ files: { ...s.files, [fileId]: t } })),
  markFileReady: (fileId) =>
    set((s) => {
      const cur = s.files[fileId]
      if (!cur) return s
      return {
        files: { ...s.files, [fileId]: { ...cur, received: cur.total, ready: true } },
      }
    }),
  setTenorKey: (tenorKey) =>
    set((s) => ({ settings: { ...s.settings, tenorKey } })),
  setSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),
}))

// Persist friends + requests + messages + drafts + read markers.
useApp.subscribe((s) => {
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(s.friends))
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(s.requests))
    localStorage.setItem(RECENT_KEY, JSON.stringify(s.recent))
    const trimmed: Record<string, ChatMessage[]> = {}
    for (const [k, v] of Object.entries(s.messages))
      trimmed[k] = v.slice(-MAX_STORED_PER_CHAT)
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(trimmed))
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(s.drafts))
    localStorage.setItem(LASTREAD_KEY, JSON.stringify(s.lastRead))
    localStorage.setItem(REACTIONS_KEY, JSON.stringify(s.reactions))
    localStorage.setItem(PINS_KEY, JSON.stringify(s.pins))
    localStorage.setItem(FILES_KEY, JSON.stringify(s.files))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s.settings))
    localStorage.setItem(GROUPS_KEY, JSON.stringify(s.groups))
    localStorage.setItem(GKEYS_KEY, JSON.stringify(s.gkeys))
    localStorage.setItem(FKEYS_KEY, JSON.stringify(s.fkeys))
    localStorage.setItem(SERVERS_KEY, JSON.stringify(s.servers))
  } catch {
    // Storage full or unavailable — session still works in memory.
  }
})

export function unreadCount(  messages: ChatMessage[] | undefined,
  lastRead: number | undefined,
): number {
  if (!messages || messages.length === 0) return 0
  const mark = lastRead ?? 0
  let n = 0
  for (const m of messages)
    if (!m.mine && !m.deleted && m.ts > mark) n++
  return n
}

/** Convenience for components: mark a chat read outside event handlers. */
export function markReadNow(friendId: string): void {
  useApp.getState().markRead(friendId)
}
