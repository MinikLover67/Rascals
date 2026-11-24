// P2P layer on Trystero (Nostr discovery + WebRTC DataChannels, no servers of ours).
//
// Discovery model:
// - Everyone joins their own lobby room at startup: lobbyRoomFor(myUserId).
// - To add a friend you join THEIR lobby and send a signed 'freq' addressed to them.
// - Each accepted pair shares a pairwise DM room (same id both sides) that carries
//   signed 'hello's for authentication + presence (Phase 1), plus E2EE message
//   actions (Phase 2): 'msg' upserts, 'ack' delivery receipts, 'typing' ephemerals,
//   'hreq'/'hoffer' history sync for offline catch-up, plus Phase 3: 'react'
//   emoji reactions, 'pin' shared pins, 'fchunk' E2EE file chunks and 'fget'
//   chunk requests (file metadata rides inside message upserts).

import { getRelaySockets, joinRoom, selfId } from 'trystero'
import { signHello, verifyHello } from './crypto'
import type { Identity } from './identity'
import { roomOpts } from './relays'
import { dmRoomFor, groupRoomFor, lobbyRoomFor, serverRoomFor } from './rooms'
import { useApp } from '../store/app'

/** Current room options (settings snapshot per join — TURN edits apply to new rooms). */
function opts() {
  return roomOpts(useApp.getState().settings)
}

/** File transfer protocol version we speak (advertised in hello `fv`).
 * 1 = legacy chunks, 2 = batched chunks, 3 = + chunked profile images. */
const FILE_PROTO_VERSION = 3
/** Chunks per fbatch action: 4×32 KB stays under the ~256 KB SCTP ceiling. */
export const FILE_BATCH_SIZE = 4
/** Hard cap on batch length (memory bound against malicious peers). */
export const FILE_BATCH_MAX = 16

export interface HelloPayload {
  v: number
  /** Intended recipient — lobby rooms can contain other requesters, so ignore misaddressed mail. */
  to: string
  userId: string
  name: string
  ts: number
  sig: string
  [key: string]: string | number
}

/** Full message state, E2EE body. Edits/deletes are just newer revs of the same id. */
export interface MsgEnvelope {
  v: number
  id: string
  to: string
  from: string
  ts: number
  rev: number
  nonce: string
  box: string
  [key: string]: string | number
}

export interface AckMsg {
  v: number
  to: string
  from: string
  ackId: string
  [key: string]: string | number
}

export interface TypingMsg {
  v: number
  to: string
  from: string
  typing: boolean
  [key: string]: string | number | boolean
}

export interface HReqMsg {
  v: number
  to: string
  from: string
  since: number
  [key: string]: string | number
}

export interface HOfferMsg {
  v: number
  to: string
  from: string
  msgs: MsgEnvelope[]
  reactions?: ReactionEntry[]
  pins?: string[]
  [key: string]: string | number | boolean | MsgEnvelope[] | ReactionEntry[] | string[] | undefined
}

/** One user's reaction on one message. */
export interface ReactionEntry {
  msgId: string
  userId: string
  /** Single emoji grapheme, or '' to clear. */
  emoji: string
  [key: string]: string
}

/** Pairwise-encrypted control message (e.g. group invites). Box opens with the DM session key. */
export interface CtrlMsg {
  v: number
  to: string
  from: string
  nonce: string
  box: string
  [key: string]: string | number
}

/** 1:1 call signaling (ring/accept/decline/hangup). Media flows in a call room. */
export interface CallMsg {
  v: number
  to: string
  from: string
  kind: 'offer' | 'accept' | 'decline' | 'hangup'
  callId: string
  [key: string]: string | number
}

export interface ReactMsg {
  v: number
  to: string
  from: string
  msgId: string
  /** Single emoji grapheme, or '' to remove your reaction. */
  emoji: string
  [key: string]: string | number
}

export interface PinMsg {
  v: number
  to: string
  from: string
  msgId: string
  pinned: boolean
  [key: string]: string | number | boolean
}

/** One E2EE chunk of a file transfer. Chunk plaintext is base64 file bytes. */
export interface FileChunkMsg {
  v: number
  to: string
  from: string
  fileId: string
  seq: number
  total: number
  nonce: string
  box: string
  [key: string]: string | number
}

