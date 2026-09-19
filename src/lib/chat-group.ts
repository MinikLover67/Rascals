// Group chats: MLS-lite with per-sender ratcheting chain keys.
//
// Model:
// - Group room id is public-ish; security comes from E2EE + identity signatures.
// - Each member owns a sender chain: every message consumes one message key and
//   ratchets the chain forward (forward secrecy). Chain keys are distributed
//   sealed (crypto_box_seal) to each member's curve pubkey, so only the intended
//   reader opens them.
// - Membership changes are signed control messages from the creator (admin).
//   Removes rotate everyone's chains (backward secrecy). Adds do not rotate:
//   the newcomer receives current chains and cannot read prior history.
// - Offline members catch up via greq/goffer (original envelopes re-served
//   verbatim) plus a control log, and via gkeys re-broadcast on every greq.
//
// Chat keys for groups are 'g:' + group id (DM keys are bare userIds), so all
// message/reaction/pin/typing/draft/read/file state reuses the DM machinery.

import sodium from 'libsodium-wrappers'
import { alertIncomingGroup } from './alerts'
import { openBox, seal } from './box'
import { signText, verifyText } from './crypto'
import { getBlob, putBlob } from './idb'
import type { Identity } from './identity'
import {
  assembleBlob,
  bytesToB64,
  CHUNK_BYTES,
  MAX_FILE_BYTES,
  shapeContent,
  type AnyInvitePayload,
  type CtrlInvitePayload,
  type MsgContent,
  type SendFileOpts,
} from './chat'
import type {
  GCtrl,
  GKey,
  GMsg,
  GroupHandlers,
  P2P,
} from './p2p'
import {
  groupChatKey,
  useApp,
  type ChatMessage,
  type GroupInfo,
} from '../store/app'

const B64U = () => sodium.base64_variants.URLSAFE_NO_PADDING
const HISTORY_LIMIT = 200
const MAX_SKIP = 500
const CTRL_LOG_CAP = 100

export interface GroupApi {
  handlers: GroupHandlers
  createGroup: (name: string, memberIds: string[]) => Promise<string>
  handleInvite: (from: string, invite: CtrlInvitePayload) => Promise<void>
  joinAll: () => Promise<void>
  sendText: (chatKey: string, body: string, replyTo?: string | null) => Promise<void>
  sendEdit: (chatKey: string, id: string, body: string) => Promise<void>
  sendDelete: (chatKey: string, id: string) => Promise<void>
  sendTyping: (chatKey: string, typing: boolean, name: string) => Promise<void>
  sendReaction: (chatKey: string, msgId: string, emoji: string) => Promise<void>
  sendPin: (chatKey: string, msgId: string, pinned: boolean) => Promise<void>
  sendFile: (chatKey: string, blob: Blob, name: string, opts?: SendFileOpts) => Promise<string | null>
  requestFile: (chatKey: string, fileId: string, fromSeq?: number) => Promise<void>
  addMember: (groupId: string, friendId: string) => Promise<string | null>
  removeMember: (groupId: string, victimId: string) => Promise<string | null>
  leaveGroup: (groupId: string) => Promise<void>
  resendInvites: (friendId: string) => Promise<void>
  groupAvailable: (groupId: string) => Promise<void>
  /** Join a group room (idempotent). Used for server channels. */
  ensureRoom: (groupId: string) => Promise<void>
  /** Create a group record without DM invites (server channels use the descriptor). */
  createBareGroup: (
    name: string,
    members: string[],
    opts?: { serverId?: string; topic?: string },
  ) => Promise<string>
  /** Drop a room + keys + record without posting ctrls (server-managed teardown). */
  dropRoom: (groupId: string) => Promise<void>
  /** Overwrite a channel's member list from the server descriptor. Returns added members. */
  syncChannelMembers: (groupId: string, members: string[]) => Promise<string[]>
  /** Fresh chain + share with current members. Used when server membership shrinks. */
  rotateGroupChain: (groupId: string) => Promise<void>
  /** Share my current chain with specific members. */
  shareKey: (groupId: string, toList: string[]) => Promise<void>
}

function gidOf(chatKey: string): string {
  return chatKey.startsWith('g:') ? chatKey.slice(2) : chatKey
}

function shapeEmoji(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if ([...trimmed].length === 0 || [...trimmed].length > 4) return null
  return trimmed
}

