import { useState } from 'react'
import { getServerChat } from '../lib/session'
import { groupChatKey, unreadCount, useApp } from '../store/app'
import ServerSettingsModal from './ServerSettingsModal'

export default function ServerChannels({ serverId }: { serverId: string }) {
  const server = useApp((s) => s.servers[serverId])
  const identity = useApp((s) => s.identity)
  const selectedGroup = useApp((s) => s.selectedGroup)
  const selectGroup = useApp((s) => s.selectGroup)
  const messages = useApp((s) => s.messages)
  const lastRead = useApp((s) => s.lastRead)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (!server || !identity) return null
  const myRole = server.members[identity.userId]
  const canManage = myRole === 'owner' || myRole === 'admin'

  async function addChannel() {
    const clean = newName.trim()
    if (!clean) return
    setBusy(true)
    setError(null)
    try {
      const err = await getServerChat()?.addChannel(serverId, clean)
      if (err) setError(err)
      else {
        setNewName('')
        setAdding(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add channel.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-rascal-line p-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{server.name}</div>
            <div className="text-[11px] text-rascal-dim">
              {Object.keys(server.members).length} member{Object.keys(server.members).length === 1 ? '' : 's'} - {myRole}
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Server settings"
            className="rounded-md px-2 py-1 text-xs text-rascal-dim hover:bg-white/5 hover:text-white"
          >
            Settings
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 scroll-thin">
        <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-rascal-dim">
          Channels
        </div>
        {server.channels.map((c) => {
          const key = groupChatKey(c.id)
          const unread = unreadCount(messages[key], lastRead[key])
          const active = selectedGroup === c.id
          return (
            <div
              key={c.id}
              onClick={() => selectGroup(c.id)}
              title={c.topic || c.name}
              className={`mt-0.5 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 ${
                active ? 'bg-white/5' : ''
              }`}
            >
              <span className="text-rascal-dim">#</span>
              <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
              {unread > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rascal-accent px-1.5 text-[11px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          )
        })}
        {canManage &&
          (adding ? (
            <div className="mt-1.5 rounded-lg border border-rascal-line p-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addChannel()
                  if (e.key === 'Escape') setAdding(false)
                }}
                placeholder="channel-name"
                autoFocus
                className="w-full rounded-md border border-rascal-line bg-rascal-bg px-2 py-1 text-sm outline-none focus:border-rascal-accent"
              />
              {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() => void addChannel()}
                  disabled={busy || !newName.trim()}
                  className="flex-1 rounded-md bg-rascal-accent px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="flex-1 rounded-md bg-white/5 px-2 py-1 text-xs text-rascal-dim hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="mt-1.5 w-full rounded-lg border border-dashed border-rascal-line px-2 py-1.5 text-xs text-rascal-dim hover:border-rascal-accent hover:text-white"
            >
              + Add channel
            </button>
          ))}
      </div>
      {settingsOpen && (
        <ServerSettingsModal serverId={serverId} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}