/** Batched chunks (protocol v2): one sealed box per action covering up to
 * BATCH_CHUNKS plaintext chunks, so crypto cost drops ~4×. `box` seals
 * base64(raw bytes of chunks [baseSeq, baseSeq+count)); chunk boundaries
 * are pure functions of (file size, seq), so no per-piece metadata rides.
 * Receivers must accept any count/offset — resume batches are rarely full. */
export interface FileBatchMsg {
  v: number
  to: string
  from: string
  fileId: string
  total: number
  baseSeq: number
  count: number
  nonce: string
  box: string
  [key: string]: string | number
}

/** Ask the peer to (re)stream chunks for a file. fromSeq allows resume. */
export interface FileGetMsg {
  v: number
  to: string
  from: string
  fileId: string
  fromSeq: number
  [key: string]: string | number
}

/** Profile look exchange (Nitro-for-free): request + versioned show.
 * Images ride as base64 boxes sealed with the DM session key, capped small.
 * Old clients have no handler and ignore both actions (safe no-op). */
export interface ProfileReqMsg {
  v: number
  to: string
  from: string
  [key: string]: string | number
}
export interface ProfileShowMsg {
  v: number
  to: string
  from: string
  themePrimary: string
  themeAccent: string
  nameStyle: string
  /** Sender's profile version (updatedAt ms). Receivers ignore shows that
   * are not newer than their cache — stale replays must not clobber edits. */
  rev?: number
  /** Small image: bytes ride inline (sealed box). */
  avatarMime?: string
  avatarBox?: string
  avatarNonce?: string
  /** Large image: descriptor only — bytes follow as 'pimg' chunks
   * (one sealed box can never fit a GIF over the SCTP ceiling). */
  avatarSize?: number
  bannerMime?: string
  bannerBox?: string
  bannerNonce?: string
  bannerSize?: number
  bannerCss?: string
  [key: string]: string | number | undefined
}

/** One batched chunk of a large profile image (avatar/banner GIFs).
 * Same sizing as file batches: up to 4×32 KB plaintext per sealed box so
 * every message stays under the ~256 KB SCTP ceiling. Receivers accept any
 * count/offset and assemble when all `total` chunks land. Old clients have
 * no handler and ignore it (they still get the meta + small images). */
export interface ProfileImgMsg {
  v: number
  to: string
  from: string
  kind: 'avatar' | 'banner'
  rev: number
  mime: string
  /** Total 32 KB chunks in this image (cap 128 = 4 MB sanity bound). */
  total: number
  baseSeq: number
  count: number
  nonce: string
  box: string
  [key: string]: string | number
}

export type MsgActionName =
  | 'msg'
  | 'ack'
  | 'typing'
  | 'hreq'
  | 'hoffer'
  | 'react'
  | 'pin'
  | 'fchunk'
  | 'fbatch'
  | 'fget'
  | 'profget'
  | 'profshow'
  | 'pimg'
  | 'ctrl'
  | 'call'
export type MsgWire =
  | MsgEnvelope
  | AckMsg
  | TypingMsg
  | HReqMsg
  | HOfferMsg
  | ReactMsg
  | PinMsg
  | FileChunkMsg
  | FileBatchMsg
  | FileGetMsg
  | ProfileReqMsg
  | ProfileShowMsg
  | ProfileImgMsg
  | CtrlMsg
  | CallMsg

export interface P2PCallbacks {
  onFriendRequest: (userId: string, displayName: string) => void
  onHello: (userId: string, displayName: string, ts?: number) => void
  onPeerOnline: (friendId: string) => void
  onPeerOffline: (friendId: string) => void
}

// ---- Group room wire protocol --------------------------------------------
// Same ideas as DMs, but every envelope carries groupId + sender and is
// verified against the group member list + identity signatures in chat-group.

export interface GMsg {
  v: number
  id: string
  groupId: string
  sender: string
  seq: number
  ts: number
  rev: number
  nonce: string
  box: string
  sig: string
  [key: string]: string | number
}

export interface GCtrl {
  v: number
  groupId: string
  sender: string
  op: string
  epoch: number
  data: string
  sig: string
  [key: string]: string | number
}

/** Sealed sender-chain key for one recipient (box_seal to their curve pubkey). */
export interface GKey {
  v: number
  groupId: string
  sender: string
  to: string
  epoch: number
  sealed: string
  [key: string]: string | number
}

