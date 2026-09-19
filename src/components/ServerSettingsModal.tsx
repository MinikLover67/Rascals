import { useState } from 'react'
import { getServerChat } from '../lib/session'
import { useApp, type ServerRole } from '../store/app'
import { shortUid } from './GroupsPanel'

export default function ServerSettingsModal({
  serverId,
  onClose,
}: {
  serverId: string
  onClose: () => void
}) {
  const server = useApp((s) => s.servers[serverId])
  const identity = useApp((s) => s.identity)
  const friends = useApp((s) => s.friends)
  const [tab, setTab] = useState<'general' | 'members' | 'channels'>('general')
  const [name, setName] = useState(server?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inviting, setInviting] = useState(false)

  if (!server || !identity) return null
  const myRole = server.members[identity.userId]
  const isOwner = myRole === 'owner'
  const canManage = isOwner || myRole === 'admin'
  const nameOf = (uid: string): string =>
    uid === identity.userId ? 'You' : (friends.find((f) => f.userId === uid)?.displayName ?? shortUid(uid))
  const candidates = friends.filter((f) => !server.members[f.userId])

  async function run(fn: () => Promise<string | null | void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const err = await fn()
      if (typeof err === 'string' && err) setError(err)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-rascal-line bg-rascal-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">{server.name} - settings</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-rascal-dim hover:text-white">
            Close
          </button>
        </div>
        <div className="mt-3 flex gap-1.5">
          {(['general', 'members', 'channels'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                tab === t ? 'bg-rascal-accent text-white' : 'bg-white/5 text-rascal-dim hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto scroll-thin">
          {tab === 'general' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-rascal-dim">
                Server name
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canManage}
                  className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 text-sm outline-none focus:border-rascal-accent disabled:opacity-60"
                />
                {canManage && (
                  <button
                    onClick={() => void run(() => getServerChat()?.renameServer(serverId, name) ?? Promise.resolve('Chat not ready.'))}
                    disabled={busy}
                    className="rounded-lg bg-rascal-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Save
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs text-rascal-dim">
                Your role: {myRole}. Admins manage members and channels; only the owner changes roles or deletes the server.
              </p>
              <div className="mt-4 border-t border-rascal-line pt-3">
                {isOwner ? (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete ${server.name} for everyone?`)) {
                        void getServerChat()?.deleteServer(serverId).then(() => onClose())
                      }
                    }}
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-red-300 hover:bg-white/10"
                  >
                    Delete server
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (window.confirm(`Leave ${server.name}?`)) {
                        void getServerChat()?.leaveServer(serverId).then(() => onClose())
                      }
                    }}
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-red-300 hover:bg-white/10"
                  >
                    Leave server
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'members' && (
            <div>
              {canManage && (
                <div className="mb-2">
                  {!inviting ? (
                    <button
                      onClick={() => setInviting(true)}
                      disabled={candidates.length === 0}
                      className="w-full rounded-lg border border-dashed border-rascal-line px-3 py-1.5 text-sm text-rascal-dim hover:border-rascal-accent hover:text-white disabled:opacity-40"
                    >
                      {candidates.length === 0 ? 'All friends already here' : 'Invite a friend'}
                    </button>
                  ) : (
                    <div className="rounded-lg border border-rascal-line p-2">
                      {candidates.map((f) => (
                        <div key={f.userId} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-white/5">
                          <span className="flex-1 truncate text-sm">{f.displayName}</span>
                          <button
                            onClick={() => void run(() => getServerChat()?.inviteFriend(serverId, f.userId) ?? Promise.resolve('Chat not ready.'))}
                            disabled={busy}
                            className="rounded-md bg-rascal-accent px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            Invite
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setInviting(false)} className="mt-1 text-xs text-rascal-dim hover:text-white">
                        done
                      </button>
                    </div>
                  )}
                </div>
              )}
              {Object.entries(server.members).map(([uid, role]) => (
                <div key={uid} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <span className="flex-1 truncate text-sm">
                    {nameOf(uid)}
                    <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-rascal-dim">{role}</span>
                  </span>
                  {isOwner && uid !== server.creator && (
                    <select
                      value={role}
                      disabled={busy}
                      onChange={(e) =>
                        void run(() => getServerChat()?.setRole(serverId, uid, e.target.value as ServerRole) ?? Promise.resolve('Chat not ready.'))
                      }
                      className="rounded-md border border-rascal-line bg-rascal-bg px-1.5 py-0.5 text-xs"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  )}
                  {canManage && uid !== identity.userId && uid !== server.creator && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove ${nameOf(uid)} from ${server.name}?`)) {
                          void run(() => getServerChat()?.removeServerMember(serverId, uid) ?? Promise.resolve('Chat not ready.'))
                        }
                      }}
                      className="rounded px-1.5 text-xs text-rascal-dim hover:text-red-300"
                    >
                      remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'channels' && (
            <div>
              {server.channels.map((c) => (
                <ChannelRow key={c.id} serverId={serverId} channelId={c.id} name={c.name} topic={c.topic} canManage={canManage} deletable={server.channels.length > 1} onError={setError} />
              ))}
              {!canManage && (
                <p className="mt-2 text-xs text-rascal-dim">Only owners and admins manage channels.</p>
              )}
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  )
}

function ChannelRow({
  serverId,
  channelId,
  name,
  topic,
  canManage,
  deletable,
  onError,
}: {
  serverId: string
  channelId: string
  name: string
  topic?: string
  canManage: boolean
  deletable: boolean
  onError: (e: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [n, setN] = useState(name)
  const [t, setT] = useState(topic ?? '')

  async function save() {
    onError(null)
    const err = await getServerChat()?.renameChannel(serverId, channelId, n, t).catch((e: unknown) => (e instanceof Error ? e.message : 'Failed.'))
    if (err) onError(err)
    else setEditing(false)
  }

  async function remove() {
    if (!window.confirm(`Delete #${name}? Message history stays on members' PCs.`)) return
    onError(null)
    const err = await getServerChat()?.removeChannel(serverId, channelId).catch((e: unknown) => (e instanceof Error ? e.message : 'Failed.'))
    if (err) onError(err)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
        <span className="text-rascal-dim">#</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {name}
          {topic && <span className="ml-2 truncate text-[11px] text-rascal-dim">{topic}</span>}
        </span>
        {canManage && (
          <>
            <button onClick={() => setEditing(true)} className="rounded px-1.5 text-xs text-rascal-dim hover:text-white">
              edit
            </button>
            {deletable && (
              <button onClick={() => void remove()} className="rounded px-1.5 text-xs text-rascal-dim hover:text-red-300">
                delete
              </button>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="mt-1 rounded-lg border border-rascal-line p-2">
      <input
        value={n}
        onChange={(e) => setN(e.target.value)}
        className="w-full rounded-md border border-rascal-line bg-rascal-bg px-2 py-1 text-sm outline-none focus:border-rascal-accent"
      />
      <input
        value={t}
        onChange={(e) => setT(e.target.value)}
        placeholder="topic (optional)"
        className="mt-1.5 w-full rounded-md border border-rascal-line bg-rascal-bg px-2 py-1 text-sm outline-none focus:border-rascal-accent"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button onClick={() => void save()} className="flex-1 rounded-md bg-rascal-accent px-2 py-1 text-xs font-semibold text-white">
          Save
        </button>
        <button onClick={() => setEditing(false)} className="flex-1 rounded-md bg-white/5 px-2 py-1 text-xs text-rascal-dim hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  )
}
