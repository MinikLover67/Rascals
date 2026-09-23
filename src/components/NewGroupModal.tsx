import { useState } from 'react'
import { getGroupChat } from '../lib/session'
import { useApp } from '../store/app'

export default function NewGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (groupId: string) => void
}) {
  const friends = useApp((s) => s.friends)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function create() {
    if (!name.trim() || picked.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const api = getGroupChat()
      if (!api) throw new Error('Chat not ready yet.')
      const id = await api.createGroup(name.trim(), picked)
      onCreated(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create group.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-rascal-line bg-rascal-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">New encrypted group</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-rascal-dim hover:text-white">
            Close
          </button>
        </div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Group name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. weekend crew"
          autoFocus
          className="mt-2 w-full rounded-lg border border-rascal-line bg-rascal-bg px-3 py-2 text-sm outline-none focus:border-rascal-accent"
        />
        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Invite friends ({picked.length} picked)
        </div>
        {friends.length === 0 && (
          <p className="mt-2 text-xs text-rascal-dim">Add friends first, then invite them here.</p>
        )}
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto scroll-thin">
          {friends.map((f) => (
            <label
              key={f.userId}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={picked.includes(f.userId)}
                onChange={() => toggle(f.userId)}
                className="accent-[#7c6cff]"
              />
              <span
                className={`h-2.5 w-2.5 rounded-full ${f.online ? 'bg-rascal-green' : 'bg-rascal-dim/40'}`}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{f.displayName}</span>
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        <button
          onClick={() => void create()}
          disabled={busy || !name.trim() || picked.length === 0}
          className="mt-4 w-full rounded-lg bg-rascal-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Creating...' : 'Create group'}
        </button>
        <p className="mt-2 text-[11px] text-rascal-dim">
          Invites go out over your encrypted DM with each friend. Offline friends get theirs when they return.
        </p>
      </div>
    </div>
  )
}