export interface GAck {
  v: number
  groupId: string
  sender: string
  ackId: string
  [key: string]: string | number
}

export interface GTyping {
  v: number
  groupId: string
  sender: string
  name: string
  typing: boolean
  [key: string]: string | number | boolean
}

export interface GReq {
  v: number
  groupId: string
  sender: string
  since: number
  [key: string]: string | number
}

export interface GOffer {
  v: number
  groupId: string
  sender: string
  msgs: GMsg[]
  reactions?: ReactionEntry[]
  pins?: string[]
  ctrls?: GCtrl[]
  [key: string]: string | number | boolean | GMsg[] | ReactionEntry[] | string[] | GCtrl[] | undefined
}

export interface GReact {
  v: number
  groupId: string
  sender: string
  msgId: string
  emoji: string
  [key: string]: string | number
}

export interface GPin {
  v: number
  groupId: string
  sender: string
  msgId: string
  pinned: boolean
  [key: string]: string | number | boolean
}

export interface GChunk {
  v: number
  groupId: string
  sender: string
  fileId: string
  seq: number
  total: number
  nonce: string
  box: string
  [key: string]: string | number
}

export interface GGet {
  v: number
  groupId: string
  sender: string
  fileId: string
  fromSeq: number
  [key: string]: string | number
}

/** File content key wrapped (box_seal) for one recipient. */
export interface GFileKey {
  v: number
  groupId: string
  sender: string
  fileId: string
  to: string
  sealed: string
  [key: string]: string | number
}

export type GroupActionName =
  | 'gmsg'
  | 'gctrl'
  | 'gkey'
  | 'gack'
  | 'gtyping'
  | 'greq'
  | 'goffer'
  | 'greact'
  | 'gpin'
  | 'gfchunk'
  | 'gfget'
  | 'gfkey'

export type GroupWire =
  | GMsg
  | GCtrl
  | GKey
  | GAck
  | GTyping
  | GReq
  | GOffer
  | GReact
  | GPin
  | GChunk
  | GGet
  | GFileKey

export interface P2PGroupCallbacks {
  onGroupPeer: (groupId: string, online: boolean) => void
}

export interface GroupHandlers {
  onGMsg: (groupId: string, env: GMsg) => void
  onGCtrl: (groupId: string, msg: GCtrl) => void
  onGKey: (groupId: string, msg: GKey) => void
  onGAck: (groupId: string, ackId: string, from: string) => void
  onGTyping: (groupId: string, from: string, name: string, typing: boolean) => void
  onGReq: (groupId: string, from: string, since: number) => void
  onGOffer: (groupId: string, from: string, offer: GOffer) => void
  onGReact: (groupId: string, from: string, msg: GReact) => void
  onGPin: (groupId: string, from: string, msg: GPin) => void
  onGChunk: (groupId: string, from: string, msg: GChunk) => void
  onGGet: (groupId: string, from: string, msg: GGet) => void
  onGFileKey: (groupId: string, from: string, msg: GFileKey) => void
}

// ---- Server room wire protocol -------------------------------------------
// Carries the signed server descriptor + op log (see chat-server.ts).
// Payload bodies are JSON strings; authorization happens there.

export interface SDesc {
  v: number
  serverId: string
  epoch: number
  author: string
  desc: string
  sig: string
  [key: string]: string | number
}

export interface SOp {
  v: number
  serverId: string
  epoch: number
  author: string
  op: string
  data: string
  sig: string
  [key: string]: string | number
}

export interface SReq {
  v: number
  serverId: string
  sender: string
  [key: string]: string | number
}

export interface SOffer {
  v: number
  serverId: string
  sender: string
  epoch: number
  author: string
  desc: string
  sig: string
  ops: SOp[]
  [key: string]: string | number | SOp[]
}

export type ServerActionName = 'sdesc' | 'sop' | 'sreq' | 'soffer'
export type ServerWire = SDesc | SOp | SReq | SOffer

export interface ServerHandlers {
  onSDesc: (serverId: string, msg: SDesc) => void
  onSOp: (serverId: string, msg: SOp) => void
  onSReq: (serverId: string, from: string) => void
  onSOffer: (serverId: string, from: string, msg: SOffer) => void
}

