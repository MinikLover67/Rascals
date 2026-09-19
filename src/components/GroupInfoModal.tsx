import { useState } from 'react'
import { getGroupChat } from '../lib/session'
import { useApp } from '../store/app'
import { shortUid } from './GroupsPanel'

export default function GroupInfoModal({
  groupId,
  myId,
  managedBy,
  onClose,
}: {
  groupId: string
  myId: string
  /** When set, membership is managed by this server — hide add/remove/leave. */
  managedBy?: string
  onClose: () => void
}) {
  const group = useApp((s) => s.groups[groupId])
  const friends = useApp((s) => s.friends)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!group) return null
  const nameOf = (uid: string): string =>
    uid === myId ? 'You' : (friends.find((f) => f.userId === uid)?.displayName ?? shortUid(uid))
  const isAdmin = group.creator === myId
  const candidates = friends.filter((f) => !group.members.includes(f.userId))

  async function add(uid: string) {
    setBusy(true)
    setError(null)
    try {
      const err = await getGroupChat()?.addMember(groupId, uid)
      if (err) setError(err)
      else setAdding(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(uid: string) {
    if (!window.confirm(`Remove ${nameOf(uid)} from ${group.name}? They lose access to new messages.`))
      return
    setError(null)
    try {
      const err = await getGroupChat()?.removeMember(groupId, uid)
      if (err) setError(err)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove.')
    }
  }

  async function leave() {
    if (!window.confirm(`Leave ${group.name}?`)) return
    await getGroupChat()?.leaveGroup(groupId).catch(() => {})
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-rascal-line bg-rascal-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">{group.name}</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-rascal-dim hover:text-white">
            Close
          </button>
        </div>
        <div className="mt-1 text-xs text-rascal-dim">
          {group.members.length} member{group.members.length === 1 ? '' : 's'} - end-to-end encrypted
          {managedBy && <span> - managed by {managedBy}</span>}
        </div>
        <div className="mt-3 max-h-56 space-y-1 overflow-y-auto scroll-thin">
          {group.members.map((uid) => (
            <div key={uid} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
              <span className="flex-1 truncate text-sm">
                {nameOf(uid)}
                {uid === group.creator && (
                  <span className="ml-2 rounded bg-rascal-accent/25 px-1.5 py-0.5 text-[10px] text-rascal-accent">
                    admin
                  </span>
                )}
              </span>
              {isAdmin && !managedBy && uid !== myId && (
                <button
                  onClick={() => void remove(uid)}
                  className="rounded px-1.5 text-xs text-rascal-dim hover:text-red-300"
                >
                  remove
                </button>
              )}
            </div>
          ))}
        </div>
        {isAdmin && !managedBy && (
          <div className="mt-3 border-t border-rascal-line pt-3">
            {!adding ? (
              <button
                onClick={() => setAdding(true)}
                disabled={candidates.length === 0}
                className="w-full rounded-lg border border-dashed border-rascal-line px-3 py-1.5 text-sm text-rascal-dim hover:border-rascal-accent hover:text-white disabled:opacity-40"
              >
                {candidates.length === 0 ? 'All friends already here' : 'Add a friend'}
              </button>
            ) : (
              <div className="space-y-1">
                {candidates.map((f) => (
                  <div key={f.userId} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5">
                    <span className="flex-1 truncate text-sm">{f.displayName}</span>
                    <button
                      onClick={() => void add(f.userId)}
                      disabled={busy}
                      className="rounded-md bg-rascal-accent px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                ))}
                <button onClick={() => setAdding(false)} className="text-xs text-rascal-dim hover:text-white">
                  cancel
                </button>
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        {!managedBy && (
          <button
            onClick={() => void leave()}
            className="mt-4 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-red-300 hover:bg-white/10"
          >
            Leave group
          </button>
        )}
      </div>
    </div>
  )
}
