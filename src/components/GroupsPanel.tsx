import { useState } from 'react'
import { groupChatKey, unreadCount, useApp } from '../store/app'
import NewGroupModal from './NewGroupModal'

export default function GroupsPanel() {
  const groups = useApp((s) => s.groups)
  const groupOnline = useApp((s) => s.groupOnline)
  const selectedGroup = useApp((s) => s.selectedGroup)
  const selectGroup = useApp((s) => s.selectGroup)
  const messages = useApp((s) => s.messages)
  const lastRead = useApp((s) => s.lastRead)
  const [creating, setCreating] = useState(false)

  const list = Object.values(groups).sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="shrink-0 border-b border-rascal-line p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Groups
        </div>
        <button
          onClick={() => setCreating(true)}
          title="Start an encrypted group"
          className="rounded-md border border-dashed border-rascal-line px-2 py-0.5 text-xs text-rascal-dim hover:border-rascal-accent hover:text-white"
        >
          + New
        </button>
      </div>
      {list.length === 0 && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-rascal-dim">
          Group chats are end-to-end encrypted with per-sender keys. Invite friends to start one.
        </p>
      )}
      <div className="mt-1 max-h-44 overflow-y-auto scroll-thin">
        {list.map((g) => {
          const key = groupChatKey(g.id)
          const unread = unreadCount(messages[key], lastRead[key])
          const online = groupOnline[g.id] === true
          return (
            <div
              key={g.id}
              onClick={() => selectGroup(g.id)}
              className={`mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 ${
                selectedGroup === g.id ? 'bg-white/5' : ''
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  online ? 'bg-rascal-accent' : 'bg-white/10 text-rascal-dim'
                }`}
              >
                {g.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{g.name}</div>
                <div className="truncate text-[10px] text-rascal-dim">
                  {g.members.length} member{g.members.length === 1 ? '' : 's'}
                  {online ? ' - someone online' : ''}
                </div>
              </div>
              {unread > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rascal-accent px-1.5 text-[11px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {creating && (
        <NewGroupModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            selectGroup(id)
          }}
        />
      )}
    </div>
  )
}