export interface MsgHandlers {
  onUpsert: (env: MsgEnvelope) => void
  onAck: (ackId: string, from: string) => void
  onTyping: (from: string, typing: boolean) => void
  onHistoryReq: (from: string, since: number) => void
  onHistoryOffer: (from: string, offer: HOfferMsg) => void
  onReact: (from: string, msg: ReactMsg) => void
  onPin: (from: string, msg: PinMsg) => void
  onFileChunk: (from: string, msg: FileChunkMsg) => void
  onFileBatch: (from: string, msg: FileBatchMsg) => void
  onFileGet: (from: string, msg: FileGetMsg) => void
  onProfileGet: (from: string, msg: ProfileReqMsg) => void
  onProfileShow: (from: string, msg: ProfileShowMsg) => void
  onProfileImg: (from: string, msg: ProfileImgMsg) => void
  onCtrl: (from: string, msg: CtrlMsg) => void
  onCall: (from: string, msg: CallMsg) => void
}

type AnyRoom = ReturnType<typeof joinRoom>
// (data: never) so every concrete sender fits; call sites cast once.
type Sender = (data: never) => Promise<void>

interface DmEntry {
  room: AnyRoom
  friendId: string
  peers: Set<string>
  senders: Map<MsgActionName, Sender>
  /** Broadcast hello sender (presence heartbeat); set for DM rooms. */
  hello?: (data: HelloPayload) => Promise<void>
}

export class P2P {
  private id: Identity
  private cb: P2PCallbacks
  private msg: MsgHandlers | null = null
  private gmsg: GroupHandlers | null = null
  private gcb: P2PGroupCallbacks | null = null
  private lobby: AnyRoom | null = null
  private lobbySends = new Map<
    string,
    { send: (data: HelloPayload, target?: string) => Promise<void>; room: AnyRoom }
  >()
  private dmRooms = new Map<string, DmEntry>()
  private groupRooms = new Map<string, DmEntry>()
  private serverRooms = new Map<string, DmEntry>()
  /** Claimed file-protocol version per peer (hello `fv`, default 1). */
  private peerFileVersion = new Map<string, number>()
  private smsg: ServerHandlers | null = null

  constructor(id: Identity, cb: P2PCallbacks, gcb?: P2PGroupCallbacks) {
    this.id = id
    this.cb = cb
    if (gcb) this.gcb = gcb
  }

  setMsgHandlers(h: MsgHandlers | null): void {
    this.msg = h
  }

  setGroupHandlers(h: GroupHandlers | null): void {
    this.gmsg = h
  }

  setServerHandlers(h: ServerHandlers | null): void {
    this.smsg = h
  }

  peerCount(friendId: string): number {
    return this.dmRooms.get(friendId)?.peers.size ?? 0
  }

  private async makeHello(to: string): Promise<HelloPayload> {
    const ts = Date.now()
    return {
      v: 1,
      to,
      userId: this.id.userId,
      name: this.id.name,
      ts,
      // File protocol version (unsigned capability flag: a tampered fv only
      // downgrades the sender to slower legacy chunks, never breaks receipt).
      fv: FILE_PROTO_VERSION,
      sig: await signHello(this.id.secretKey, this.id.userId, this.id.name, ts),
    }
  }

  /** True when the peer announced batched-chunk support (else legacy fchunk). */
  peerSupportsBatch(friendId: string): boolean {
    return (this.peerFileVersion.get(friendId) ?? 1) >= 2
  }

  /** True when the peer can receive chunked profile images ('pimg'). */
  peerSupportsProfileImg(friendId: string): boolean {
    return (this.peerFileVersion.get(friendId) ?? 0) >= 3
  }

  /** Claimed file-protocol version (0 = never heard a hello yet). */
  peerFileVersionOf(friendId: string): number {
    return this.peerFileVersion.get(friendId) ?? 0
  }

  /** Build a signed hello payload for a target — used by the persistent
   * Nostr channel so it can publish the same verifiable beacon Trystero
   * sends, without depending on peer discovery. */
  async helloPayload(targetUserId: string): Promise<HelloPayload> {
    return this.makeHello(targetUserId)
  }

  /** Leave + rejoin a DM room (resets wedged discovery state). Safe to call
   * any time; in-flight streams abort and resume via the normal retry path. */
  async rejoinDmRoom(friendId: string): Promise<void> {
    this.leaveDmRoom(friendId)
    await this.ensureDmRoom(friendId)
  }

