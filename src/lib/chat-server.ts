// Servers: named collections of channel chats with roles.
//
// A server is a signed descriptor {members, roles, channels, epoch} synced over
// a dedicated server room. Each channel is a full group chat (chat-group.ts)
// whose membership mirrors the server. Ops are signed; only owner/admin roles
// may change state (role changes are owner-only). Concurrent same-epoch ops
// resolve first-seen-wins; full descriptor sync on every history request heals
// divergence. Invites travel over pairwise-encrypted DMs like group invites.

import { signText, verifyText } from './crypto'
import type { AnyInvitePayload } from './chat'
import type { GroupApi } from './chat-group'
import type { Identity } from './identity'
import type { P2P, ServerHandlers, SOp } from './p2p'
import {
  useApp,
  type ServerChannel,
  type ServerInfo,
  type ServerRole,
} from '../store/app'
import type { CtrlServerInvite } from './chat'

const OP_LOG_CAP = 100

export interface ServerApi {
  handlers: ServerHandlers
  createServer: (name: string) => Promise<string>
  handleInvite: (from: string, invite: CtrlServerInvite) => Promise<void>
  joinAll: () => Promise<void>
  inviteFriend: (serverId: string, friendId: string) => Promise<string | null>
  resendInvites: (friendId: string) => Promise<void>
  addChannel: (serverId: string, name: string, topic?: string) => Promise<string | null>
  removeChannel: (serverId: string, channelId: string) => Promise<string | null>
  renameChannel: (serverId: string, channelId: string, name: string, topic?: string) => Promise<string | null>
  renameServer: (serverId: string, name: string) => Promise<string | null>
  setRole: (serverId: string, uid: string, role: ServerRole) => Promise<string | null>
  removeServerMember: (serverId: string, uid: string) => Promise<string | null>
  leaveServer: (serverId: string) => Promise<void>
  deleteServer: (serverId: string) => Promise<void>
  requestSync: (serverId: string) => Promise<void>
}

type OpName =
  | 'member-add'
  | 'member-remove'
  | 'role'
  | 'channel-add'
  | 'channel-remove'
  | 'channel-rename'
  | 'rename'
  | 'leave'
  | 'delete'

function serverOf(serverId: string): ServerInfo | undefined {
  return useApp.getState().servers[serverId]
}

function roleOf(s: ServerInfo, uid: string): ServerRole | undefined {
  return s.members[uid]
}

function canManage(s: ServerInfo, uid: string): boolean {
  const r = roleOf(s, uid)
  return r === 'owner' || r === 'admin'
}

function descSigText(serverId: string, epoch: number, author: string, desc: string): string {
  return `rascals-server-v1:${serverId}:${epoch}:${author}:${desc}`
}

function opSigText(serverId: string, epoch: number, author: string, op: string, data: string): string {
  return `rascals-server-op-v1:${serverId}:${epoch}:${author}:${op}:${data}`
}

function encodeDesc(s: ServerInfo): string {
  return JSON.stringify({
    id: s.id,
    name: s.name,
    creator: s.creator,
    members: s.members,
    channels: s.channels,
    epoch: s.epoch,
  })
}

function decodeDesc(raw: string): ServerInfo | null {
  try {
    const d = JSON.parse(raw) as Record<string, unknown>
    if (typeof d.id !== 'string' || typeof d.name !== 'string') return null
    if (typeof d.creator !== 'string' || typeof d.epoch !== 'number') return null
    if (typeof d.members !== 'object' || d.members === null) return null
    if (!Array.isArray(d.channels)) return null
    const members: Record<string, ServerRole> = {}
    for (const [k, v] of Object.entries(d.members as Record<string, unknown>)) {
      if (v === 'owner' || v === 'admin' || v === 'member') members[k] = v
    }
    if (members[d.creator] !== 'owner') members[d.creator] = 'owner'
    const channels: ServerChannel[] = []
    for (const c of d.channels as Array<Record<string, unknown>>) {
      if (typeof c.id === 'string' && typeof c.name === 'string') {
        channels.push({
          id: c.id,
          name: c.name.slice(0, 64),
          topic: typeof c.topic === 'string' ? c.topic.slice(0, 256) : undefined,
        })
      }
    }
    return {
      id: d.id,
      name: d.name.slice(0, 64),
      creator: d.creator,
      members,
      channels,
      epoch: d.epoch,
      createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
    }
  } catch {
    return null
  }
}

