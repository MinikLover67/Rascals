import { useState } from 'react'
import { getServerChat } from '../lib/session'
import { useApp } from '../store/app'

export default function CreateServerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (serverId: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectServer = useApp((s) => s.selectServer)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const api = getServerChat()
      if (!api) throw new Error('Chat not ready yet.')
      const id = await api.createServer(name.trim())
      selectServer(id)
      onCreated(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create server.')
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
          <h2 className="text-base font-bold">New server</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-rascal-dim hover:text-rascal-text">
            Close
          </button>
        </div>
        <p className="mt-2 text-xs text-rascal-dim">
          Servers group text channels under one roof with roles. Starts with a #general channel — invite friends from settings.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
          placeholder="e.g. night owls"
          autoFocus
          className="mt-3 w-full rounded-lg border border-rascal-line bg-rascal-bg px-3 py-2 text-sm outline-none focus:border-rascal-accent"
        />
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <button
          onClick={() => void create()}
          disabled={busy || !name.trim()}
          className="mt-3 w-full rounded-lg bg-rascal-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create server'}
        </button>
      </div>
    </div>
  )
}