  /** Re-broadcast hello in every joined DM room — including apparently
   * empty ones. A room can look empty locally while the peer still listens
   * (missed join handshake), and only an actual hello heals that. */
  async broadcastHellos(): Promise<void> {
    for (const entry of this.dmRooms.values()) {
      if (!entry.hello) continue
      try {
        await entry.hello(await this.makeHello(entry.friendId))
      } catch {
        // room died mid-beat — next interval retries
      }
    }
  }

  /** Join my lobby and listen for incoming friend requests. */
  async start(): Promise<void> {
    if (this.lobby) return
    const me = this.id.userId
    const lobby = joinRoom(opts(), lobbyRoomFor(me))
    this.lobby = lobby
    const freq = lobby.makeAction<HelloPayload>('freq')
    freq.onMessage = async (data) => {
      if (!data || data.v !== 1) return
      if (data.to !== me) return
      if (data.userId === me) return
      const ok = await verifyHello(data.userId, data.name, data.ts, data.sig)
      if (ok) this.cb.onFriendRequest(data.userId, data.name)
    }
  }

  /** Leave + rejoin my lobby (recovers silently-dead request listening
   * after sleep/network flaps — nothing else rejoins it mid-session). */
  async rejoinLobby(): Promise<void> {
    try {
      await this.lobby?.leave()
    } catch {
      // already gone
    }
    this.lobby = null
    await this.start()
  }

  /** Send a friend request to the owner of a lobby room. */  async sendFriendRequest(targetUserId: string): Promise<void> {
    const payload = await this.makeHello(targetUserId)
    const roomId = lobbyRoomFor(targetUserId)
    const existing = this.lobbySends.get(roomId)
    if (existing) {
      await existing.send(payload)
      return
    }
    const room = joinRoom(opts(), roomId)
    const freq = room.makeAction<HelloPayload>('freq')
    const send = (data: HelloPayload, target?: string): Promise<void> =>
      target ? freq.send(data, { target }) : freq.send(data)
    this.lobbySends.set(roomId, { send, room })
    // Targeted send on discovery (avoids spamming other requesters),
    // plus one broadcast in case discovery already happened.
    room.onPeerJoin = (peerId: string) => {
      void send(payload, peerId)
    }
    setTimeout(() => {
      void send(payload)
    }, 5000)
    // Stay in the target's lobby for the lifetime of the pending request —
    // ephemeral Nostr events have no store-and-forward, so a knock only lands
    // if the recipient's subscription is open the instant we publish. Keeping
    // the room joined means onPeerJoin re-fires the targeted knock whenever
    // the recipient comes online, instead of only during a 45 s window.
    // Cleanup happens via stopFriendRequest / reconcileLobbySends when the
    // request is fulfilled or dropped.
  }

  /** Stop knocking at a target's lobby (request fulfilled or dropped). */
  async stopFriendRequest(targetUserId: string): Promise<void> {
    const roomId = lobbyRoomFor(targetUserId)
    const entry = this.lobbySends.get(roomId)
    if (!entry) return
    this.lobbySends.delete(roomId)
    try {
      await entry.room.leave()
    } catch {
      // already gone
    }
  }

  /** Leave lobby-send rooms for userIds that are no longer pending outgoing
   * requests (accepted, mutual-completed, or unfriended). Called from the
   * retry heartbeat so fulfilled requests don't leak rooms forever. */
  reconcileLobbySends(pendingOut: Set<string>): void {
    for (const [roomId, entry] of [...this.lobbySends.entries()]) {
      // roomId is lobbyRoomFor(target) = `rascals-lobby:<target>`; extract target
      const target = roomId.startsWith('rascals-lobby:')
        ? roomId.slice('rascals-lobby:'.length)
        : ''
      if (target && !pendingOut.has(target)) {
        this.lobbySends.delete(roomId)
        try {
          void entry.room.leave()
        } catch {
          // already gone
        }
      }
    }
  }