export function bindGroupChat(
  identity: Identity,
  p2p: () => P2P | null,
  deps: { sendDmCtrl: (friendId: string, payload: AnyInvitePayload) => Promise<boolean> },
): GroupApi {
  const me = identity.userId

  // In-memory chain caches (persisted b64 lives in the store).
  const myChains = new Map<string, { key: Uint8Array; seq: number }>()
  const peerChains = new Map<string, Map<string, { key: Uint8Array; seq: number }>>()
  // groupId -> ctrl log for offline catch-up
  const ctrlLogs = new Map<string, GCtrl[]>()
  // groupId -> sender -> envelopes waiting for a chain key
  const pending = new Map<string, Map<string, GMsg[]>>()
  // fileId -> seq -> base64 chunk plaintext
  const incoming = new Map<string, { chatKey: string; parts: Map<number, string> }>()

  let curveSec: Uint8Array | null = null
  let curvePub: Uint8Array | null = null

  async function curveKeys(): Promise<{ sec: Uint8Array; pub: Uint8Array }> {
    await sodium.ready
    if (!curveSec || !curvePub) {
      curveSec = sodium.crypto_sign_ed25519_sk_to_curve25519(sodium.from_base64(identity.secretKey))
      curvePub = sodium.crypto_sign_ed25519_pk_to_curve25519(sodium.from_base64(me, B64U()))
    }
    return { sec: curveSec, pub: curvePub }
  }

  async function curvePubOf(userId: string): Promise<Uint8Array> {
    await sodium.ready
    return sodium.crypto_sign_ed25519_pk_to_curve25519(sodium.from_base64(userId, B64U()))
  }

  function groupOf(groupId: string): GroupInfo | undefined {
    return useApp.getState().groups[groupId]
  }

  function isMember(g: GroupInfo, uid: string): boolean {
    return g.members.includes(uid)
  }

  async function myChain(groupId: string): Promise<{ key: Uint8Array; seq: number }> {
    let c = myChains.get(groupId)
    if (!c) {
      await sodium.ready
      const stored = useApp.getState().gkeys.my[groupId]
      if (stored) {
        c = { key: sodium.from_base64(stored.key), seq: stored.seq }
      } else {
        c = { key: sodium.randombytes_buf(32), seq: 0 }
        useApp.getState().setMyChain(groupId, sodium.to_base64(c.key), 0)
      }
      myChains.set(groupId, c)
    }
    return c
  }

  function peerChain(groupId: string, uid: string): { key: Uint8Array; seq: number } | undefined {
    let m = peerChains.get(groupId)
    if (!m) {
      m = new Map()
      const stored = useApp.getState().gkeys.peers[groupId] ?? {}
      for (const [u, v] of Object.entries(stored)) {
        try {
          m.set(u, { key: sodium.from_base64(v.key), seq: v.seq })
        } catch {
          // corrupt entry — will be replaced on next gkey
        }
      }
      peerChains.set(groupId, m)
    }
    return m.get(uid)
  }

  function setPeerChain(groupId: string, uid: string, key: Uint8Array, seq: number): void {
    let m = peerChains.get(groupId)
    if (!m) {
      m = new Map()
      peerChains.set(groupId, m)
    }
    m.set(uid, { key, seq })
    useApp.getState().setPeerChain(groupId, uid, sodium.to_base64(key), seq)
  }

  /** Consume the next message key from my chain (ratchets forward). */
  async function nextSendKey(groupId: string): Promise<{ msgKey: Uint8Array; seq: number }> {
    await sodium.ready
    const c = await myChain(groupId)
    const msgKey = sodium.crypto_generichash(32, c.key, null)
    const next = sodium.crypto_generichash(32, concatBytes(c.key, ascii('rascals-ratchet-next')), null)
    c.seq += 1
    c.key = next
    useApp.getState().setMyChain(groupId, sodium.to_base64(next), c.seq)
    return { msgKey, seq: c.seq }
  }

  function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length)
    out.set(a, 0)
    out.set(b, a.length)
    return out
  }

  function ascii(s: string): Uint8Array {
    return sodium.from_string(s)
  }

  /** Advance a peer chain to seq, returning the message key for seq. Null if too far. */
  async function peerMsgKey(
    groupId: string,
    uid: string,
    seq: number,
  ): Promise<Uint8Array | null> {
    await sodium.ready
    const c = peerChain(groupId, uid)
    if (!c || seq <= c.seq || seq - c.seq > MAX_SKIP) return null
    let key = c.key
    for (let s = c.seq + 1; s <= seq; s++) {
      const msgKey = sodium.crypto_generichash(32, key, null)
      key = sodium.crypto_generichash(32, concatBytes(key, ascii('rascals-ratchet-next')), null)
      if (s === seq) {
        setPeerChain(groupId, uid, key, seq)
        return msgKey
      }
    }
    return null
  }

  function msgSigText(groupId: string, env: Omit<GMsg, 'sig' | 'v'>): string {
    return `rascals-gmsg-v1:${groupId}:${env.id}:${env.sender}:${env.seq}:${env.ts}:${env.rev}:${env.nonce}:${env.box}`
  }

  function ctrlSigText(groupId: string, sender: string, op: string, epoch: number, data: string): string {
    return `rascals-gctrl-v1:${groupId}:${sender}:${op}:${epoch}:${data}`
  }

  function logCtrl(groupId: string, ctrl: GCtrl): void {
    let log = ctrlLogs.get(groupId)
    if (!log) {
      log = []
      ctrlLogs.set(groupId, log)
    }
    if (log.some((c) => c.sig === ctrl.sig)) return
    log.push(ctrl)
    if (log.length > CTRL_LOG_CAP) log.splice(0, log.length - CTRL_LOG_CAP)
  }

  function findFileMessage(chatKey: string, fileId: string): ChatMessage | undefined {
    return (useApp.getState().messages[chatKey] ?? []).find((m) => m.file?.id === fileId)
  }

  // ---- sending ----

  async function transmit(
    groupId: string,
    m: ChatMessage,
  ): Promise<boolean> {
    try {
      const inst = p2p()
      if (!inst || inst.groupPeerCount(groupId) === 0) return false
      const content = JSON.stringify({
        body: m.body,
        replyTo: m.replyTo,
        editedAt: m.editedAt,
        deleted: m.deleted,
        ...(m.file
          ? {
              file: {
                id: m.file.id,
                name: m.file.name,
                mime: m.file.mime,
                size: m.file.size,
                ...(m.file.voice ? { voice: true } : {}),
                ...(typeof m.file.duration === 'number' ? { duration: m.file.duration } : {}),
                ...(typeof m.file.thumb === 'string' ? { thumb: m.file.thumb } : {}),
              },
            }
          : {}),
      })
      const { msgKey, seq } = await nextSendKey(groupId)
      const { nonce, box } = await seal(msgKey, content)
      const base = {
        id: m.id,
        groupId,
        sender: me,
        seq,
        ts: m.ts,
        rev: m.rev,
        nonce,
        box,
      }
      const sig = await signText(identity.secretKey, msgSigText(groupId, base))
      const env = { v: 1, ...base, sig }
      await inst.sendGroupAction(groupId, 'gmsg', env)
      // Keep the envelope so history can be re-served verbatim later.
      useApp.getState().setGenv(groupChatKey(groupId), m.id, env)
      return true
    } catch {
      return false
    }
  }

  async function sendText(chatKey: string, body: string, replyTo: string | null = null): Promise<void> {
    const text = body.trim()
    if (!text) return
    const groupId = gidOf(chatKey)
    const g = groupOf(groupId)
    if (!g || !isMember(g, me)) return
    const m: ChatMessage = {
      id: crypto.randomUUID(),
      friendId: chatKey,
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
    if (await transmit(groupId, m)) s.setStatus(chatKey, m.id, 'sent')
  }

  async function sendEdit(chatKey: string, id: string, body: string): Promise<void> {
    const text = body.trim()
    if (!text) return
    const groupId = gidOf(chatKey)
    const s = useApp.getState()
    const cur = (s.messages[chatKey] ?? []).find((x) => x.id === id)
    if (!cur || !cur.mine || cur.deleted) return
    const next: ChatMessage = { ...cur, rev: cur.rev + 1, body: text.slice(0, 4000), editedAt: Date.now(), status: 'queued' }
    s.upsertMessage(next)
    if (await transmit(groupId, next)) s.setStatus(chatKey, id, 'sent')
  }

  async function sendDelete(chatKey: string, id: string): Promise<void> {
    const groupId = gidOf(chatKey)
    const s = useApp.getState()
    const cur = (s.messages[chatKey] ?? []).find((x) => x.id === id)
    if (!cur || !cur.mine || cur.deleted) return
    const next: ChatMessage = { ...cur, rev: cur.rev + 1, body: '', deleted: true, status: 'queued' }
    s.upsertMessage(next)
    if (await transmit(groupId, next)) s.setStatus(chatKey, id, 'sent')
  }

  async function sendTyping(chatKey: string, typing: boolean, name: string): Promise<void> {
    const groupId = gidOf(chatKey)
    const inst = p2p()
    if (!inst || inst.groupPeerCount(groupId) === 0) return
    await inst
      .sendGroupAction(groupId, 'gtyping', { v: 1, groupId, sender: me, name, typing })
      .catch(() => {})
  }

  async function sendReaction(chatKey: string, msgId: string, emoji: string): Promise<void> {
    const clean = shapeEmoji(emoji)
    if (clean === null && emoji !== '') return
    const value = clean ?? ''
    const s = useApp.getState()
    const mine = s.reactions[chatKey]?.[msgId]?.[me]
    const finalEmoji = mine === value && value !== '' ? '' : value
    s.setReaction(chatKey, msgId, me, finalEmoji)
    const inst = p2p()
    if (!inst) return
    await inst
      .sendGroupAction(gidOf(chatKey), 'greact', { v: 1, groupId: gidOf(chatKey), sender: me, msgId, emoji: finalEmoji })
      .catch(() => {})
  }

  async function sendPin(chatKey: string, msgId: string, pinned: boolean): Promise<void> {
    useApp.getState().setPin(chatKey, msgId, pinned)
    const inst = p2p()
    if (!inst) return
    await inst
      .sendGroupAction(gidOf(chatKey), 'gpin', { v: 1, groupId: gidOf(chatKey), sender: me, msgId, pinned })
      .catch(() => {})
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

  async function sendFile(
    chatKey: string,
    blob: Blob,
    name: string,
    opts: SendFileOpts = {},
  ): Promise<string | null> {
    if (blob.size <= 0) return 'That file is empty.'
    if (blob.size > MAX_FILE_BYTES) return 'Files are capped at 25 MB for now.'
    const groupId = gidOf(chatKey)
    const g = groupOf(groupId)
    if (!g || !isMember(g, me)) return 'You are not in that group.'
    const fileId = crypto.randomUUID()
    const thumb = await makeThumb(blob).catch(() => undefined)
    const m: ChatMessage = {
      id: crypto.randomUUID(),
      friendId: chatKey,
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
        name: name.slice(0, 255) || 'file',
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
    const { total } = chunkTotal(blob.size)
    s.setFileProgress(fileId, { total, received: 0, ready: true, friendId: chatKey })
    // Fresh random content key, wrapped for every member (and ourselves).
    await sodium.ready
    const fkey = sodium.randombytes_buf(32)
    fkeyCache.set(fileId, fkey)
    if (g) await wrapFileKeyFor(groupId, fileId, fkey, g.members).catch(() => {})
    if (await transmit(groupId, m)) {
      s.setStatus(chatKey, m.id, 'sent')
      await streamGroupChunks(groupId, fileId, blob).catch(() => {})
    }
    return null
  }

  function chunkTotal(size: number): { total: number } {
    return { total: Math.max(1, Math.ceil(size / CHUNK_BYTES)) }
  }

  // File content keys: random per file, wrapped (box_seal) for every member
  // including ourselves so they survive restarts. Retransmits reuse the key.
  const fkeyCache = new Map<string, Uint8Array>()

  async function wrapFileKeyFor(
    groupId: string,
    fileId: string,
    key: Uint8Array,
    toList: string[],
  ): Promise<void> {
    const inst = p2p()
    if (!inst) return
    await sodium.ready
    const payload = JSON.stringify({ fileId, key: sodium.to_base64(key) })
    for (const to of toList) {
      try {
        const sealed = sodium.crypto_box_seal(ascii(payload), await curvePubOf(to))
        const sealedB64 = sodium.to_base64(sealed)
        if (to === me) useApp.getState().setFileKey(fileId, sealedB64)
        await inst
          .sendGroupAction(groupId, 'gfkey', {
            v: 1, groupId, sender: me, fileId, to, sealed: sealedB64,
          })
          .catch(() => {})
      } catch {
        // unknown recipient — skip
      }
    }
  }

  async function openFileKey(fileId: string): Promise<Uint8Array | null> {
    const hit = fkeyCache.get(fileId)
    if (hit) return hit
    const sealedB64 = useApp.getState().fkeys[fileId]
    if (!sealedB64) return null
    try {
      await sodium.ready
      const { sec, pub } = await curveKeys()
      const opened = sodium.crypto_box_seal_open(sodium.from_base64(sealedB64), pub, sec)
      const data = JSON.parse(sodium.to_string(opened)) as { fileId?: unknown; key?: unknown }
      if (data.fileId !== fileId || typeof data.key !== 'string') return null
      const key = sodium.from_base64(data.key)
      fkeyCache.set(fileId, key)
      return key
    } catch {
      return null
    }
  }

  async function streamGroupChunks(
    groupId: string,
    fileId: string,
    blob: Blob,
    fromSeq = 0,
  ): Promise<void> {
    const inst = p2p()
    if (!inst) return
    const key = await openFileKey(fileId)
    if (!key) return
    const total = Math.max(1, Math.ceil(blob.size / CHUNK_BYTES))
    for (let seq = fromSeq; seq < total; seq++) {
      if (inst.groupPeerCount(groupId) === 0) break
      const slice = blob.slice(seq * CHUNK_BYTES, (seq + 1) * CHUNK_BYTES)
      const bytes = new Uint8Array(await slice.arrayBuffer())
      const { nonce, box } = await seal(key, bytesToB64(bytes))
      await inst
        .sendGroupAction(groupId, 'gfchunk', {
          v: 1, groupId, sender: me, fileId, seq, total, nonce, box,
        })
        .catch(() => {})
    }
  }

  async function requestFile(chatKey: string, fileId: string, fromSeq = 0): Promise<void> {
    const groupId = gidOf(chatKey)
    const inst = p2p()
    if (!inst || inst.groupPeerCount(groupId) === 0) return
    await inst
      .sendGroupAction(groupId, 'gfget', { v: 1, groupId, sender: me, fileId, fromSeq })
      .catch(() => {})
  }

  // ---- receiving ----

  function ingest(chatKey: string, env: GMsg, content: NonNullable<ReturnType<typeof shapeContent>>, ack: boolean): void {
    const s = useApp.getState()
    const isNew = !(s.messages[chatKey] ?? []).some((m) => m.id === env.id)
    s.upsertMessage({
      id: env.id,
      friendId: chatKey,
      mine: false,
      sender: env.sender,
      ts: env.ts,
      rev: env.rev,
      body: content.body,
      replyTo: content.replyTo,
      editedAt: content.editedAt,
      deleted: content.deleted,
      status: 'delivered',
      file: content.file
        ? {
            id: content.file.id,
            name: content.file.name,
            mime: content.file.mime,
            size: content.file.size,
            voice: content.file.voice,
            duration: content.file.duration,
            thumb: content.file.thumb,
          }
        : undefined,
      genv: env,
    })
    if (content.file) {
      const total = Math.max(1, Math.ceil(content.file.size / CHUNK_BYTES))
      const cur = s.files[content.file.id]
      if (!cur || !cur.ready) {
        s.setFileProgress(content.file.id, { total, received: 0, ready: false, friendId: chatKey })
        void requestFile(chatKey, content.file.id, 0).catch(() => {})
      }
    }
    if (ack) {
      void p2p()
        ?.sendGroupAction(gidOf(chatKey), 'gack', { v: 1, groupId: gidOf(chatKey), sender: me, ackId: env.id })
        .catch(() => {})
    }
    if (isNew && !content.deleted) {
      const preview = content.file
        ? (content.file.voice ? 'Voice message' : `File: ${content.file.name}`)
        : content.body
      alertIncomingGroup(chatKey, env.sender, preview)
    }
  }

  async function tryDecrypt(
    groupId: string,
    sender: string,
    seq: number,
    nonce: string,
    box: string,
  ): Promise<string | null> {
    const msgKey = await peerMsgKey(groupId, sender, seq)
    if (!msgKey) return null
    return openBox(msgKey, nonce, box)
  }

  function stashPending(groupId: string, env: GMsg): void {
    let m = pending.get(groupId)
    if (!m) {
      m = new Map()
      pending.set(groupId, m)
    }
    let arr = m.get(env.sender)
    if (!arr) {
      arr = []
      m.set(env.sender, arr)
    }
    if (arr.length < 50 && !arr.some((e) => e.id === env.id)) arr.push(env)
  }

  async function drainPending(groupId: string, sender: string): Promise<void> {
    const arr = pending.get(groupId)?.get(sender)
    if (!arr || arr.length === 0) return
    pending.get(groupId)?.delete(sender)
    for (const env of arr) {
      await handleGMsg(groupId, env)
    }
  }

  async function handleGMsg(groupId: string, env: GMsg): Promise<void> {
    const chatKey = groupChatKey(groupId)
    const g = groupOf(groupId)
    if (!g || !isMember(g, env.sender) || !isMember(g, me)) return
    if (env.sender === me) return // own echoes come back through the room; local is authoritative
    const ok = await verifyText(env.sender, msgSigText(groupId, env), env.sig).catch(() => false)
    if (!ok) return
    const plain = await tryDecrypt(groupId, env.sender, env.seq, env.nonce, env.box)
    if (!plain) {
      // No chain yet (or skipped too far) — hold for the key, then give up silently.
      stashPending(groupId, env)
      return
    }
    let content: MsgContent | null = null
    try {
      content = shapeContent(JSON.parse(plain))
    } catch {
      return
    }
    if (content) ingest(chatKey, env, content, true)
  }

  function applyCtrl(groupId: string, ctrl: GCtrl): boolean {
    const s = useApp.getState()
    const g = s.groups[groupId]
    if (!g) return false
    try {
      const data = JSON.parse(ctrl.data) as Record<string, unknown>
      if (ctrl.op === 'add') {
        if (ctrl.sender !== g.creator || typeof data.added !== 'string') return false
        if (ctrl.epoch !== g.epoch + 1) return false
        if (g.members.includes(data.added)) return true
        s.upsertGroup({ ...g, members: [...g.members, data.added], epoch: ctrl.epoch })
        // Share my chain with the newcomer.
        void broadcastMyKey(groupId, [data.added]).catch(() => {})
        return true
      }
      if (ctrl.op === 'remove') {
        if (ctrl.sender !== g.creator || typeof data.removed !== 'string') return false
        if (ctrl.epoch !== g.epoch + 1) return false
        if (!g.members.includes(data.removed)) return true
        const members = g.members.filter((x) => x !== data.removed)
        s.upsertGroup({ ...g, members, epoch: ctrl.epoch })
        if (data.removed === me) {
          void leaveGroupLocal(groupId)
        } else {
          // Backward secrecy: rotate my chain and share with the survivors.
          void rotateChain(groupId).catch(() => {})
        }
        return true
      }
      if (ctrl.op === 'leave') {
        if (ctrl.sender === me) return true
        if (!g.members.includes(ctrl.sender)) return true
        s.upsertGroup({ ...g, members: g.members.filter((x) => x !== ctrl.sender) })
        return true
      }
    } catch {
      return false
    }
    return false
  }

  async function handleGCtrl(groupId: string, ctrl: GCtrl): Promise<void> {
    const g = groupOf(groupId)
    if (!g) return
    // Admin ops must come from the creator; leaves from the leaver; all must be members (or the leaver).
    if (ctrl.op === 'leave') {
      if (!isMember(g, ctrl.sender)) return
    } else if (ctrl.sender !== g.creator || !isMember(g, ctrl.sender)) {
      return
    }
    const ok = await verifyText(
      ctrl.sender,
      ctrlSigText(groupId, ctrl.sender, ctrl.op, ctrl.epoch, ctrl.data),
      ctrl.sig,
    ).catch(() => false)
    if (!ok) return
    if (applyCtrl(groupId, ctrl)) logCtrl(groupId, ctrl)
  }

  async function broadcastMyKey(groupId: string, toList: string[]): Promise<void> {
    const inst = p2p()
    if (!inst) return
    const g = groupOf(groupId)
    if (!g) return
    const c = await myChain(groupId)
    const payload = JSON.stringify({
      groupId,
      sender: me,
      chain: sodium.to_base64(c.key),
      seq: c.seq,
    })
    for (const to of toList) {
      if (to === me) continue
      try {
        const sealed = sodium.crypto_box_seal(ascii(payload), await curvePubOf(to))
        await inst
          .sendGroupAction(groupId, 'gkey', {
            v: 1, groupId, sender: me, to, epoch: g.epoch, sealed: sodium.to_base64(sealed),
          })
          .catch(() => {})
      } catch {
        // unknown/undecodable recipient — skip
      }
    }
  }

  async function rotateChain(groupId: string): Promise<void> {
    await sodium.ready
    const g = groupOf(groupId)
    if (!g) return
    const fresh = { key: sodium.randombytes_buf(32), seq: 0 }
    myChains.set(groupId, fresh)
    useApp.getState().setMyChain(groupId, sodium.to_base64(fresh.key), 0)
    await broadcastMyKey(groupId, g.members)
  }

  async function handleGKey(groupId: string, msg: GKey): Promise<void> {
    if (msg.to !== me) return
    const g = groupOf(groupId)
    if (!g || !isMember(g, me) || !isMember(g, msg.sender)) return
    try {
      const { sec, pub } = await curveKeys()
      const opened = sodium.crypto_box_seal_open(
        sodium.from_base64(msg.sealed),
        pub,
        sec,
      )
      const data = JSON.parse(sodium.to_string(opened)) as Record<string, unknown>
      if (data.groupId !== groupId || data.sender !== msg.sender) return
      if (typeof data.chain !== 'string' || typeof data.seq !== 'number') return
      const cur = peerChain(groupId, msg.sender)
      if (cur && data.seq <= cur.seq) return // stale
      setPeerChain(groupId, msg.sender, sodium.from_base64(data.chain), data.seq)
      await drainPending(groupId, msg.sender)
    } catch {
      // undecryptable — not for us or corrupt
    }
  }

  async function tryAssemble(chatKey: string, fileId: string): Promise<void> {
    const entry = incoming.get(fileId)
    const msg = findFileMessage(chatKey, fileId)
    if (!entry || !msg?.file) return
    const total = Math.max(1, Math.ceil(msg.file.size / CHUNK_BYTES))
    if (entry.parts.size < total) return
    const ordered: string[] = []
    for (let i = 0; i < total; i++) {
      const part = entry.parts.get(i)
      if (part === undefined) return
      ordered.push(part)
    }
    const blob = await assembleBlob(ordered, msg.file.mime)
    if (!blob) {
      incoming.delete(fileId)
      useApp.getState().setFileProgress(fileId, { total, received: 0, ready: false, friendId: chatKey })
      return
    }
    await putBlob(fileId, blob).catch(() => {})
    useApp.getState().markFileReady(fileId)
    incoming.delete(fileId)
  }

  const handlers: GroupHandlers = {
    onGMsg: (groupId, env) => {
      void handleGMsg(groupId, env)
    },
    onGCtrl: (groupId, ctrl) => {
      void handleGCtrl(groupId, ctrl)
    },
    onGKey: (groupId, msg) => {
      void handleGKey(groupId, msg)
    },
    onGAck: (groupId, ackId) => {
      useApp.getState().markDelivered(groupChatKey(groupId), ackId)
    },
    onGTyping: (groupId, _from, name, typing) => {
      const key = groupChatKey(groupId)
      useApp.getState().setTyping(key, typing ? Date.now() : 0)
      if (typing && name) useApp.getState().setTypingName(key, name)
    },
    onGReq: (groupId, from, since) => {
      void (async () => {
        const inst = p2p()
        const g = groupOf(groupId)
        if (!inst || !g || !isMember(g, from) || !isMember(g, me)) return
        const chatKey = groupChatKey(groupId)
        const st = useApp.getState()
        const subset = (st.messages[chatKey] ?? [])
          .filter((m) => m.ts > since)
          .sort((a, b) => a.ts - b.ts)
          .slice(-HISTORY_LIMIT)
        const msgs = subset
          .map((m) => m.genv)
          .filter((e): e is NonNullable<ChatMessage['genv']> => !!e && e.groupId === groupId)
        const reactions: Array<{ msgId: string; userId: string; emoji: string }> = []
        for (const [msgId, byUser] of Object.entries(st.reactions[chatKey] ?? {})) {
          for (const [userId, emoji] of Object.entries(byUser)) {
            if (reactions.length >= 500) break
            reactions.push({ msgId, userId, emoji })
          }
        }
        const ctrls = (ctrlLogs.get(groupId) ?? []).slice(-50)
        await inst
          .sendGroupAction(groupId, 'goffer', {
            v: 1, groupId, sender: me, msgs, reactions, pins: st.pins[chatKey] ?? [], ctrls,
          })
          .catch(() => {})
        // The requester may be missing chains — share mine so history decrypts.
        await broadcastMyKey(groupId, [from]).catch(() => {})
      })()
    },
    onGOffer: (groupId, _from, offer) => {
      void (async () => {
        const g = groupOf(groupId)
        if (!g || !isMember(g, me)) return
        const chatKey = groupChatKey(groupId)
        const s = useApp.getState()
        for (const env of offer.msgs) {
          if (env.groupId !== groupId || env.sender === me) continue
          await handleGMsg(groupId, env)
        }
        for (const r of offer.reactions ?? []) {
          if (typeof r.msgId === 'string' && typeof r.userId === 'string' && shapeEmoji(r.emoji) !== null) {
            s.setReaction(chatKey, r.msgId, r.userId, r.emoji)
          }
        }
        const known = new Set(s.pins[chatKey] ?? [])
        for (const id of offer.pins ?? []) {
          if (typeof id === 'string' && !known.has(id)) {
            known.add(id)
            s.setPin(chatKey, id, true)
          }
        }
        const ctrls = offer.ctrls ?? []
        for (const c of ctrls) {
          if (c && c.groupId === groupId) await handleGCtrl(groupId, c)
        }
      })()
    },
    onGReact: (groupId, from, msg) => {
      const g = groupOf(groupId)
      if (!g || !isMember(g, from)) return
      const emoji = shapeEmoji(msg.emoji)
      if (emoji === null && msg.emoji !== '') return
      useApp.getState().setReaction(groupChatKey(groupId), msg.msgId, from, emoji ?? '')
    },
    onGPin: (groupId, from, msg) => {
      const g = groupOf(groupId)
      if (!g || !isMember(g, from)) return
      useApp.getState().setPin(groupChatKey(groupId), msg.msgId, msg.pinned === true)
    },
    onGChunk: (groupId, from, msg) => {
      void (async () => {
        const chatKey = groupChatKey(groupId)
        const meta = findFileMessage(chatKey, msg.fileId)
        if (!meta?.file) return
        if (msg.total <= 0 || msg.total > 4096 || msg.seq < 0 || msg.seq >= msg.total) return
        const g = groupOf(groupId)
        if (!g || !isMember(g, from)) return
        const fileKey = await openFileKey(msg.fileId).catch(() => null)
        if (!fileKey) return
        const plain = await openBox(fileKey, msg.nonce, msg.box)
        if (!plain) return
        let entry = incoming.get(msg.fileId)
        if (!entry) {
          entry = { chatKey, parts: new Map() }
          incoming.set(msg.fileId, entry)
        }
        if (!entry.parts.has(msg.seq)) {
          entry.parts.set(msg.seq, plain)
          const cur = useApp.getState().files[msg.fileId]
          useApp.getState().setFileProgress(msg.fileId, {
            total: msg.total,
            received: entry.parts.size,
            ready: cur?.ready ?? false,
            friendId: chatKey,
          })
        }
        await tryAssemble(chatKey, msg.fileId)
      })()
    },
    onGGet: (groupId, from, msg) => {
      void (async () => {
        const chatKey = groupChatKey(groupId)
        const g = groupOf(groupId)
        if (!g || !isMember(g, from)) return
        if (!findFileMessage(chatKey, msg.fileId)?.file) return
        const blob = await getBlob(msg.fileId).catch(() => null)
        if (!blob) return
        // Make sure the requester holds the file key, then stream.
        const key = await openFileKey(msg.fileId).catch(() => null)
        if (key) await wrapFileKeyFor(groupId, msg.fileId, key, [from]).catch(() => {})
        await streamGroupChunks(groupId, msg.fileId, blob, Math.max(0, msg.fromSeq | 0))
      })()
    },
    onGFileKey: (groupId, _from, msg) => {
      void (async () => {
        if (msg.to !== me) return
        const g = groupOf(groupId)
        if (!g || !isMember(g, me) || !isMember(g, msg.sender)) return
        try {
          await sodium.ready
          const { sec, pub } = await curveKeys()
          const opened = sodium.crypto_box_seal_open(sodium.from_base64(msg.sealed), pub, sec)
          const data = JSON.parse(sodium.to_string(opened)) as { fileId?: unknown; key?: unknown }
          if (data.fileId !== msg.fileId || typeof data.key !== 'string') return
          const key = sodium.from_base64(data.key)
          fkeyCache.set(msg.fileId, key)
          useApp.getState().setFileKey(msg.fileId, msg.sealed)
          await tryAssemble(groupChatKey(groupId), msg.fileId)
          // Pull any chunks sent before the key arrived.
          const have = incoming.get(msg.fileId)?.parts.size ?? 0
          const cur = useApp.getState().files[msg.fileId]
          if (!cur?.ready) {
            await p2p()
              ?.sendGroupAction(groupId, 'gfget', {
                v: 1, groupId, sender: me, fileId: msg.fileId, fromSeq: have,
              })
              .catch(() => {})
          }
        } catch {
          // not for us or corrupt
        }
      })()
    },
  }

  // (File key wrap/open/stream primitives live just above.)

  // ---- membership ----

  async function createGroup(name: string, memberIds: string[]): Promise<string> {
    const clean = name.trim().slice(0, 64)
    if (!clean) throw new Error('Group needs a name.')
    const s = useApp.getState()
    const friends = new Set(s.friends.map((f) => f.userId))
    const others = [...new Set(memberIds)].filter((id) => id !== me)
    if (others.length === 0) throw new Error('Pick at least one friend.')
    for (const id of others) {
      if (!friends.has(id)) throw new Error('Everyone added must be your friend first.')
    }
    const id = crypto.randomUUID()
    const group: GroupInfo = {
      id,
      name: clean,
      creator: me,
      members: [me, ...others],
      epoch: 1,
      createdAt: Date.now(),
    }
    s.upsertGroup(group)
    await myChain(id) // ensure a chain exists before inviting
    await p2p()?.joinGroupRoom(id)
    // Invite each member over the pairwise DM (retried when they come online).
    for (const m of others) {
      await sendInvite(m, group).catch(() => {})
    }
    return id
  }

  async function invitePayload(g: GroupInfo): Promise<CtrlInvitePayload> {
    const c = await myChain(g.id)
    return {
      kind: 'ginvite',
      group: {
        id: g.id,
        name: g.name,
        creator: g.creator,
        members: [...g.members],
        epoch: g.epoch,
        adminChain: sodium.to_base64(c.key),
        adminSeq: c.seq,
      },
    }
  }

  async function sendInvite(to: string, g: GroupInfo): Promise<boolean> {
    try {
      return await deps.sendDmCtrl(to, await invitePayload(g))
    } catch {
      return false
    }
  }

  async function handleInvite(from: string, invite: CtrlInvitePayload): Promise<void> {
    const grp = invite.group
    // Only the creator can invite, and only into groups listing us.
    if (from !== grp.creator) return
    if (!grp.members.includes(me) || !grp.members.includes(from)) return
    if (!grp.id || grp.epoch < 1) return
    const s = useApp.getState()
    const existing = s.groups[grp.id]
    // Never roll back to an older epoch we already superseded.
    if (existing && existing.epoch > grp.epoch) return
    const mergedMembers =
      existing && existing.epoch === grp.epoch
        ? [...new Set([...existing.members, ...grp.members])]
        : [...grp.members]
    s.upsertGroup({
      id: grp.id,
      name: grp.name.slice(0, 64) || 'Group',
      creator: grp.creator,
      members: mergedMembers,
      epoch: Math.max(existing?.epoch ?? 0, grp.epoch),
      createdAt: existing?.createdAt ?? Date.now(),
    })
    await myChain(grp.id)
    await p2p()?.joinGroupRoom(grp.id).catch(() => {})
    // Adopt the admin chain if we have nothing newer.
    if (grp.adminChain && typeof grp.adminSeq === 'number') {
      try {
        const cur = peerChain(grp.id, from)
        if (!cur || grp.adminSeq > cur.seq) {
          setPeerChain(grp.id, from, sodium.from_base64(grp.adminChain), grp.adminSeq)
          await drainPending(grp.id, from)
        }
      } catch {
        // malformed chain — members will send gkeys on our greq
      }
    }
    // Announce our chain to everyone, then pull history.
    const updated = groupOf(grp.id)
    if (updated) await broadcastMyKey(grp.id, updated.members).catch(() => {})
    await requestGroupHistory(grp.id).catch(() => {})
  }

  async function requestGroupHistory(groupId: string): Promise<void> {
    const inst = p2p()
    if (!inst || inst.groupPeerCount(groupId) === 0) return
    const chatKey = groupChatKey(groupId)
    const all = useApp.getState().messages[chatKey] ?? []
    const since = all.reduce((max, m) => Math.max(max, m.ts), 0)
    await inst
      .sendGroupAction(groupId, 'greq', { v: 1, groupId, sender: me, since })
      .catch(() => {})
  }

  async function postCtrl(
    groupId: string,
    op: 'add' | 'remove',
    epoch: number,
    data: Record<string, string>,
  ): Promise<void> {
    const body = JSON.stringify(data)
    const sig = await signText(identity.secretKey, ctrlSigText(groupId, me, op, epoch, body))
    const ctrl: GCtrl = { v: 1, groupId, sender: me, op, epoch, data: body, sig }
    logCtrl(groupId, ctrl)
    await p2p()?.sendGroupAction(groupId, 'gctrl', ctrl).catch(() => {})
  }

  async function addMember(groupId: string, friendId: string): Promise<string | null> {
    const g = groupOf(groupId)
    if (!g) return 'Unknown group.'
    if (g.creator !== me) return 'Only the group creator can add people.'
    if (!useApp.getState().friends.some((f) => f.userId === friendId))
      return 'They must be your friend first.'
    if (g.members.includes(friendId)) return 'Already in the group.'
    const epoch = g.epoch + 1
    useApp.getState().upsertGroup({ ...g, members: [...g.members, friendId], epoch })
    await postCtrl(groupId, 'add', epoch, { added: friendId }).catch(() => {})
    // Direct invite (also retried whenever they come online).
    await sendInvite(friendId, { ...g, members: [...g.members, friendId], epoch }).catch(() => {})
    // Share my chain with the newcomer.
    await broadcastMyKey(groupId, [friendId]).catch(() => {})
    return null
  }

  async function removeMember(groupId: string, victimId: string): Promise<string | null> {
    const g = groupOf(groupId)
    if (!g) return 'Unknown group.'
    if (g.creator !== me) return 'Only the group creator can remove people.'
    if (victimId === me) return 'Use Leave instead of removing yourself.'
    if (!g.members.includes(victimId)) return 'Not in the group.'
    const epoch = g.epoch + 1
    const members = g.members.filter((x) => x !== victimId)
    useApp.getState().upsertGroup({ ...g, members, epoch })
    await postCtrl(groupId, 'remove', epoch, { removed: victimId }).catch(() => {})
    // Backward secrecy: fresh chain, shared with the survivors only.
    await rotateChain(groupId).catch(() => {})
    return null
  }

  async function joinAll(): Promise<void> {
    const inst = p2p()
    if (!inst) return
    for (const id of Object.keys(useApp.getState().groups)) {
      await inst.joinGroupRoom(id).catch(() => {})
    }
  }

  async function leaveGroupLocal(groupId: string): Promise<void> {
    useApp.getState().removeGroup(groupId)
    useApp.getState().dropGroupKeys(groupId)
    myChains.delete(groupId)
    peerChains.delete(groupId)
    ctrlLogs.delete(groupId)
    pending.delete(groupId)
    p2p()?.leaveGroupRoom(groupId)
  }

  async function leaveGroup(groupId: string): Promise<void> {
    const g = groupOf(groupId)
    if (g && isMember(g, me)) {
      const data = JSON.stringify({})
      const sig = await signText(identity.secretKey, ctrlSigText(groupId, me, 'leave', g.epoch, data))
      await p2p()
        ?.sendGroupAction(groupId, 'gctrl', { v: 1, groupId, sender: me, op: 'leave', epoch: g.epoch, data, sig })
        .catch(() => {})
    }
    await leaveGroupLocal(groupId)
  }

  async function resendInvites(friendId: string): Promise<void> {
    for (const g of Object.values(useApp.getState().groups)) {
      if (g.serverId) continue // channels ride the server descriptor, not DM invites
      if (g.creator !== me || !g.members.includes(friendId)) continue
      const payload = await invitePayload(g).catch(() => null)
      if (payload) await deps.sendDmCtrl(friendId, payload).catch(() => {})
    }
  }

  /** Someone is reachable in a group room: flush queued + pull history + files. */
  async function groupAvailable(groupId: string): Promise<void> {
    const chatKey = groupChatKey(groupId)
    const s = useApp.getState()
    const g = s.groups[groupId]
    if (!g || !isMember(g, me)) return
    for (const m of s.messages[chatKey] ?? []) {
      if (!m.mine || m.status !== 'queued' || m.deleted) continue
      if (await transmit(groupId, m)) s.setStatus(chatKey, m.id, 'sent')
      else break
    }
    // Re-share file keys + re-stream my files; re-request what I'm missing.
    for (const m of useApp.getState().messages[chatKey] ?? []) {
      if (!m.file || m.deleted) continue
      if (m.mine) {
        const key = fkeyCache.get(m.file.id) ?? (await openFileKey(m.file.id).catch(() => null))
        if (key) await wrapFileKeyFor(groupId, m.file.id, key, g.members).catch(() => {})
        const blob = await getBlob(m.file.id).catch(() => null)
        if (blob) await streamGroupChunks(groupId, m.file.id, blob).catch(() => {})
      } else {
        const cur = useApp.getState().files[m.file.id]
        if (!cur?.ready) {
          const inst = p2p()
          if (inst && inst.groupPeerCount(groupId) > 0) {
            await inst
              .sendGroupAction(groupId, 'gfget', {
                v: 1, groupId, sender: me, fileId: m.file.id, fromSeq: cur?.received ?? 0,
              })
              .catch(() => {})
          }
        }
      }
    }
    await requestGroupHistory(groupId).catch(() => {})
  }

  async function ensureRoom(groupId: string): Promise<void> {
    await p2p()?.joinGroupRoom(groupId).catch(() => {})
  }

  async function createBareGroup(
    name: string,
    members: string[],
    opts: { serverId?: string; topic?: string } = {},
  ): Promise<string> {
    const clean = name.trim().slice(0, 64)
    if (!clean) throw new Error('Channel needs a name.')
    const uniq = [...new Set(members)]
    if (!uniq.includes(me)) uniq.unshift(me)
    const id = crypto.randomUUID()
    useApp.getState().upsertGroup({
      id,
      name: clean,
      creator: me,
      members: uniq,
      epoch: 1,
      createdAt: Date.now(),
      serverId: opts.serverId,
      topic: opts.topic,
    })
    await myChain(id)
    await p2p()?.joinGroupRoom(id).catch(() => {})
    return id
  }

  async function dropRoom(groupId: string): Promise<void> {
    await leaveGroupLocal(groupId)
  }

  async function syncChannelMembers(groupId: string, members: string[]): Promise<string[]> {
    const g = groupOf(groupId)
    if (!g) return []
    const added = members.filter((x) => !g.members.includes(x))
    const removed = g.members.filter((x) => !members.includes(x))
    if (added.length === 0 && removed.length === 0) return []
    useApp.getState().upsertGroup({ ...g, members: [...members] })
    if (added.length > 0) await broadcastMyKey(groupId, added).catch(() => {})
    return added
  }

  async function rotateGroupChain(groupId: string): Promise<void> {
    await rotateChain(groupId).catch(() => {})
  }

  async function shareKey(groupId: string, toList: string[]): Promise<void> {
    await broadcastMyKey(groupId, toList).catch(() => {})
  }

  return {
    handlers,
    createGroup,
    handleInvite,
    joinAll,
    sendText,
    sendEdit,
    sendDelete,
    sendTyping,
    sendReaction,
    sendPin,
    sendFile,
    requestFile,
    addMember,
    removeMember,
    leaveGroup,
    resendInvites,
    groupAvailable,
    ensureRoom,
    syncChannelMembers,
    rotateGroupChain,
    shareKey,
    createBareGroup,
    dropRoom,
  }
}
