// Chat protocol: E2EE upserts + delivery acks + typing + history sync.
// Every message is full state {body, replyTo, editedAt, deleted} under an id;
// edits/deletes are just newer revs. Merge = last-writer-wins by rev.
// Works peer-to-peer: no server, SQLite comes later — localStorage for now.

import { openBox, seal, sessionKey } from './box'
import { alertIncomingDM } from './alerts'
import { getBlob, putBlob } from './idb'
import type { Identity } from './identity'
import type {
  HOfferMsg,
  HReqMsg,
  MsgEnvelope,
  MsgHandlers,
  P2P,
  ReactionEntry,
} from './p2p'
import { FILE_BATCH_MAX, FILE_BATCH_SIZE } from './p2p'
import { useApp, type ChatMessage, type FileMeta } from '../store/app'

export interface FileContent {
  id: string
  name: string
  mime: string
  size: number
  voice?: boolean
  duration?: number
  thumb?: string
}

export interface MsgContent {
  body: string
  replyTo: string | null
  editedAt: number | null
  deleted: boolean
  file?: FileContent
}

const HISTORY_LIMIT = 200
export const CHUNK_BYTES = 32 * 1024
export const MAX_FILE_BYTES = 100 * 1024 * 1024
const MAX_REACTIONS_OFFER = 500
/** Chunks sealed concurrently per batch: prep runs in parallel, sends stay ordered. */
export const CHUNK_SEAL_AHEAD = 8

/** Slice + base64 + seal one chunk. Shared by DM and group streaming. */
export async function sealChunkAt(
  blob: Blob,
  key: Uint8Array,
  seq: number,
): Promise<{ nonce: string; box: string }> {
  const slice = blob.slice(seq * CHUNK_BYTES, (seq + 1) * CHUNK_BYTES)
  const bytes = new Uint8Array(await slice.arrayBuffer())
  return seal(key, bytesToB64(bytes))
}

// Progress-UI throttle: a 25 MB file is 800 chunks — the store (and every
// progress bar) must not update 800 times. Reports at >=2 points of movement,
// at least every 250 ms, and always on completion.
const progSeen = new Map<string, { pct: number; ts: number }>()
export function shouldReportProgress(fileId: string, received: number, total: number): boolean {
  if (received >= total) {
    progSeen.delete(fileId)
    return true
  }
  const pct = Math.floor((received / Math.max(1, total)) * 100)
  const now = Date.now()
  const last = progSeen.get(fileId)
  if (!last || pct - last.pct >= 2 || now - last.ts >= 250) {
    progSeen.set(fileId, { pct, ts: now })
    return true
  }
  return false
}

/** Lowest missing chunk seq (for resume-from-gap instead of from-scratch). */
export function lowestMissing(parts: Map<number, unknown>, total: number): number {
  let i = 0
  while (i < total && parts.has(i)) i++
  return Math.min(i, Math.max(0, total - 1))
}

/** Group invite carried inside a pairwise-encrypted ctrl message. */
export interface CtrlInviteGroup {
  id: string
  name: string
  creator: string
  members: string[]
  epoch: number
  /** admin's current sender-chain key (base64), so the invitee can read onward */
  adminChain?: string
  adminSeq?: number
}

export interface CtrlInvitePayload {
  kind: 'ginvite'
  group: CtrlInviteGroup
}

export interface CtrlServerInvite {
  id: string
  name: string
  creator: string
  epoch: number
}

export interface CtrlServerInvitePayload {
  kind: 'sinvite'
  server: CtrlServerInvite
}

export type AnyInvitePayload = CtrlInvitePayload | CtrlServerInvitePayload

function shapeFile(raw: unknown): FileContent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const f = raw as Record<string, unknown>
  if (typeof f.id !== 'string' || typeof f.name !== 'string') return null
  if (typeof f.mime !== 'string' || typeof f.size !== 'number') return null
  if (f.size <= 0 || f.size > MAX_FILE_BYTES) return null
  if (f.name.length > 255) return null
  const out: FileContent = {
    id: f.id,
    name: f.name,
    mime: f.mime,
    size: f.size,
  }
  if (f.voice === true) out.voice = true
  if (typeof f.duration === 'number') out.duration = Math.min(3600, Math.max(0, f.duration))
  if (typeof f.thumb === 'string' && f.thumb.length < 100000) out.thumb = f.thumb
  return out
}

export function shapeContent(raw: unknown): MsgContent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Record<string, unknown>
  if (typeof c.body !== 'string' || c.body.length > 8000) return null
  if (c.replyTo !== null && typeof c.replyTo !== 'string') return null
  if (c.editedAt !== null && typeof c.editedAt !== 'number') return null
  const out: MsgContent = {
    body: c.body,
    replyTo: (c.replyTo as string | null) ?? null,
    editedAt: (c.editedAt as number | null) ?? null,
    deleted: c.deleted === true,
  }
  if (c.file !== undefined) {
    const file = shapeFile(c.file)
    if (!file) return null
    out.file = file
  }
  return out
}

function shapeEmoji(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if ([...trimmed].length === 0 || [...trimmed].length > 4) return null
  return trimmed
}

/** Assemble ordered base64 chunk plaintexts into a Blob. Null on corrupt input. */
export async function assembleBlob(ordered: string[], mime: string): Promise<Blob | null> {
  try {
    const bytes = ordered.map((b64) => {
      const bin = atob(b64)
      const u8 = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
      return u8
    })
    return new Blob(bytes as BlobPart[], { type: mime })
  } catch {
    return null
  }
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(bin)
}

export interface SendFileOpts {
  voice?: boolean
  duration?: number
  caption?: string
}