  /** Join (or reuse) the pairwise DM room for a friend. */
  async ensureDmRoom(friendId: string): Promise<void> {
    if (this.dmRooms.has(friendId)) return
    const me = this.id.userId
    const room = joinRoom(opts(), await dmRoomFor(me, friendId))
    const entry: DmEntry = {
      room,
      friendId,
      peers: new Set(),
      senders: new Map(),
    }
    this.dmRooms.set(friendId, entry)

    const hello = room.makeAction<HelloPayload>('hello')
    entry.hello = (payload) => hello.send(payload)
    const wire = (name: MsgActionName) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const act = room.makeAction<any>(name)
      const sender: Sender = (d) => act.send(d)
      entry.senders.set(name, sender)
      return act
    }

    room.onPeerJoin = (peerId: string) => {
      entry.peers.add(peerId)
      this.cb.onPeerOnline(friendId)
      void this.makeHello(friendId).then((payload) =>
        hello.send(payload, { target: peerId }),
      )
    }
    room.onPeerLeave = (peerId: string) => {
      entry.peers.delete(peerId)
      if (entry.peers.size === 0) { window.setTimeout(() => { if (entry.peers.size === 0) this.cb.onPeerOffline(friendId) }, 15000) }
    }
    hello.onMessage = async (data) => {
      if (!data || data.v !== 1) return
      if (data.userId !== friendId) return
      if (data.userId === me) return
      const ok = await verifyHello(data.userId, data.name, data.ts, data.sig)
      if (ok) {
        this.peerFileVersion.set(data.userId, typeof data.fv === 'number' ? data.fv : 1)
        this.cb.onHello(data.userId, data.name, data.ts)
      }
    }