export function bindServerChat(
  identity: Identity,
  p2p: () => P2P | null,
  deps: {
    sendDmCtrl: (friendId: string, payload: AnyInvitePayload) => Promise<boolean>
    group: () => GroupApi | null
  },
): ServerApi {
  const me = identity.userId
  const opLogs = new Map<string, SOp[]>()
  // serverId -> inviter while we wait for a descriptor that proves their role
  const pendingInvites = new Map<string, string>()

  function logOp(serverId: string, op: SOp): void {
    let log = opLogs.get(serverId)
    if (!log) {
      log = []
      opLogs.set(serverId, log)
    }
    if (log.some((o) => o.sig === op.sig)) return
    log.push(op)
    if (log.length > OP_LOG_CAP) log.splice(0, log.length - OP_LOG_CAP)
  }

  // ---- channel sync: server descriptor is the source of truth ----

  /** Reconcile channel groups with the descriptor. Returns nothing; side effects only. */
  async function syncChannels(s: ServerInfo, prev: ServerInfo | undefined): Promise<void> {
    const gapi = deps.group()
    if (!gapi) return
    const st = useApp.getState()
    const prevChannels = new Map((prev?.channels ?? []).map((c) => [c.id, c]))
    const memberUids = Object.keys(s.members)

    for (const ch of s.channels) {
      const existing = st.groups[ch.id]
      if (!existing) {
        // New channel: adopt with the server's member list.
        st.upsertGroup({
          id: ch.id,
          name: ch.name,
          creator: s.creator,
          members: [...memberUids],
          epoch: 1,
          createdAt: Date.now(),
          serverId: s.id,
          topic: ch.topic,
        })
        await gapi.ensureRoom(ch.id).catch(() => {})
        await gapi.shareKey(ch.id, memberUids).catch(() => {})
        await gapi.groupAvailable(ch.id).catch(() => {})
      } else {
        // Rename/topic sync is cheap and conflict-free.
        if (existing.name !== ch.name || existing.topic !== ch.topic) {
          st.upsertGroup({ ...existing, name: ch.name, topic: ch.topic })
        }
        const added = await gapi.syncChannelMembers(ch.id, memberUids).catch(() => [])
        void added
        await gapi.ensureRoom(ch.id).catch(() => {})
      }
      void prevChannels
    }

    // Dropped channels: leave the room, drop keys, keep local history.
    const live = new Set(s.channels.map((c) => c.id))
    for (const [id, grp] of Object.entries(st.groups)) {
      if (grp.serverId === s.id && !live.has(id)) {
        await gapi.dropRoom(id).catch(() => {})
      }
    }

    // Membership shrink: rotate every channel for backward secrecy.
    const prevMembers = new Set(Object.keys(prev?.members ?? {}))
    const curMembers = new Set(memberUids)
    const removed = [...prevMembers].filter((x) => !curMembers.has(x) && x !== me)
    if (removed.length > 0 && prev) {
      for (const ch of s.channels) {
        await gapi.rotateGroupChain(ch.id).catch(() => {})
      }
    }
  }

  async function dropServerLocal(serverId: string): Promise<void> {
    const s = useApp.getState()
    const info = s.servers[serverId]
    const gapi = deps.group()
    if (info && gapi) {
      for (const ch of info.channels) {
        await gapi.dropRoom(ch.id).catch(() => {})
      }
    }
    s.removeServer(serverId)
    opLogs.delete(serverId)
    pendingInvites.delete(serverId)
    p2p()?.leaveServerRoom(serverId)
  }

  async function broadcastDesc(serverId: string): Promise<void> {
    const inst = p2p()
    const s = serverOf(serverId)
    if (!inst || !s) return
    const desc = encodeDesc(s)
    const sig = await signText(identity.secretKey, descSigText(serverId, s.epoch, me, desc))
    await inst
      .sendServerAction(serverId, 'sdesc', { v: 1, serverId, epoch: s.epoch, author: me, desc, sig })
      .catch(() => {})
  }

  async function postOp(serverId: string, op: OpName, data: Record<string, string>): Promise<boolean> {
    const inst = p2p()
    const s = serverOf(serverId)
    if (!inst || !s) return false
    const epoch = s.epoch + 1
    const body = JSON.stringify(data)
    const sig = await signText(identity.secretKey, opSigText(serverId, epoch, me, op, body))
    const msg = { v: 1, serverId, epoch, author: me, op, data: body, sig }
    // Apply locally first so the UI updates instantly.
    const applied = applyOp(serverId, { ...msg })
    if (!applied) return false
    logOp(serverId, { ...msg })
    await inst.sendServerAction(serverId, 'sop', msg).catch(() => {})
    return true
  }

  /** Apply a validated op to local state. Returns false when rejected.
   *  Channel side-effects (key shares, rotations) run in the background. */
  function applyOp(serverId: string, msg: SOp): boolean {
    const s = useApp.getState()
    const cur = s.servers[serverId]
    if (!cur) return false
    if (msg.epoch !== cur.epoch + 1) return false
    let data: Record<string, unknown>
    try {
      data = JSON.parse(msg.data) as Record<string, unknown>
    } catch {
      return false
    }
    switch (msg.op as OpName) {
      case 'member-add': {
        if (!canManage(cur, msg.author)) return false
        if (typeof data.added !== 'string') return false
        if (cur.members[data.added]) return true
        const role = data.role === 'admin' ? 'admin' : 'member'
        s.upsertServer({
          ...cur,
          members: { ...cur.members, [data.added]: role },
          epoch: msg.epoch,
        })
        void syncChannels(
          { ...cur, members: { ...cur.members, [data.added]: role }, epoch: msg.epoch },
          cur,
        ).catch(() => {})
        return true
      }
      case 'member-remove': {
        if (!canManage(cur, msg.author)) return false
        if (typeof data.removed !== 'string') return false
        if (data.removed === cur.creator) return false
        if (!cur.members[data.removed]) return true
        const members = { ...cur.members }
        delete members[data.removed]
        const next = { ...cur, members, epoch: msg.epoch }
        s.upsertServer(next)
        if (data.removed === me) {
          void dropServerLocal(serverId)
        } else {
          void syncChannels(next, cur).catch(() => {})
        }
        return true
      }
      case 'role': {
        if (roleOf(cur, msg.author) !== 'owner') return false
        if (typeof data.uid !== 'string') return false
        if (data.role !== 'admin' && data.role !== 'member') return false
        if (data.uid === cur.creator || !cur.members[data.uid]) return false
        s.upsertServer({
          ...cur,
          members: { ...cur.members, [data.uid]: data.role },
          epoch: msg.epoch,
        })
        return true
      }
      case 'channel-add': {
        if (!canManage(cur, msg.author)) return false
        if (typeof data.channelId !== 'string' || typeof data.channelName !== 'string') return false
        if (cur.channels.some((c) => c.id === data.channelId)) return true
        const channel: ServerChannel = {
          id: data.channelId as string,
          name: (data.channelName as string).slice(0, 64),
          topic: typeof data.channelTopic === 'string' ? (data.channelTopic as string).slice(0, 256) : undefined,
        }
        const next = { ...cur, channels: [...cur.channels, channel], epoch: msg.epoch }
        s.upsertServer(next)
        void syncChannels(next, cur).catch(() => {})
        return true
      }
      case 'channel-remove': {
        if (!canManage(cur, msg.author)) return false
        if (typeof data.channelId !== 'string') return false
        if (!cur.channels.some((c) => c.id === data.channelId)) return true
        const next = {
          ...cur,
          channels: cur.channels.filter((c) => c.id !== data.channelId),
          epoch: msg.epoch,
        }
        s.upsertServer(next)
        void syncChannels(next, cur).catch(() => {})
        return true
      }
      case 'channel-rename': {
        if (!canManage(cur, msg.author)) return false
        if (typeof data.channelId !== 'string' || typeof data.name !== 'string') return false
        const next = {
          ...cur,
          channels: cur.channels.map((c) =>
            c.id === data.channelId
              ? {
                  ...c,
                  name: (data.name as string).slice(0, 64),
                  topic: typeof data.topic === 'string' ? (data.topic as string).slice(0, 256) : c.topic,
                }
              : c,
          ),
          epoch: msg.epoch,
        }
        s.upsertServer(next)
        void syncChannels(next, cur).catch(() => {})
        return true
      }
      case 'rename': {
        if (!canManage(cur, msg.author)) return false
        if (typeof data.name !== 'string' || !data.name.trim()) return false
        s.upsertServer({ ...cur, name: (data.name as string).trim().slice(0, 64), epoch: msg.epoch })
        return true
      }
      case 'leave': {
        if (msg.author === me) return true
        if (!cur.members[msg.author]) return true
        const members = { ...cur.members }
        delete members[msg.author]
        const next = { ...cur, members, epoch: msg.epoch }
        s.upsertServer(next)
        void syncChannels(next, cur).catch(() => {})
        return true
      }
      case 'delete': {
        if (msg.author !== cur.creator) return false
        void dropServerLocal(serverId)
        return true
      }
      default:
        return false
    }
  }

  async function applyDesc(msg: { epoch: number; author: string; desc: string; sig: string }, serverId: string): Promise<boolean> {
    const incoming = decodeDesc(msg.desc)
    if (!incoming || incoming.id !== serverId) return false
    const ok = await verifyText(msg.author, descSigText(serverId, msg.epoch, msg.author, msg.desc), msg.sig).catch(
      () => false,
    )
    if (!ok) return false
    // Author must hold a managing role in the descriptor they signed.
    const r = incoming.members[msg.author]
    if (r !== 'owner' && r !== 'admin') return false
    // The creator is immutable and always owner.
    const prev = serverOf(serverId)
    if (prev && incoming.creator !== prev.creator) return false
    if (prev && msg.epoch <= prev.epoch) return false
    useApp.getState().upsertServer({ ...incoming, epoch: msg.epoch, createdAt: prev?.createdAt ?? Date.now() })
    // Prove the inviter's role before trusting a server we were invited to.
    const inviter = pendingInvites.get(serverId)
    if (inviter && !prev) {
      const inviterRole = incoming.members[inviter]
      if (inviterRole !== 'owner' && inviterRole !== 'admin') {
        await dropServerLocal(serverId)
        return false
      }
      pendingInvites.delete(serverId)
    }
    await syncChannels({ ...incoming, epoch: msg.epoch }, prev).catch(() => {})
    return true
  }

  const handlers = {
    onSDesc: (serverId: string, msg: { epoch: number; author: string; desc: string; sig: string }) => {
      void applyDesc(msg, serverId)
    },
    onSOp: (serverId: string, msg: SOp) => {
      void (async () => {
        const cur = serverOf(serverId)
        if (!cur) {
          // Unknown server — ask for the full descriptor instead of tracking ops.
          await requestSync(serverId).catch(() => {})
          return
        }
        if (msg.epoch !== cur.epoch + 1) {
          if (msg.epoch > cur.epoch + 1) await requestSync(serverId).catch(() => {})
          return
        }
        const ok = await verifyText(
          msg.author,
          opSigText(serverId, msg.epoch, msg.author, msg.op, msg.data),
          msg.sig,
        ).catch(() => false)
        if (!ok) return
        if (applyOp(serverId, msg)) logOp(serverId, msg)
      })()
    },
    onSReq: (serverId: string, from: string) => {
      void (async () => {
        const inst = p2p()
        const cur = serverOf(serverId)
        if (!inst || !cur || !cur.members[from]) return
        const desc = encodeDesc(cur)
        const sig = await signText(identity.secretKey, descSigText(serverId, cur.epoch, me, desc))
        const ops = (opLogs.get(serverId) ?? []).slice(-50)
        await inst
          .sendServerAction(serverId, 'soffer', {
            v: 1, serverId, sender: me, epoch: cur.epoch, author: me, desc, sig, ops,
          })
          .catch(() => {})
      })()
    },
    onSOffer: (
      serverId: string,
      _from: string,
      msg: { epoch: number; author: string; desc: string; sig: string; ops: SOp[] },
    ) => {
      void (async () => {
        const ok = await applyDesc(msg, serverId)
        if (!ok) return
        for (const op of msg.ops ?? []) {
          const cur = serverOf(serverId)
          if (!cur || op.epoch !== cur.epoch + 1) continue
          const valid = await verifyText(
            op.author,
            opSigText(serverId, op.epoch, op.author, op.op, op.data),
            op.sig,
          ).catch(() => false)
          if (!valid) continue
          if (applyOp(serverId, op)) logOp(serverId, op)
        }
      })()
    },
  }

  async function requestSync(serverId: string): Promise<void> {
    const inst = p2p()
    if (!inst) return
    await inst
      .sendServerAction(serverId, 'sreq', { v: 1, serverId, sender: me })
      .catch(() => {})
  }

  async function createServer(name: string): Promise<string> {
    const clean = name.trim().slice(0, 64)
    if (!clean) throw new Error('Server needs a name.')
    const id = crypto.randomUUID()
    const info: ServerInfo = {
      id,
      name: clean,
      creator: me,
      members: { [me]: 'owner' },
      channels: [],
      epoch: 1,
      createdAt: Date.now(),
    }
    useApp.getState().upsertServer(info)
    await p2p()?.joinServerRoom(id).catch(() => {})
    // Every server starts with a general channel.
    const gapi = deps.group()
    if (gapi) {
      const general = await gapi.createBareGroup('general', [me], { serverId: id }).catch(() => null)
      if (general) {
        info.channels.push({ id: general, name: 'general' })
        info.epoch = 2
        useApp.getState().upsertServer(info)
      }
    }
    await broadcastDesc(id).catch(() => {})
    return id
  }

  async function handleInvite(from: string, invite: CtrlServerInvite): Promise<void> {
    if (!invite.id) return
    if (serverOf(invite.id)) return // already joined
    pendingInvites.set(invite.id, from)
    await p2p()?.joinServerRoom(invite.id).catch(() => {})
    await requestSync(invite.id).catch(() => {})
    // If nobody answers (or the inviter lacked rights), give up quietly.
    setTimeout(() => {
      if (pendingInvites.has(invite.id) && !serverOf(invite.id)) {
        pendingInvites.delete(invite.id)
        p2p()?.leaveServerRoom(invite.id)
      }
    }, 60000)
  }

  async function joinAll(): Promise<void> {
    const inst = p2p()
    if (!inst) return
    for (const id of Object.keys(useApp.getState().servers)) {
      await inst.joinServerRoom(id).catch(() => {})
      await requestSync(id).catch(() => {})
    }
  }

  async function inviteFriend(serverId: string, friendId: string): Promise<string | null> {
    const s = serverOf(serverId)
    if (!s) return 'Unknown server.'
    if (!canManage(s, me)) return 'Only owners and admins can invite.'
    if (s.members[friendId]) return 'Already on this server.'
    if (!useApp.getState().friends.some((f) => f.userId === friendId))
      return 'They must be your friend first.'
    const ok = await deps
      .sendDmCtrl(friendId, {
        kind: 'sinvite',
        server: { id: s.id, name: s.name, creator: s.creator, epoch: s.epoch },
      })
      .catch(() => false)
    if (!ok) return 'They are offline - invite them again when they come online.'
    // Record membership via a proper op so every online member converges.
    const added = await postOp(serverId, 'member-add', { added: friendId }).catch(() => false)
    if (!added) return 'The server changed - try again.'
    await broadcastDesc(serverId).catch(() => {})
    return null
  }

  async function addChannel(serverId: string, name: string, topic?: string): Promise<string | null> {
    const s = serverOf(serverId)
    if (!s) return 'Unknown server.'
    if (!canManage(s, me)) return 'Only owners and admins can add channels.'
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9-_ ]/g, '').trim().slice(0, 64) || 'channel'
    const gapi = deps.group()
    if (!gapi) return 'Chat not ready.'
    const id = await gapi.createBareGroup(clean, Object.keys(s.members), { serverId, topic }).catch(() => null)
    if (!id) return 'Could not create channel.'
    const added = await postOp(serverId, 'channel-add', {
      channelId: id,
      channelName: clean,
      channelTopic: topic ?? '',
    }).catch(() => false)
    if (!added) return 'The server changed - try again.'
    await broadcastDesc(serverId).catch(() => {})
    return null
  }

  async function removeChannel(serverId: string, channelId: string): Promise<string | null> {
    const s = serverOf(serverId)
    if (!s) return 'Unknown server.'
    if (!canManage(s, me)) return 'Only owners and admins can remove channels.'
    if (!s.channels.some((c) => c.id === channelId)) return 'Unknown channel.'
    if (s.channels.length <= 1) return 'A server needs at least one channel.'
    const okCr = await postOp(serverId, 'channel-remove', { channelId }).catch(() => false)
    if (!okCr) return 'The server changed - try again.'
    await broadcastDesc(serverId).catch(() => {})
    return null
  }

  async function renameChannel(
    serverId: string,
    channelId: string,
    name: string,
    topic?: string,
  ): Promise<string | null> {
    const s = serverOf(serverId)
    if (!s) return 'Unknown server.'
    if (!canManage(s, me)) return 'Only owners and admins can rename channels.'
    const clean = name.trim().slice(0, 64)
    if (!clean) return 'Channel needs a name.'
    const okCrn = await postOp(serverId, 'channel-rename', {
      channelId,
      name: clean,
      topic: (topic ?? '').slice(0, 256),
    }).catch(() => false)
    if (!okCrn) return 'The server changed - try again.'
    await broadcastDesc(serverId).catch(() => {})
    return null
  }

  async function renameServer(serverId: string, name: string): Promise<string | null> {
    const s = serverOf(serverId)
    if (!s) return 'Unknown server.'
    if (!canManage(s, me)) return 'Only owners and admins can rename the server.'
    const clean = name.trim().slice(0, 64)
    if (!clean) return 'Server needs a name.'
    const okRn = await postOp(serverId, 'rename', { name: clean }).catch(() => false)
    if (!okRn) return 'The server changed - try again.'
    await broadcastDesc(serverId).catch(() => {})
    return null
  }

  async function setRole(serverId: string, uid: string, role: ServerRole): Promise<string | null> {
    const s = serverOf(serverId)
    if (!s) return 'Unknown server.'
    if (roleOf(s, me) !== 'owner') return 'Only the owner can change roles.'
    if (uid === s.creator) return 'The owner keeps their crown.'
    if (!s.members[uid]) return 'Not on this server.'
    const okRole = await postOp(serverId, 'role', { uid, role }).catch(() => false)
    if (!okRole) return 'The server changed - try again.'
    await broadcastDesc(serverId).catch(() => {})
    return null
  }

  async function removeServerMember(serverId: string, uid: string): Promise<string | null> {
    const s = serverOf(serverId)
    if (!s) return 'Unknown server.'
    if (!canManage(s, me)) return 'Only owners and admins can remove people.'
    if (uid === s.creator) return 'Cannot remove the owner.'
    if (uid === me) return 'Use Leave instead.'
    if (!s.members[uid]) return 'Not on this server.'
    const okRm = await postOp(serverId, 'member-remove', { removed: uid }).catch(() => false)
    if (!okRm) return 'The server changed - try again.'
    await broadcastDesc(serverId).catch(() => {})
    return null
  }

  async function leaveServer(serverId: string): Promise<void> {
    const s = serverOf(serverId)
    if (s && s.members[me] && me !== s.creator) {
      const data = JSON.stringify({})
      const sig = await signText(
        identity.secretKey,
        opSigText(serverId, s.epoch + 1, me, 'leave', data),
      ).catch(() => null)
      if (sig) {
        const op = { v: 1, serverId, epoch: s.epoch + 1, author: me, op: 'leave', data, sig }
        if (applyOp(serverId, op)) {
          logOp(serverId, op)
          await p2p()?.sendServerAction(serverId, 'sop', op).catch(() => {})
        }
      }
    }
    await dropServerLocal(serverId)
  }

  async function deleteServer(serverId: string): Promise<void> {
    const s = serverOf(serverId)
    if (!s || s.creator !== me) return
    const data = JSON.stringify({})
    const sig = await signText(
      identity.secretKey,
      opSigText(serverId, s.epoch + 1, me, 'delete', data),
    ).catch(() => null)
    if (sig) {
      const op = { v: 1, serverId, epoch: s.epoch + 1, author: me, op: 'delete', data, sig }
      logOp(serverId, op)
      await p2p()?.sendServerAction(serverId, 'sop', op).catch(() => {})
    }
    await dropServerLocal(serverId)
  }

  return {
    handlers,
    createServer,
    handleInvite,
    joinAll,
    inviteFriend,
    resendInvites,
    addChannel,
    removeChannel,
    renameChannel,
    renameServer,
    setRole,
    removeServerMember,
    leaveServer,
    deleteServer,
    requestSync,
  }

  async function resendInvites(friendId: string): Promise<void> {
    for (const s of Object.values(useApp.getState().servers)) {
      if (!canManage(s, me) || s.members[friendId]) continue
      await deps
        .sendDmCtrl(friendId, {
          kind: 'sinvite',
          server: { id: s.id, name: s.name, creator: s.creator, epoch: s.epoch },
        })
        .catch(() => {})
    }
  }
}