export interface ChatApi {
  handlers: MsgHandlers
  sendText: (friendId: string, body: string, replyTo?: string | null) => Promise<void>
  sendEdit: (friendId: string, id: string, body: string) => Promise<void>
  sendDelete: (friendId: string, id: string) => Promise<void>
  sendTyping: (friendId: string, typing: boolean) => Promise<void>
  sendReaction: (friendId: string, msgId: string, emoji: string) => Promise<void>
  sendPin: (friendId: string, msgId: string, pinned: boolean) => Promise<void>
  /** Returns error string when the file cannot be sent. */
  sendFile: (friendId: string, blob: Blob, name: string, opts?: SendFileOpts) => Promise<string | null>
  /** Ask the peer to stream a file's chunks (used for resume). */
  requestFile: (friendId: string, fileId: string, fromSeq?: number) => Promise<void>
  /** Ask a friend for their profile look (avatar/banner/theme/name style). */
  requestPeerProfile: (friendId: string) => Promise<void>
  /** Send a pairwise-encrypted control payload (group/server invites). */
  sendCtrl: (friendId: string, payload: AnyInvitePayload) => Promise<boolean>
  /** Register the invite receiver (wired by session to chat-group/chat-server). */
  onInvite: (cb: ((from: string, invite: AnyInvitePayload) => void) | null) => void
  /** Send 1:1 call signaling. Best-effort (no queue — a missed offer = missed call). */
  sendCall: (
    friendId: string,
    kind: 'offer' | 'accept' | 'decline' | 'hangup',
    callId: string,
  ) => Promise<boolean>
  /** Register the call-signal receiver (wired by session to the voice module). */
  onCallSignal: (
    cb:
      | ((from: string, kind: 'offer' | 'accept' | 'decline' | 'hangup', callId: string) => void)
      | null,
  ) => void
  /** Flush queued messages + ask for anything missed while offline. */
  peerBecameAvailable: (friendId: string) => Promise<void>
  /** Push our current look to every online friend (call after editing it). */
  broadcastOwnProfile: () => Promise<void>
}

let inviteHandler: ((from: string, invite: AnyInvitePayload) => void) | null = null
let callHandler:
  | ((from: string, kind: 'offer' | 'accept' | 'decline' | 'hangup', callId: string) => void)
  | null = null