    wire('msg').onMessage = (data: MsgEnvelope) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      this.msg?.onUpsert(data)
    }
    wire('ack').onMessage = (data: AckMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      this.msg?.onAck(data.ackId, data.from)
    }
    wire('typing').onMessage = (data: TypingMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      this.msg?.onTyping(data.from, data.typing === true)
    }
    wire('hreq').onMessage = (data: HReqMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      this.msg?.onHistoryReq(data.from, data.since)
    }
    wire('hoffer').onMessage = (data: HOfferMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      if (Array.isArray(data.msgs)) this.msg?.onHistoryOffer(data.from, data)
    }
    wire('react').onMessage = (data: ReactMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      if (typeof data.msgId === 'string' && typeof data.emoji === 'string')
        this.msg?.onReact(data.from, data)
    }
    wire('pin').onMessage = (data: PinMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      if (typeof data.msgId === 'string') this.msg?.onPin(data.from, data)
    }
    wire('fchunk').onMessage = (data: FileChunkMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      if (typeof data.fileId === 'string' && typeof data.seq === 'number')
        this.msg?.onFileChunk(data.from, data)
    }
    wire('fbatch').onMessage = (data: FileBatchMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      if (typeof data.fileId === 'string' && typeof data.baseSeq === 'number')
        this.msg?.onFileBatch(data.from, data)
    }
    wire('fget').onMessage = (data: FileGetMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      if (typeof data.fileId === 'string')
        this.msg?.onFileGet(data.from, data)
    }
    wire('profget').onMessage = (data: ProfileReqMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      this.msg?.onProfileGet(data.from, data)
    }
    wire('profshow').onMessage = (data: ProfileShowMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      this.msg?.onProfileShow(data.from, data)
    }
    wire('pimg').onMessage = (data: ProfileImgMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      if (
        (data.kind === 'avatar' || data.kind === 'banner') &&
        typeof data.mime === 'string' &&
        typeof data.total === 'number' &&
        typeof data.baseSeq === 'number' &&
        typeof data.count === 'number' &&
        typeof data.nonce === 'string' &&
        typeof data.box === 'string'
      )
        this.msg?.onProfileImg(data.from, data)
    }
    wire('ctrl').onMessage = (data: CtrlMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      if (typeof data.nonce === 'string' && typeof data.box === 'string')
        this.msg?.onCtrl(data.from, data)
    }
    wire('call').onMessage = (data: CallMsg) => {
      if (!data || data.v !== 1 || data.from !== friendId || data.to !== me)
        return
      if (
        (data.kind === 'offer' || data.kind === 'accept' || data.kind === 'decline' || data.kind === 'hangup') &&
        typeof data.callId === 'string'
      )
        this.msg?.onCall(data.from, data)
    }
  }

  /** Send a wire message to a friend's DM room (throws if room not joined). */
  async sendAction(
    friendId: string,
    action: MsgActionName,
    data: MsgWire,
  ): Promise<void> {
    const entry = this.dmRooms.get(friendId)
    if (!entry) throw new Error('DM room not joined')
    const sender = entry.senders.get(action)
    if (!sender) throw new Error(`action ${action} not registered`)
    await sender(data as never)
  }

  // ---- Group rooms -------------------------------------------------------

  /** Join (or reuse) a group's shared room. Handlers come from setGroupHandlers. */
  async joinGroupRoom(groupId: string): Promise<void> {
    if (this.groupRooms.has(groupId)) return
    const room = joinRoom(opts(), groupRoomFor(groupId))
    const entry: DmEntry = { room, friendId: groupId, peers: new Set(), senders: new Map() }
    this.groupRooms.set(groupId, entry)
    const g = this.gmsg

    const wire = (name: GroupActionName) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const act = room.makeAction<any>(name)
      const sender: Sender = (d) => act.send(d)
      entry.senders.set(name as MsgActionName, sender)
      return act
    }

    room.onPeerJoin = (peerId: string) => {
      entry.peers.add(peerId)
      this.gcb?.onGroupPeer(groupId, true)
    }
    room.onPeerLeave = (peerId: string) => {
      entry.peers.delete(peerId)
      if (entry.peers.size === 0) this.gcb?.onGroupPeer(groupId, false)
    }

    const check = (data: { v?: unknown; groupId?: unknown; sender?: unknown }): boolean =>
      !!data && data.v === 1 && data.groupId === groupId && typeof data.sender === 'string'

    wire('gmsg').onMessage = (data: GMsg) => {
      if (check(data) && typeof data.id === 'string') g?.onGMsg(groupId, data)
    }
    wire('gctrl').onMessage = (data: GCtrl) => {
      if (check(data) && typeof data.op === 'string') g?.onGCtrl(groupId, data)
    }
    wire('gkey').onMessage = (data: GKey) => {
      if (check(data) && typeof data.to === 'string') g?.onGKey(groupId, data)
    }
    wire('gack').onMessage = (data: GAck) => {
      if (check(data) && typeof data.ackId === 'string') g?.onGAck(groupId, data.ackId, data.sender as string)
    }
    wire('gtyping').onMessage = (data: GTyping) => {
      if (check(data)) g?.onGTyping(groupId, data.sender as string, data.name, data.typing === true)
    }
    wire('greq').onMessage = (data: GReq) => {
      if (check(data)) g?.onGReq(groupId, data.sender as string, data.since)
    }
    wire('goffer').onMessage = (data: GOffer) => {
      if (check(data) && Array.isArray(data.msgs)) g?.onGOffer(groupId, data.sender as string, data)
    }
    wire('greact').onMessage = (data: GReact) => {
      if (check(data) && typeof data.msgId === 'string') g?.onGReact(groupId, data.sender as string, data)
    }
    wire('gpin').onMessage = (data: GPin) => {
      if (check(data) && typeof data.msgId === 'string') g?.onGPin(groupId, data.sender as string, data)
    }
    wire('gfchunk').onMessage = (data: GChunk) => {
      if (check(data) && typeof data.fileId === 'string') g?.onGChunk(groupId, data.sender as string, data)
    }
    wire('gfget').onMessage = (data: GGet) => {
      if (check(data) && typeof data.fileId === 'string') g?.onGGet(groupId, data.sender as string, data)
    }
    wire('gfkey').onMessage = (data: GFileKey) => {
      if (check(data) && typeof data.fileId === 'string' && typeof data.to === 'string')
        g?.onGFileKey(groupId, data.sender as string, data)
    }
  }

  async sendGroupAction(groupId: string, action: GroupActionName, data: GroupWire): Promise<void> {
    const entry = this.groupRooms.get(groupId)
    if (!entry) throw new Error('group room not joined')
    const sender = entry.senders.get(action as MsgActionName)
    if (!sender) throw new Error(`group action ${action} not registered`)
    await sender(data as never)
  }

  groupPeerCount(groupId: string): number {
    return this.groupRooms.get(groupId)?.peers.size ?? 0
  }

  leaveGroupRoom(groupId: string): void {
    const entry = this.groupRooms.get(groupId)
    if (entry) {
      void entry.room.leave()
      this.groupRooms.delete(groupId)
    }
  }

  /** Fully disconnect a DM: leave the room so no further traffic flows. */
  leaveDmRoom(friendId: string): void {
    const entry = this.dmRooms.get(friendId)
    if (entry) {
      void entry.room.leave()
      this.dmRooms.delete(friendId)
    }
  }

  // ---- Server rooms --------------------------------------------------------

  async joinServerRoom(serverId: string): Promise<void> {
    if (this.serverRooms.has(serverId)) return
    const room = joinRoom(opts(), serverRoomFor(serverId))
    const entry: DmEntry = { room, friendId: serverId, peers: new Set(), senders: new Map() }
    this.serverRooms.set(serverId, entry)
    const h = this.smsg
    const wire = (name: ServerActionName) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const act = room.makeAction<any>(name)
      const sender: Sender = (d) => act.send(d)
      entry.senders.set(name as MsgActionName, sender)
      return act
    }
    const check = (data: { v?: unknown; serverId?: unknown }): boolean =>
      !!data && data.v === 1 && data.serverId === serverId
    wire('sdesc').onMessage = (data: SDesc) => {
      if (check(data) && typeof data.desc === 'string') h?.onSDesc(serverId, data)
    }
    wire('sop').onMessage = (data: SOp) => {
      if (check(data) && typeof data.op === 'string') h?.onSOp(serverId, data)
    }
    wire('sreq').onMessage = (data: SReq) => {
      if (check(data) && typeof data.sender === 'string') h?.onSReq(serverId, data.sender as string)
    }
    wire('soffer').onMessage = (data: SOffer) => {
      if (check(data) && typeof data.desc === 'string' && Array.isArray(data.ops))
        h?.onSOffer(serverId, data.sender as string, data)
    }
  }

  async sendServerAction(serverId: string, action: ServerActionName, data: ServerWire): Promise<void> {
    const entry = this.serverRooms.get(serverId)
    if (!entry) throw new Error('server room not joined')
    const sender = entry.senders.get(action as MsgActionName)
    if (!sender) throw new Error(`server action ${action} not registered`)
    await sender(data as never)
  }

  leaveServerRoom(serverId: string): void {
    const entry = this.serverRooms.get(serverId)
    if (entry) {
      void entry.room.leave()
      this.serverRooms.delete(serverId)
    }
  }

  /** Snapshot for the Connection diagnostics panel. Never throws. */
  diagnostics(): {
    selfId: string
    userId: string
    relays: Array<{ url: string; state: string }>
    lobbyPeers: number
    dmRooms: number
    dmPeers: number
    groupRooms: number
    groupPeers: number
    serverRooms: number
  } {
    const relays: Array<{ url: string; state: string }> = []
    try {
      // NOTE: getRelaySockets() returns {url: rawWebSocket} — NOT wrapped.
      // (An earlier version read .socket.readyState and reported everything
      // as closed. That was a diagnostics bug, not a connection bug.)
      const sockets = (getRelaySockets() ?? {}) as Record<string, { readyState?: number }>
      for (const [url, ws] of Object.entries(sockets)) {
        const rs = ws?.readyState
        relays.push({
          url,
          state: rs === 1 ? 'connected' : rs === 0 ? 'connecting' : 'closed',
        })
      }
    } catch {
      // diagnostics must never break the app
    }
    const peers = (m: Map<string, DmEntry>): number => {
      let n = 0
      for (const e of m.values()) n += e.peers.size
      return n
    }
    let lobbyPeers = 0
    try {
      lobbyPeers = this.lobby ? Object.keys(this.lobby.getPeers()).length : 0
    } catch {
      lobbyPeers = 0
    }
    return {
      selfId: typeof selfId === 'string' ? selfId : '',
      userId: this.id.userId,
      relays,
      lobbyPeers,
      dmRooms: this.dmRooms.size,
      dmPeers: peers(this.dmRooms),
      groupRooms: this.groupRooms.size,
      groupPeers: peers(this.groupRooms),
      serverRooms: this.serverRooms.size,
    }
  }

  stop(): void {
    if (this.lobby) {
      void this.lobby.leave()
      this.lobby = null
    }
    for (const entry of this.dmRooms.values()) void entry.room.leave()
    this.dmRooms.clear()
    for (const entry of this.groupRooms.values()) void entry.room.leave()
    this.groupRooms.clear()
    for (const entry of this.serverRooms.values()) void entry.room.leave()
    this.serverRooms.clear()
  }
}