export function bindChat(
  identity: Identity,
  p2p: () => P2P | null,
): ChatApi {
  const me = identity.userId
  const keys = new Map<string, Uint8Array>()

  async function keyFor(friendId: string): Promise<Uint8Array> {
    let k = keys.get(friendId)
    if (!k) {
      k = await sessionKey(identity.secretKey, friendId)
      keys.set(friendId, k)
    }
    return k
  }

  async function buildEnvelope(
    friendId: string,
    m: ChatMessage,
  ): Promise<MsgEnvelope> {
    const key = await keyFor(friendId)
    const content: MsgContent = {
      body: m.body,
      replyTo: m.replyTo,
      editedAt: m.editedAt,
      deleted: m.deleted,
    }
    if (m.file) {
      content.file = {
        id: m.file.id,
        name: m.file.name,
        mime: m.file.mime,
        size: m.file.size,
      }
      if (m.file.voice) content.file.voice = true
      if (typeof m.file.duration === 'number') content.file.duration = m.file.duration
      if (typeof m.file.thumb === 'string') content.file.thumb = m.file.thumb
    }
    const { nonce, box } = await seal(key, JSON.stringify(content))
    return {
      v: 1,
      id: m.id,
      to: friendId,
      from: me,
      ts: m.ts,
      rev: m.rev,
      nonce,
      box,
    }
  }

  async function transmit(friendId: string, m: ChatMessage): Promise<boolean> {
    try {
      const inst = p2p()
      if (!inst || inst.peerCount(friendId) === 0) return false
      await inst.sendAction(friendId, 'msg', await buildEnvelope(friendId, m))
      return true
    } catch {
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Outbox: 'sent' only ever meant "handed to the data channel" — if the ack is
  // lost (receiver offline again, ICE wedge, relay hiccup) the message used to
  // sit at 'sent' forever and was never retried (only 'queued' was flushed).
  // Now every un-acked message is retried here until the ack lands.
  // msgId -> ts of last transmit attempt / attempt count (in-memory only).
  const outboxSentAt = new Map<string, number>()
  const outboxAttempts = new Map<string, number>()
  const OUTBOX_RETRY_MS = 8000
  const OUTBOX_MAX_ATTEMPTS = 10

  // Retry sweep: re-transmits everything the ack never confirmed.
  setInterval(() => void flushOutbox().catch(() => {}), 4000)

  async function flushOutbox(): Promise<void> {
    const inst = p2p()
    if (!inst) return
    const now = Date.now()
    const due: Array<{ friendId: string; m: ChatMessage }> = []
    for (const [friendId, list] of Object.entries(useApp.getState().messages)) {
      if (inst.peerCount(friendId) === 0) continue
      for (const m of list) {
        if (!m.mine || m.deleted) continue
        if ((outboxAttempts.get(m.id) ?? 0) >= OUTBOX_MAX_ATTEMPTS) continue
        if (m.status === 'queued') due.push({ friendId, m })
        else if (
          m.status === 'sent' &&
          now - (outboxSentAt.get(m.id) ?? 0) >= OUTBOX_RETRY_MS
        ) {
          due.push({ friendId, m })
        }
      }
    }
    for (const { friendId, m } of due) {
      const inst2 = p2p()
      if (!inst2 || inst2.peerCount(friendId) === 0) break
      if (await transmit(friendId, m)) {
        outboxSentAt.set(m.id, Date.now())
        outboxAttempts.set(m.id, (outboxAttempts.get(m.id) ?? 0) + 1)
      } else break
    }
  }


  async function decrypt(
    friendId: string,
    env: MsgEnvelope,
  ): Promise<MsgContent | null> {
    const plain = await openBox(await keyFor(friendId), env.nonce, env.box)
    if (!plain) return null
    try {
      return shapeContent(JSON.parse(plain))
    } catch {
      return null
    }
  }

  function ingest(
    friendId: string,
    env: MsgEnvelope,
    content: MsgContent,
    ack: boolean,
  ): void {
    const file: FileMeta | undefined = content.file
      ? {
          id: content.file.id,
          name: content.file.name,
          mime: content.file.mime,
          size: content.file.size,
          voice: content.file.voice,
          duration: content.file.duration,
          thumb: content.file.thumb,
        }
      : undefined
    const s0 = useApp.getState()
    const isNew = !(s0.messages[friendId] ?? []).some((m) => m.id === env.id)
    useApp.getState().upsertMessage({
      id: env.id,
      friendId,
      mine: false,
      ts: env.ts,
      rev: env.rev,
      body: content.body,
      replyTo: content.replyTo,
      editedAt: content.editedAt,
      deleted: content.deleted,
      status: 'delivered',
      file,
    })
    if (file) {
      // Track + immediately request the bytes (meta and chunks may interleave).
      const total = Math.max(1, Math.ceil(file.size / CHUNK_BYTES))
      const s = useApp.getState()
      const cur = s.files[file.id]
      if (!cur || !cur.ready) {
        s.setFileProgress(file.id, {
          total,
          received: 0,
          ready: false,
          friendId,
        })
        void requestFile(friendId, file.id, 0).catch(() => {})
      }
    }
    if (ack) {
      void p2p()
        ?.sendAction(friendId, 'ack', { v: 1, to: friendId, from: me, ackId: env.id })
        .catch(() => {})
    }
    if (isNew && !content.deleted) {
      const preview = content.file
        ? (content.file.voice ? 'Voice message' : `File: ${content.file.name}`)
        : content.body
      alertIncomingDM(friendId, preview)
    }
  }

  // In-memory chunk assembly: fileId -> seq -> base64 plaintext bytes.
  const incoming = new Map<string, { friendId: string; parts: Map<number, string> }>()

  // Profile-image chunk assembly: `${from}:${kind}:${rev}` -> batches.
  const profImgIncoming = new Map<
    string,
    { mime: string; total: number; rev: number; parts: Map<number, string> }
  >()

  /** Drop streams a newer show superseded (sender saved again mid-stream). */
  function dropStaleProfileStreams(from: string, rev: number): void {
    for (const key of [...profImgIncoming.keys()]) {
      if (!key.startsWith(`${from}:`)) continue
      const entry = profImgIncoming.get(key)
      if (entry && entry.rev < rev) profImgIncoming.delete(key)
    }
  }

  function findFileMessage(friendId: string, fileId: string): ChatMessage | undefined {
    return (useApp.getState().messages[friendId] ?? []).find((m) => m.file?.id === fileId)
  }

  async function tryAssemble(friendId: string, fileId: string): Promise<void> {
    const entry = incoming.get(fileId)
    const msg = findFileMessage(friendId, fileId)
    if (!entry || !msg?.file) return
    const total = Math.max(1, Math.ceil(msg.file.size / CHUNK_BYTES))
    if (entry.parts.size < total) return
    const ordered: string[] = []
    for (let i = 0; i < total; i++) {
      const part = entry.parts.get(i)
      if (part === undefined) return
      ordered.push(part)
    }
    try {
      const bytes = ordered.map((b64) => {
        const bin = atob(b64)
        const u8 = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
        return u8
      })
      await putBlob(fileId, new Blob(bytes as BlobPart[], { type: msg.file.mime }))
      useApp.getState().markFileReady(fileId)
      incoming.delete(fileId)
    } catch {
      // Corrupt assembly — keep the good chunks, resume from the first gap.
      const missing = lowestMissing(entry.parts, total)
      incoming.delete(fileId)
      useApp.getState().setFileProgress(fileId, {
        total,
        received: 0,
        ready: false,
        friendId,
      })
      void requestFile(friendId, fileId, missing).catch(() => {})
    }
  }

  const handlers: MsgHandlers = {
    onUpsert: (env) => {
      void (async () => {
        const content = await decrypt(env.from, env)
        if (content) ingest(env.from, env, content, true)
      })()
    },
    onAck: (ackId, from) => {
      outboxSentAt.delete(ackId)
      outboxAttempts.delete(ackId)
      useApp.getState().markDelivered(from, ackId)
    },
    onTyping: (from, typing) => {
      useApp.getState().setTyping(from, typing ? Date.now() : 0)
    },
    onHistoryReq: (from, since) => {
      void (async () => {
        const inst = p2p()
        if (!inst) return
        const st = useApp.getState()
        const all = st.messages[from] ?? []
        const subset = all
          .filter((m) => m.ts > since)
          .sort((a, b) => a.ts - b.ts)
          .slice(-HISTORY_LIMIT)
        const msgs: MsgEnvelope[] = []
        for (const m of subset) {
          try {
            msgs.push(await buildEnvelope(from, m))
          } catch {
            // Skip undecryptable-for-them states; live channel covers the rest.
          }
        }
        const reactions: ReactionEntry[] = []
        const chatReacts = st.reactions[from] ?? {}
        for (const [msgId, byUser] of Object.entries(chatReacts)) {
          for (const [userId, emoji] of Object.entries(byUser)) {
            if (reactions.length >= MAX_REACTIONS_OFFER) break
            reactions.push({ msgId, userId, emoji })
          }
        }
        const offer: HOfferMsg = {
          v: 1,
          to: from,
          from: me,
          msgs,
          reactions,
          pins: st.pins[from] ?? [],
        }
        await inst.sendAction(from, 'hoffer', offer).catch(() => {})
      })()
    },
    onHistoryOffer: (from, offer) => {
      void (async () => {
        for (const env of offer.msgs) {
          if (env.from === me) continue // my own echoes — local is authoritative
          if (env.from !== from || env.to !== me) continue
          const content = await decrypt(from, env)
          if (content) ingest(from, env, content, false)
        }
        const s = useApp.getState()
        for (const r of offer.reactions ?? []) {
          if (typeof r.msgId !== 'string' || typeof r.userId !== 'string') continue
          const emoji = shapeEmoji(r.emoji)
          if (emoji === null) continue
          s.setReaction(from, r.msgId, r.userId, emoji)
        }
        const known = new Set(s.pins[from] ?? [])
        for (const id of offer.pins ?? []) {
          if (typeof id === 'string' && !known.has(id)) {
            known.add(id)
            s.setPin(from, id, true)
          }
        }
      })()
    },
    onReact: (from, msg) => {
      const emoji = shapeEmoji(msg.emoji)
      if (emoji === null && msg.emoji !== '') return
      useApp.getState().setReaction(from, msg.msgId, from, emoji ?? '')
    },
    onPin: (from, msg) => {
      useApp.getState().setPin(from, msg.msgId, msg.pinned === true)
    },
    onFileChunk: (from, msg) => {
      void (async () => {
        const meta = findFileMessage(from, msg.fileId)
        if (!meta?.file) return // unknown file — ignore (meta travels separately)
        if (msg.total <= 0 || msg.total > 4096) return
        if (msg.seq < 0 || msg.seq >= msg.total) return
        const plain = await openBox(await keyFor(from), msg.nonce, msg.box)
        if (!plain) return
        let entry = incoming.get(msg.fileId)
        if (!entry) {
          entry = { friendId: from, parts: new Map() }
          incoming.set(msg.fileId, entry)
        }
        if (!entry.parts.has(msg.seq)) {
          entry.parts.set(msg.seq, plain)
          // Throttled: a 25 MB file is 800 chunks — the progress bar must
          // not re-render 800 times. Assembly still runs per chunk (cheap).
          if (shouldReportProgress(msg.fileId, entry.parts.size, msg.total)) {
            const s = useApp.getState()
            const cur = s.files[msg.fileId]
            s.setFileProgress(msg.fileId, {
              total: msg.total,
              received: entry.parts.size,
              ready: cur?.ready ?? false,
              friendId: from,
            })
          }
        }
        await tryAssemble(from, msg.fileId)
      })()
    },
    onFileBatch: (from, msg) => {
      void (async () => {
        const meta = findFileMessage(from, msg.fileId)
        if (!meta?.file) return // unknown file — ignore (meta travels separately)
        if (msg.total <= 0 || msg.total > 4096) return
        if (
          typeof msg.baseSeq !== 'number' ||
          typeof msg.count !== 'number' ||
          msg.baseSeq < 0 ||
          msg.count <= 0 ||
          msg.count > FILE_BATCH_MAX ||
          msg.baseSeq + msg.count > msg.total
        )
          return
        if (typeof msg.nonce !== 'string' || typeof msg.box !== 'string' || msg.box.length > 262144) return
        const key = await keyFor(from)
        // One open for the whole batch (4× fewer crypto ops than per-chunk).
        const plain = await openBox(key, msg.nonce, msg.box)
        if (!plain) return
        let raw: Uint8Array
        try {
          const bin = atob(plain)
          raw = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i)
        } catch {
          return
        }
        let entry = incoming.get(msg.fileId)
        if (!entry) {
          entry = { friendId: from, parts: new Map() }
          incoming.set(msg.fileId, entry)
        }
        for (let i = 0; i < msg.count; i++) {
          const seq = msg.baseSeq + i
          if (entry.parts.has(seq)) continue
          const piece = raw.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)
          if (piece.length === 0) continue
          entry.parts.set(seq, bytesToB64(piece))
        }
        if (shouldReportProgress(msg.fileId, entry.parts.size, msg.total)) {
          const s = useApp.getState()
          const cur = s.files[msg.fileId]
          s.setFileProgress(msg.fileId, {
            total: msg.total,
            received: entry.parts.size,
            ready: cur?.ready ?? false,
            friendId: from,
          })
        }
        await tryAssemble(from, msg.fileId)
      })()
    },
    onFileGet: (from, msg) => {
      void (async () => {
        const blob = await getBlob(msg.fileId)
        if (!blob) return
        // Only serve files that belong to a message in this chat.
        if (!findFileMessage(from, msg.fileId)?.file) return
        await streamChunks(from, msg.fileId, blob, Math.max(0, msg.fromSeq | 0))
      })()
    },
    onProfileGet: (from) => {
      // They opened our profile: answer with our look (best effort).
      void sendPeerProfile(from).catch(() => {})
    },
    onProfileImg: (from, msg) => {
      void (async () => {
        try {
          if (msg.total < 1 || msg.total > PROF_IMG_MAX_CHUNKS) return
          if (msg.count < 1 || msg.count > PROF_IMG_BATCH) return
          if (msg.baseSeq < 0 || msg.baseSeq + msg.count > msg.total) return
          if (!msg.mime.startsWith('image/') || msg.mime.length > 64) return
          if (msg.box.length > 262144) return
          const key = await keyFor(from)
          const plain = await openBox(key, msg.nonce, msg.box)
          if (!plain) return
          let raw: Uint8Array
          try {
            const bin = atob(plain)
            if (bin.length <= 0 || bin.length > PROF_IMG_BATCH * CHUNK_BYTES) return
            raw = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i)
          } catch {
            return
          }
          const streamKey = `${from}:${msg.kind}:${msg.rev}`
          let entry = profImgIncoming.get(streamKey)
          if (!entry) {
            entry = { mime: msg.mime.slice(0, 64), total: msg.total, rev: msg.rev, parts: new Map() }
            profImgIncoming.set(streamKey, entry)
          }
          if (entry.total !== msg.total) return
          for (let i = 0; i < msg.count; i++) {
            const seq = msg.baseSeq + i
            if (entry.parts.has(seq)) continue
            const piece = raw.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)
            if (piece.length === 0) continue
            entry.parts.set(seq, bytesToB64(piece))
          }
          if (entry.parts.size < entry.total) return
          // Complete: assemble, attach to their cached profile, notify views.
          const ordered: string[] = []
          for (let i = 0; i < entry.total; i++) {
            const part = entry.parts.get(i)
            if (part === undefined) return
            ordered.push(part)
          }
          profImgIncoming.delete(streamKey)
          const mod = await import('./profile')
          const cached = await mod.loadPeerProfile(from).catch(() => null)
          if (cached && cached.at > entry.rev) return // superseded mid-stream
          const blob = await assembleBlob(ordered, entry.mime).catch(() => null)
          if (!blob || blob.size <= 0 || blob.size > PROF_MAX_BYTES) return
          await mod.savePeerBlob(from, msg.kind, blob)
          const next = {
            themePrimary: cached?.themePrimary ?? '#7c6cff',
            themeAccent: cached?.themeAccent ?? '#3ddc84',
            nameStyle: cached?.nameStyle ?? 'default',
            bio: cached?.bio ?? '',
            avatarMime: msg.kind === 'avatar' ? entry.mime : (cached?.avatarMime ?? null),
            bannerMime: msg.kind === 'banner' ? entry.mime : (cached?.bannerMime ?? null),
            bannerCss: cached?.bannerCss ?? null,
            // Versioned streams keep the sender's rev; otherwise stamp now.
            at: entry.rev > 0 ? Math.max(entry.rev, cached?.at ?? 0) : Date.now(),
          }
          await mod.savePeerProfile(from, next)
          useApp.getState().bumpPeerProfileTick()
        } catch {
          // corrupt chunk — the stream stays incomplete until re-sent
        }
      })()
    },
    onProfileShow: (from, msg) => {
      void (async () => {
        try {
          const mod = await import('./profile')
          // Stale/duplicate replay? The sender versions every save, so an
          // older VERSIONED show arriving late must not overwrite the cached
          // newer look. Unversioned shows (older builds) carry no rev — a
          // freshly-decrypted arrival is live data, always accept it.
          const rev = typeof msg.rev === 'number' && Number.isFinite(msg.rev) ? msg.rev : 0
          const cached = await mod.loadPeerProfile(from).catch(() => null)
          if (cached && rev > 0 && rev <= cached.at) return
          // A newer show supersedes any chunk stream still assembling.
          dropStaleProfileStreams(from, rev)
          const hex = (v: unknown, fb: string): string =>
            typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb
          const key = await keyFor(from)
          const openImage = async (
            mime: unknown,
            nonce: unknown,
            box: unknown,
            capBytes: number,
          ): Promise<Blob | null> => {
            if (typeof mime !== 'string' || !mime.startsWith('image/')) return null
            if (typeof nonce !== 'string' || typeof box !== 'string') return null
            if (box.length > capBytes * 2) return null
            const plain = await openBox(key, nonce, box)
            if (!plain) return null
            try {
              const bin = atob(plain)
              if (bin.length <= 0 || bin.length > capBytes) return null
              const u8 = new Uint8Array(bin.length)
              for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
              return new Blob([u8], { type: mime.slice(0, 64) })
            } catch {
              return null
            }
          }
          const [avatarBlob, bannerBlob] = await Promise.all([
            openImage(msg.avatarMime, msg.avatarNonce, msg.avatarBox, 384 * 1024),
            openImage(msg.bannerMime, msg.bannerNonce, msg.bannerBox, 768 * 1024),
          ])
          // Large images ride as 'pimg' chunks AFTER this descriptor: keep the
          // old bytes until they land (never blank the avatar on a pending
          // stream), and only clear when the sender truly removed the image.
          const pending = (
            mime: unknown,
            size: unknown,
          ): string | null => {
            if (typeof mime !== 'string' || !mime.startsWith('image/')) return null
            if (typeof size !== 'number' || !Number.isFinite(size)) return null
            if (size <= PROF_INLINE_BYTES || size > PROF_MAX_BYTES) return null
            return mime.slice(0, 64)
          }
          const avatarPending = !avatarBlob ? pending(msg.avatarMime, msg.avatarSize) : null
          const bannerPending = !bannerBlob ? pending(msg.bannerMime, msg.bannerSize) : null
          // Unversioned senders (older builds) OMIT images they couldn't fit —
          // that is not a removal. Only a versioned show explicitly without an
          // image means "removed", so unversioned gaps keep the cached look.
          const unversioned = rev === 0
          const profile = {
            themePrimary: hex(msg.themePrimary, '#7c6cff'),
            themeAccent: hex(msg.themeAccent, '#3ddc84'),
            nameStyle: typeof msg.nameStyle === 'string' ? msg.nameStyle.slice(0, 32) : 'default',
            bio: typeof msg.bio === 'string' ? msg.bio.slice(0, 200) : (unversioned ? (cached?.bio ?? '') : ''),
            avatarMime: avatarBlob?.type ?? avatarPending ?? (unversioned ? (cached?.avatarMime ?? null) : null),
            bannerMime: bannerBlob?.type ?? bannerPending ?? (unversioned ? (cached?.bannerMime ?? null) : null),
            bannerCss:
              typeof msg.bannerCss === 'string' && !bannerBlob
                ? msg.bannerCss.slice(0, 200)
                : unversioned
                  ? (cached?.bannerCss ?? null)
                  : null,
            // Version the cache with the sender's rev so late duplicates lose.
            at: rev > 0 ? rev : Date.now(),
          }
          if (avatarBlob) await mod.savePeerBlob(from, 'avatar', avatarBlob)
          else if (!avatarPending && !unversioned && cached?.avatarMime) await mod.dropPeerBlob(from, 'avatar')
          if (bannerBlob) await mod.savePeerBlob(from, 'banner', bannerBlob)
          else if (!bannerPending && !unversioned && cached?.bannerMime) await mod.dropPeerBlob(from, 'banner')
          await mod.savePeerProfile(from, profile)
          useApp.getState().bumpPeerProfileTick()
        } catch {
          // corrupt profile — keep the cache we have
        }
      })()
    },
    onCtrl: (from, msg) => {
      void (async () => {
        const plain = await openBox(await keyFor(from), msg.nonce, msg.box)
        if (!plain) return
        try {
          const data = JSON.parse(plain) as {
            kind?: unknown
            group?: unknown
            server?: unknown
          }
          if (data.kind === 'ginvite' && typeof data.group === 'object' && data.group !== null) {
            const g = data.group as Record<string, unknown>
            if (
              typeof g.id !== 'string' ||
              typeof g.name !== 'string' ||
              typeof g.creator !== 'string' ||
              !Array.isArray(g.members) ||
              typeof g.epoch !== 'number'
            )
              return
            inviteHandler?.(from, {
              kind: 'ginvite',
              group: {
                id: g.id,
                name: g.name,
                creator: g.creator,
                members: g.members.filter((x): x is string => typeof x === 'string'),
                epoch: g.epoch,
                adminChain: typeof g.adminChain === 'string' ? g.adminChain : undefined,
                adminSeq: typeof g.adminSeq === 'number' ? g.adminSeq : undefined,
              },
            })
          } else if (data.kind === 'sinvite' && typeof data.server === 'object' && data.server !== null) {
            const sv = data.server as Record<string, unknown>
            if (
              typeof sv.id !== 'string' ||
              typeof sv.name !== 'string' ||
              typeof sv.creator !== 'string' ||
              typeof sv.epoch !== 'number'
            )
              return
            inviteHandler?.(from, {
              kind: 'sinvite',
              server: { id: sv.id, name: sv.name, creator: sv.creator, epoch: sv.epoch },
            })
          }
        } catch {
          // malformed ctrl — ignore
        }
      })()
    },
    onCall: (from, msg) => {
      callHandler?.(from, msg.kind, msg.callId)
    },
  }

  /** Stream (or re-stream) a file's E2EE chunks to a peer. */
  async function streamChunks(
    friendId: string,
    fileId: string,
    blob: Blob,
    fromSeq = 0,
  ): Promise<void> {
    const inst = p2p()
    if (!inst) return
    const key = await keyFor(friendId)
    const total = Math.max(1, Math.ceil(blob.size / CHUNK_BYTES))
    // Batched fast path when the peer announced v2: one sealed box per
    // FILE_BATCH_SIZE chunks (4× fewer crypto ops + messages). Legacy
    // per-chunk stream otherwise (mixed-version safe).
    const batched = inst.peerSupportsBatch(friendId)
    if (batched) {
      for (let s = fromSeq; s < total; s += FILE_BATCH_SIZE) {
        if (inst.peerCount(friendId) === 0) break
        const count = Math.min(FILE_BATCH_SIZE, total - s)
        const slice = blob.slice(s * CHUNK_BYTES, (s + count) * CHUNK_BYTES)
        const bytes = new Uint8Array(await slice.arrayBuffer())
        const { nonce, box } = await seal(key, bytesToB64(bytes))
        await inst
          .sendAction(friendId, 'fbatch', {
            v: 1,
            to: friendId,
            from: me,
            fileId,
            total,
            baseSeq: s,
            count,
            nonce,
            box,
          })
          .catch(() => {})
      }
      return
    }
    for (let base = fromSeq; base < total; base += CHUNK_SEAL_AHEAD) {
      if (inst.peerCount(friendId) === 0) break
      // Seal the batch concurrently; sends stay in order on the wire.
      const end = Math.min(total, base + CHUNK_SEAL_AHEAD)
      const sealed = await Promise.all(
        Array.from({ length: end - base }, (_, i) => sealChunkAt(blob, key, base + i)),
      )
      for (let i = 0; i < sealed.length; i++) {
        if (inst.peerCount(friendId) === 0) return
        await inst
          .sendAction(friendId, 'fchunk', {
            v: 1,
            to: friendId,
            from: me,
            fileId,
            seq: base + i,
            total,
            nonce: sealed[i].nonce,
            box: sealed[i].box,
          })
          .catch(() => {})
      }
      // Yield between batches so the receive path gets event-loop time.
      if (end < total) await new Promise((r) => setTimeout(r, 0))
    }
  }

  async function makeThumb(blob: Blob): Promise<string | undefined> {
    if (!blob.type.startsWith('image/')) return undefined
    try {
      const bmp = await createImageBitmap(blob)
      const scale = Math.min(1, 320 / Math.max(bmp.width, bmp.height))
      const w = Math.max(1, Math.round(bmp.width * scale))
      const h = Math.max(1, Math.round(bmp.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return undefined
      ctx.drawImage(bmp, 0, 0, w, h)
      const url = canvas.toDataURL('image/jpeg', 0.7)
      return url.length < 80000 ? url : undefined
    } catch {
      return undefined
    }
  }

  async function sendText(
    friendId: string,
    body: string,
    replyTo: string | null = null,
  ): Promise<void> {
    const text = body.trim()
    if (!text) return
    const m: ChatMessage = {
      id: crypto.randomUUID(),
      friendId,
      mine: true,
      ts: Date.now(),
      rev: 1,
      body: text.slice(0, 4000),
      replyTo,
      editedAt: null,
      deleted: false,
      status: 'queued',
    }
    const s = useApp.getState()
    s.upsertMessage(m)
    if (await transmit(friendId, m)) s.setStatus(friendId, m.id, 'sent')
  }

  async function sendEdit(
    friendId: string,
    id: string,
    body: string,
  ): Promise<void> {
    const text = body.trim()
    if (!text) return
    const s = useApp.getState()
    const cur = (s.messages[friendId] ?? []).find((m) => m.id === id)
    if (!cur || !cur.mine || cur.deleted) return
    const next: ChatMessage = {
      ...cur,
      rev: cur.rev + 1,
      body: text.slice(0, 4000),
      editedAt: Date.now(),
      status: 'queued',
    }
    s.upsertMessage(next)
    if (await transmit(friendId, next)) s.setStatus(friendId, id, 'sent')
  }

  async function sendDelete(friendId: string, id: string): Promise<void> {
    const s = useApp.getState()
    const cur = (s.messages[friendId] ?? []).find((m) => m.id === id)
    if (!cur || !cur.mine || cur.deleted) return
    const next: ChatMessage = {
      ...cur,
      rev: cur.rev + 1,
      body: '',
      deleted: true,
      status: 'queued',
    }
    s.upsertMessage(next)
    if (await transmit(friendId, next)) s.setStatus(friendId, id, 'sent')
  }

  async function sendReaction(friendId: string, msgId: string, emoji: string): Promise<void> {
    const clean = shapeEmoji(emoji)
    if (clean === null && emoji !== '') return
    const value = clean ?? ''
    // Toggle: tapping your own reaction removes it.
    const s = useApp.getState()
    const mine = s.reactions[friendId]?.[msgId]?.[me]
    const finalEmoji = mine === value && value !== '' ? '' : value
    s.setReaction(friendId, msgId, me, finalEmoji)
    const inst = p2p()
    if (!inst || inst.peerCount(friendId) === 0) return
    await inst
      .sendAction(friendId, 'react', { v: 1, to: friendId, from: me, msgId, emoji: finalEmoji })
      .catch(() => {})
  }

  async function sendPin(friendId: string, msgId: string, pinned: boolean): Promise<void> {
    useApp.getState().setPin(friendId, msgId, pinned)
    const inst = p2p()
    if (!inst || inst.peerCount(friendId) === 0) return
    await inst
      .sendAction(friendId, 'pin', { v: 1, to: friendId, from: me, msgId, pinned })
      .catch(() => {})
  }

  async function sendFile(
    friendId: string,
    blob: Blob,
    name: string,
    opts: SendFileOpts = {},
  ): Promise<string | null> {
    if (blob.size <= 0) return 'That file is empty.'
    if (blob.size > MAX_FILE_BYTES) return 'Files are capped at 25 MB for now.'
    const safeName = name.slice(0, 255) || 'file'
    const fileId = crypto.randomUUID()
    const thumb = await makeThumb(blob).catch(() => undefined)
    const m: ChatMessage = {
      id: crypto.randomUUID(),
      friendId,
      mine: true,
      ts: Date.now(),
      rev: 1,
      body: (opts.caption ?? '').trim().slice(0, 4000),
      replyTo: null,
      editedAt: null,
      deleted: false,
      status: 'queued',
      file: {
        id: fileId,
        name: safeName,
        mime: blob.type || 'application/octet-stream',
        size: blob.size,
        voice: opts.voice,
        duration: opts.duration,
        thumb,
      },
    }
    const s = useApp.getState()
    await putBlob(fileId, blob).catch(() => {})
    s.upsertMessage(m)
    s.setFileProgress(fileId, {
      total: Math.max(1, Math.ceil(blob.size / CHUNK_BYTES)),
      received: 0,
      ready: true,
      friendId,
    })
    if (await transmit(friendId, m)) {
      s.setStatus(friendId, m.id, 'sent')
      await streamChunks(friendId, fileId, blob).catch(() => {})
    }
    return null
  }

  async function requestFile(friendId: string, fileId: string, fromSeq = 0): Promise<void> {
    const inst = p2p()
    if (!inst || inst.peerCount(friendId) === 0) return
    await inst
      .sendAction(friendId, 'fget', { v: 1, to: friendId, from: me, fileId, fromSeq })
      .catch(() => {})
  }

  async function requestPeerProfile(friendId: string): Promise<void> {
    const inst = p2p()
    if (!inst || inst.peerCount(friendId) === 0) return
    await inst
      .sendAction(friendId, 'profget', { v: 1, to: friendId, from: me })
      .catch(() => {})
  }

  async function loadProfileBlob(
    kind: 'avatar' | 'banner',
    ref: { id: string } | null | undefined,
  ): Promise<Blob | null> {
    if (!ref) return null
    try {
      const mod = await import('./profile')
      return kind === 'avatar' ? mod.loadAvatar(ref.id) : mod.loadBanner(ref.id)
    } catch {
      return null
    }
  }

  /** Seal a profile image for transport (null when missing/oversize). */
  async function sealProfileImage(
    friendId: string,
    load: () => Promise<Blob | null>,
    capBytes: number,
  ): Promise<{ mime: string; nonce: string; box: string } | null> {    try {
      const blob = await load()
      if (!blob || blob.size <= 0 || blob.size > capBytes) return null
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const { nonce, box } = await seal(await keyFor(friendId), bytesToB64(bytes))
      return { mime: blob.type || 'application/octet-stream', nonce, box }
    } catch {
      return null
    }
  }

  // Profile images bigger than one sealed box (GIF avatars/banners) ride as
  // 'pimg' chunk batches: 4×32 KB plaintext per message, same sizing as file
  // transfers, so every message stays under the ~256 KB SCTP ceiling.
  // ≤96 KB goes inline in profshow (old clients still render those).
  const PROF_INLINE_BYTES = 96 * 1024
  const PROF_MAX_BYTES = 8 * 1024 * 1024
  const PROF_IMG_BATCH = 4
  const PROF_IMG_MAX_CHUNKS = 256

  async function streamProfileImage(
    friendId: string,
    kind: 'avatar' | 'banner',
    rev: number,
    blob: Blob,
  ): Promise<void> {
    const inst = p2p()
    if (!inst) return
    const key = await keyFor(friendId)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const total = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES))
    const mime = blob.type || 'application/octet-stream'
    for (let s = 0; s < total; s += PROF_IMG_BATCH) {
      if (inst.peerCount(friendId) === 0) break
      const count = Math.min(PROF_IMG_BATCH, total - s)
      const slice = bytes.subarray(s * CHUNK_BYTES, (s + count) * CHUNK_BYTES)
      const { nonce, box } = await seal(key, bytesToB64(slice))
      await inst
        .sendAction(friendId, 'pimg', {
          v: 1,
          to: friendId,
          from: me,
          kind,
          rev,
          mime,
          total,
          baseSeq: s,
          count,
          nonce,
          box,
        })
        .catch(() => {})
    }
  }

  async function sendPeerProfile(friendId: string): Promise<void> {
    const inst = p2p()
    if (!inst || inst.peerCount(friendId) === 0) return
    const p = useApp.getState().profile
    const rev = p.updatedAt ?? 0
    const bannerRef = p.banner?.kind === 'image' ? p.banner : null
    const [avatarBlob, bannerBlob] = await Promise.all([
      p.avatar ? loadProfileBlob('avatar', p.avatar).catch(() => null) : null,
      bannerRef ? loadProfileBlob('banner', bannerRef).catch(() => null) : null,
    ])
    // Small images inline; large ones as chunked follow-ups (descriptor here).
    const avatarInline =
      avatarBlob && avatarBlob.size > 0 && avatarBlob.size <= PROF_INLINE_BYTES
        ? await sealProfileImage(friendId, async () => avatarBlob, PROF_INLINE_BYTES).catch(() => null)
        : null
    const bannerInline =
      bannerBlob && bannerBlob.size > 0 && bannerBlob.size <= PROF_INLINE_BYTES
        ? await sealProfileImage(friendId, async () => bannerBlob, PROF_INLINE_BYTES).catch(() => null)
        : null
    const avatarChunked =
      !avatarInline && avatarBlob && avatarBlob.size > PROF_INLINE_BYTES && avatarBlob.size <= PROF_MAX_BYTES
        ? avatarBlob
        : null
    const bannerChunked =
      !bannerInline && bannerBlob && bannerBlob.size > PROF_INLINE_BYTES && bannerBlob.size <= PROF_MAX_BYTES
        ? bannerBlob
        : null
    await inst
      .sendAction(friendId, 'profshow', {
        v: 1,
        to: friendId,
        from: me,
        rev,
        themePrimary: p.themePrimary,
        themeAccent: p.themeAccent,
        nameStyle: p.nameStyle,
        bio: typeof p.bio === 'string' ? p.bio.slice(0, 200) : '',
        ...(avatarInline
          ? { avatarMime: avatarInline.mime, avatarNonce: avatarInline.nonce, avatarBox: avatarInline.box }
          : avatarChunked
            ? { avatarMime: avatarChunked.type || 'application/octet-stream', avatarSize: avatarChunked.size }
            : {}),
        ...(bannerInline
          ? { bannerMime: bannerInline.mime, bannerNonce: bannerInline.nonce, bannerBox: bannerInline.box }
          : bannerChunked
            ? { bannerMime: bannerChunked.type || 'application/octet-stream', bannerSize: bannerChunked.size }
            : {}),
        ...(p.banner?.kind === 'gradient' ? { bannerCss: p.banner.value } : {}),
      })
      .catch(() => {})
    // Chunks after the descriptor so the receiver knows to expect them.
    // Skip the stream when the peer is known-old (fv<3 ignores 'pimg');
    // unknown (no hello yet) still gets it — hellos usually land first.
    const peerProto = inst.peerFileVersionOf(friendId)
    const canChunk = peerProto === 0 || peerProto >= 3
    if (avatarChunked && canChunk) await streamProfileImage(friendId, 'avatar', rev, avatarChunked).catch(() => {})
    if (bannerChunked && canChunk) await streamProfileImage(friendId, 'banner', rev, bannerChunked).catch(() => {})
  }

  /** Push our current look to every online friend (fire-and-forget).
   * Called after editing our profile and when a peer returns, so their
   * cache updates without them having to hit Refresh. */
  async function broadcastOwnProfile(): Promise<void> {
    const inst = p2p()
    if (!inst) return
    const friends = useApp.getState().friends
    await Promise.all(friends.map((f) => sendPeerProfile(f.userId).catch(() => {})))
  }
  async function sendTyping(friendId: string, typing: boolean): Promise<void> {
    const inst = p2p()
    if (!inst || inst.peerCount(friendId) === 0) return
    await inst
      .sendAction(friendId, 'typing', { v: 1, to: friendId, from: me, typing })
      .catch(() => {})
  }

  async function requestHistory(friendId: string): Promise<void> {
    const inst = p2p()
    if (!inst || inst.peerCount(friendId) === 0) return
    const all = useApp.getState().messages[friendId] ?? []
    const since = all.reduce((max, m) => Math.max(max, m.ts), 0)
    const req: HReqMsg = { v: 1, to: friendId, from: me, since }
    await inst.sendAction(friendId, 'hreq', req).catch(() => {})
  }

  async function peerBecameAvailable(friendId: string): Promise<void> {
    const s = useApp.getState()
    // They just came online — push our look so their cache is current
    // without them having to Refresh, then do the usual catch-up.
    await sendPeerProfile(friendId).catch(() => {})
    // Fresh peer join: give every un-acked message a fresh round of attempts.
    for (const m of s.messages[friendId] ?? []) {
      if (m.mine) outboxAttempts.delete(m.id)
    }
    const queued = (s.messages[friendId] ?? []).filter(
      (m) =>
        m.mine &&
        (m.status === 'queued' ||
          (m.status === 'sent' &&
            Date.now() - (outboxSentAt.get(m.id) ?? 0) >= OUTBOX_RETRY_MS)),
    )
    for (const m of queued) {
      if (await transmit(friendId, m)) s.setStatus(friendId, m.id, 'sent')
      else break // peer dropped mid-flush; rest stays queued
    }
    // (Re)stream my files' bytes, and re-request bytes I'm still missing.
    for (const m of s.messages[friendId] ?? []) {
      if (!m.file || m.deleted) continue
      if (m.mine) {
        const blob = await getBlob(m.file.id).catch(() => null)
        if (blob) await streamChunks(friendId, m.file.id, blob).catch(() => {})
      } else {
        const cur = useApp.getState().files[m.file.id]
        if (!cur?.ready) {
          await requestFile(friendId, m.file.id, cur?.received ?? 0).catch(() => {})
        }
      }
    }
    await requestHistory(friendId)
  }

  async function sendCtrl(friendId: string, payload: AnyInvitePayload): Promise<boolean> {
    try {
      const inst = p2p()
      if (!inst || inst.peerCount(friendId) === 0) return false
      const { nonce, box } = await seal(await keyFor(friendId), JSON.stringify(payload))
      await inst.sendAction(friendId, 'ctrl', { v: 1, to: friendId, from: me, nonce, box })
      return true
    } catch {
      return false
    }
  }

  function onInvite(cb: ((from: string, invite: AnyInvitePayload) => void) | null): void {
    inviteHandler = cb
  }

  async function sendCall(
    friendId: string,
    kind: 'offer' | 'accept' | 'decline' | 'hangup',
    callId: string,
  ): Promise<boolean> {
    try {
      const inst = p2p()
      if (!inst) return false
      await inst.sendAction(friendId, 'call', { v: 1, to: friendId, from: me, kind, callId })
      return true
    } catch {
      return false
    }
  }

  function onCallSignal(
    cb: ((from: string, kind: 'offer' | 'accept' | 'decline' | 'hangup', callId: string) => void) | null,
  ): void {
    callHandler = cb
  }

  // Chunk assembly is memory-only: anything incomplete at startup restarts.
  for (const [fileId, t] of Object.entries(useApp.getState().files)) {
    if (!t.ready && t.received > 0) {
      useApp.getState().setFileProgress(fileId, { ...t, received: 0 })
    }
  }

  return {
    handlers,
    sendText,
    sendEdit,
    sendDelete,
    sendTyping,
    sendReaction,
    sendPin,
    sendFile,
    requestFile,
    requestPeerProfile,
    sendCtrl,
    onInvite,
    sendCall,
    onCallSignal,
    peerBecameAvailable,
    broadcastOwnProfile,
  }
}
