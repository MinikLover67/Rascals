import { useEffect, useMemo, useRef, useState } from 'react'
import AttachmentCard from './AttachmentCard'
import GifPicker from './GifPicker'
import GroupInfoModal from './GroupInfoModal'
import SettingsModal from './SettingsModal'
import VoiceButton from './VoiceButton'
import VoiceParticipants from './VoiceParticipants'
import YouTubeCard from './YouTubeCard'
import { QUICK_REACTIONS } from '../lib/emoji'
import { chatFor, isGroupChat } from '../lib/chatapi'
import { playSound } from '../lib/sound'
import { getVoice } from '../lib/session'
import { renderMarkdown } from '../lib/md'
import { extractYouTubeId } from '../lib/youtube'
import { markReadNow, useApp, EMPTY_MESSAGES, EMPTY_PINS, type ChatMessage } from '../store/app'
import { shortUid } from '../lib/format'

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDay(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function CheckSvg({ double }: { double?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
      {double && <polyline points="15 6 9 12" opacity="0.4" />}
    </svg>
  )
}

function Ticks({ m }: { m: ChatMessage }) {
  if (!m.mine) return null
  if (m.status === 'queued')
    return <span className="inline-block h-2 w-2 rounded-full border border-current opacity-60" title="queued - will send when they are online" />
  if (m.status === 'sent')
    return (
      <span className="text-rascal-dim" title="sent">
        <CheckSvg />
      </span>
    )
  return (
    <span className="text-rascal-green" title="delivered">
      <CheckSvg double />
    </span>
  )
}

function ReactionChips({
  chatKey,
  msgId,
  myId,
}: {
  chatKey: string
  msgId: string
  myId: string
}) {
  const entry = useApp((s) => s.reactions[chatKey]?.[msgId])
  const groups = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!entry) return map
    for (const [uid, emoji] of Object.entries(entry)) {
      if (!emoji) continue
      const arr = map.get(emoji) ?? []
      arr.push(uid)
      map.set(emoji, arr)
    }
    return map
  }, [entry])
  if (groups.size === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {[...groups.entries()].map(([emoji, uids]) => {
        const mine = uids.includes(myId)
        return (
          <button
            key={emoji}
            onClick={() => {
              void chatFor(chatKey).sendReaction(chatKey, msgId, emoji).catch(() => {})
            }}
            title={mine ? 'remove your reaction' : 'toggle your reaction'}
            className={`rounded-full border px-1.5 py-0.5 text-xs leading-5 ${
              mine ? 'border-rascal-accent bg-rascal-accent/25' : 'border-rascal-line bg-black/20'
            }`}
          >
            {emoji} {uids.length}
          </button>
        )
      })}
    </div>
  )
}

function Bubble({
  m,
  chatKey,
  myId,
  senderName,
  replyTarget,
  pinned,
  onReply,
  onEdit,
  onDelete,
}: {
  m: ChatMessage
  chatKey: string
  myId: string
  senderName: string | null
  replyTarget: ChatMessage | undefined
  pinned: boolean
  onReply: (m: ChatMessage) => void
  onEdit: (m: ChatMessage) => void
  onDelete: (m: ChatMessage) => void
}) {
  const [picking, setPicking] = useState(false)
  const ytId = m.deleted || m.file ? null : extractYouTubeId(m.body)

  if (m.sys) {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-white/5 px-3 py-1 text-[11px] italic text-rascal-dim">
          {m.body} - {fmtTime(m.ts)}
        </div>
      </div>
    )
  }
  if (m.deleted) {
    return (
      <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
        <div className="rounded-xl bg-white/[0.03] px-3 py-1.5 text-xs italic text-rascal-dim">
          message deleted
        </div>
      </div>
    )
  }
  return (
    <div id={`msg-${m.id}`} className={`group flex scroll-mt-4 ${m.mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 ${
          m.mine
            ? 'rounded-br-md bg-rascal-accent/90 text-white'
            : 'rounded-bl-md bg-white/[0.06]'
        }`}
      >
        {senderName && (
          <div className="mb-0.5 text-[11px] font-semibold text-rascal-accent">{senderName}</div>
        )}
        {pinned && (
          <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${m.mine ? 'text-white/70' : 'text-rascal-amber'}`}>
            Pinned
          </div>
        )}
        {replyTarget && !replyTarget.deleted && (
          <div
            className={`mb-1.5 truncate rounded-md border-l-2 px-2 py-1 text-xs opacity-80 ${
              m.mine ? 'border-white/50 bg-black/20' : 'border-rascal-accent bg-black/20'
            }`}
          >
            {(replyTarget.body || replyTarget.file?.name || 'attachment').slice(0, 120)}
          </div>
        )}
        {m.file && <AttachmentCard chatKey={chatKey} m={m} />}
        {m.body && (
          <div
            className="text-sm leading-relaxed break-words"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }}
          />
        )}
        {ytId && <YouTubeCard videoId={ytId} />}
        <ReactionChips chatKey={chatKey} msgId={m.id} myId={myId} />
        {picking && (
          <div className="mt-1.5 flex flex-wrap gap-1 rounded-lg bg-black/25 p-1.5">
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  setPicking(false)
                  void chatFor(chatKey).sendReaction(chatKey, m.id, e).catch(() => {})
                }}
                className="rounded-md px-1.5 py-0.5 text-lg hover:bg-white/10"
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div
          className={`mt-1 flex items-center gap-1.5 text-[10px] ${
            m.mine ? 'text-white/70' : 'text-rascal-dim'
          }`}
        >
          <span>{fmtTime(m.ts)}</span>
          {m.editedAt && <span>(edited)</span>}
          <Ticks m={m} />
          {!m.sys && (
          <span className="hidden gap-1.5 group-hover:flex">
            <button onClick={() => onReply(m)} className="underline underline-offset-2 hover:opacity-80">
              reply
            </button>
            <button onClick={() => setPicking((v) => !v)} className="underline underline-offset-2 hover:opacity-80">
              react
            </button>
            <button
              onClick={() => {
                void chatFor(chatKey).sendPin(chatKey, m.id, !pinned).catch(() => {})
              }}
              className="underline underline-offset-2 hover:opacity-80"
            >
              {pinned ? 'unpin' : 'pin'}
            </button>
            {m.mine && !m.file && !m.sys && (
              <button onClick={() => onEdit(m)} className="underline underline-offset-2 hover:opacity-80">
                edit
              </button>
            )}
            {m.mine && !m.sys && (
              <button onClick={() => onDelete(m)} className="underline underline-offset-2 hover:opacity-80">
                delete
              </button>
            )}
          </span>
          )}
        </div>
      </div>
    </div>
  )
}

function PinsStrip({ chatKey, byId }: { chatKey: string; byId: Map<string, ChatMessage> }) {
  const pins = useApp((s) => s.pins[chatKey] ?? EMPTY_PINS)
  const [open, setOpen] = useState(false)
  if (pins.length === 0) return null
  const alive = pins.filter((id) => {
    const m = byId.get(id)
    return m && !m.deleted
  })

  function jump(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="border-b border-rascal-line bg-rascal-panel/60 px-4 py-1.5">
      <button onClick={() => setOpen((v) => !v)} className="text-xs text-rascal-amber hover:text-white">
        Pinned messages ({alive.length}) {open ? '-' : '+'}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 pb-1">
          {alive.map((id) => {
            const m = byId.get(id)
            if (!m) return null
            return (
              <div key={id} className="flex items-center gap-2 text-xs">
                <button onClick={() => jump(id)} className="flex-1 truncate text-left text-rascal-text hover:underline">
                  {(m.body || m.file?.name || 'attachment').slice(0, 100)}
                </button>
                <button
                  onClick={() => {
                    void chatFor(chatKey).sendPin(chatKey, id, false).catch(() => {})
                  }}
                  className="text-rascal-dim hover:text-white"
                >
                  unpin
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ManagedGroupInfo({
  groupId,
  myId,
  onClose,
}: {
  groupId: string
  myId: string
  onClose: () => void
}) {
  const group = useApp((s) => s.groups[groupId])
  const serverName = useApp((s) =>
    group?.serverId ? (s.servers[group.serverId]?.name ?? 'server') : undefined,
  )
  return <GroupInfoModal groupId={groupId} myId={myId} managedBy={serverName} onClose={onClose} />
}

function VoiceHeaderButton({ chatKey, isGroup, title }: { chatKey: string; isGroup: boolean; title: string }) {
  const voice = useApp((s) => s.voice)
  const [err, setErr] = useState<string | null>(null)

  if (!isGroup) {
    const inCallWith = voice.call && voice.call.peerId === chatKey
    return (
      <>
        {err && <span className="max-w-40 truncate text-[11px] text-red-300" title={err}>{err}</span>}
        <button
          onClick={() => {
            setErr(null)
            if (inCallWith) return
            void getVoice()?.startCall(chatKey).then((e) => {
              if (e) setErr(e)
            })
          }}
          disabled={!!inCallWith}
          data-testid="call-button"
          className="rounded-md px-2 py-1 text-xs text-rascal-dim hover:bg-white/5 hover:text-white disabled:opacity-50"
          title={inCallWith ? 'In call (controls below)' : 'Start a voice call'}
        >
          {inCallWith ? 'In call...' : 'Call'}
        </button>
      </>
    )
  }

  const joined = voice.channel?.chatKey === chatKey
  return (
    <>
      {err && <span className="max-w-40 truncate text-[11px] text-red-300" title={err}>{err}</span>}
      <button
        onClick={() => {
          setErr(null)
          if (joined) void getVoice()?.leaveChannel().catch(() => {})
          else {
            void getVoice()?.joinChannel(chatKey, title).then((e) => {
              if (e) setErr(e)
            })
          }
        }}
        className={`rounded-md px-2 py-1 text-xs hover:bg-white/5 hover:text-white ${joined ? 'text-rascal-green' : 'text-rascal-dim'}`}
        title={joined ? 'Leave voice channel' : 'Join voice channel'}
      >
        {joined ? 'Voice: on' : 'Voice'}
      </button>
    </>
  )
}

function VoiceStrip({ chatKey }: { chatKey: string }) {
  const voice = useApp((s) => s.voice)
  const active =
    (voice.channel && voice.channel.chatKey === chatKey) ||
    (voice.call && voice.call.peerId === chatKey)
  if (!active) return null
  return <VoiceParticipants />
}

function ChatPanelInner({ chatKey }: { chatKey: string }) {
  const identity = useApp((s) => s.identity)
  const friends = useApp((s) => s.friends)
  const group = useApp((s) =>
    isGroupChat(chatKey) ? s.groups[chatKey.slice(2)] : undefined,
  )
  const groupOnline = useApp((s) =>
    isGroupChat(chatKey) ? (s.groupOnline[chatKey.slice(2)] === true) : false,
  )
  const friend = useApp((s) => (isGroupChat(chatKey) ? undefined : s.friends.find((f) => f.userId === chatKey)))
  const messages = useApp((s) => s.messages[chatKey] ?? EMPTY_MESSAGES)
  const pins = useApp((s) => s.pins[chatKey] ?? EMPTY_PINS)
  const typingTs = useApp((s) => s.typing[chatKey] ?? 0)
  const typingName = useApp((s) => s.typingName[chatKey] ?? '')
  const draft = useApp((s) => s.drafts[chatKey] ?? '')
  const setDraft = useApp((s) => s.setDraft)
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])
  const pinnedSet = useMemo(() => new Set(pins), [pins])
  const nameOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of friends) map.set(f.userId, f.displayName)
    return (uid: string): string => {
      if (uid === identity?.userId) return 'You'
      return map.get(uid) ?? shortUid(uid)
    }
  }, [friends, identity])

  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [fileErr, setFileErr] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const typingTimer = useRef<number | null>(null)
  const typingOn = useRef(false)
  const api = useMemo(() => chatFor(chatKey), [chatKey])
  const q = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      q
        ? messages.filter(
            (m) =>
              !m.deleted &&
              (m.body.toLowerCase().includes(q) || (m.file?.name ?? '').toLowerCase().includes(q)),
          )
        : messages,
    [q, messages],
  )
  // Day dividers precomputed without mutating render-local state.
  const dated = useMemo(() => {
    const days = visible.map((m) => fmtDay(m.ts))
    return visible.map((m, i) => ({ m, day: days[i], showDay: i === 0 || days[i] !== days[i - 1] }))
  }, [visible])

  // Mark read whenever the open chat changes (store sync on navigation).
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    markReadNow(chatKey)
  }, [chatKey, messages.length])

  // Reset per-chat UI state when switching chats: handled by remount (see below).

  // Auto-scroll to bottom on new messages (if already near bottom).
  const stick = useRef(true)
  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length])

  useEffect(
    () => () => {
      if (typingOn.current) {
        typingOn.current = false
        void api.sendTyping(chatKey, false).catch(() => {})
      }
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
    },
    [chatKey, api],
  )

  if (!identity) return null
  if (!friend && !group) return null
  const myId = identity.userId
  const myName = identity.name

  const isGroup = group !== undefined
  const title = isGroup ? group.name : (friend?.displayName ?? '')
  const online = isGroup ? groupOnline : (friend?.online ?? false)
  const statusText = isGroup
    ? `${group.members.length} member${group.members.length === 1 ? '' : 's'} - end-to-end encrypted`
    : online
      ? 'online - end-to-end encrypted'
      : 'offline - messages queue + sync later'
  // Freshness check against the last typing ping (re-evaluated on renders).
  // eslint-disable-next-line react/purity
  const typing = Date.now() - typingTs < 4000
  const typingLabel = isGroup ? (typingName || 'Someone') : (friend?.displayName ?? '')
  const placeholder = `Message ${title}${online ? '' : ' (offline - will queue)'}`

  async function send() {
    const text = draft.trim()
    if (!text) return
    setDraft(chatKey, '')
    setReplyTo(null)
    typingOn.current = false
    playSound('send')
    await api.sendTyping(chatKey, false).catch(() => {})
    await api.sendText(chatKey, text, replyTo).catch(() => {})
  }

  function onInput(v: string) {
    setDraft(chatKey, v)
    if (!typingOn.current && v.trim()) {
      typingOn.current = true
      void api.sendTyping(chatKey, true, myName).catch(() => {})
    }
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => {
      typingOn.current = false
      void api.sendTyping(chatKey, false).catch(() => {})
    }, 2500)
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setFileErr(null)
    for (const f of Array.from(files)) {
      const err = await api.sendFile(chatKey, f, f.name, {})
      if (err) {
        setFileErr(`${f.name}: ${err}`)
        break
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function saveEdit() {
    if (!editing) return
    await api.sendEdit(chatKey, editing, editText).catch(() => {})
    setEditing(null)
    setEditText('')
  }

  const replyMsg = replyTo ? byId.get(replyTo) : undefined

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-rascal-line px-4 py-2.5">
        <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-rascal-green' : 'bg-rascal-dim/40'}`} />
        <span className="text-sm font-semibold">{title}</span>
        <span className="hidden text-xs text-rascal-dim lg:inline">{statusText}</span>
        <div className="flex-1" />
        <VoiceHeaderButton chatKey={chatKey} isGroup={isGroup} title={title} />
        {isGroup && (
          <button
            onClick={() => setInfoOpen(true)}
            className="rounded-md px-2 py-1 text-xs text-rascal-dim hover:bg-white/5 hover:text-white"
            title="Group members"
          >
            Members
          </button>
        )}
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className="rounded-md px-2 py-1 text-xs text-rascal-dim hover:bg-white/5 hover:text-white"
          title="Search this chat"
        >
          Search
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-md px-2 py-1 text-xs text-rascal-dim hover:bg-white/5 hover:text-white"
          title="Settings"
        >
          Settings
        </button>
      </div>
      <PinsStrip chatKey={chatKey} byId={byId} />
      <VoiceStrip chatKey={chatKey} />
      {searchOpen && (
        <div className="border-b border-rascal-line px-4 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages and files..."
            autoFocus
            className="w-full rounded-lg border border-rascal-line bg-rascal-panel px-3 py-1.5 text-sm outline-none focus:border-rascal-accent"
          />
          {q && (
            <div className="mt-1 text-[11px] text-rascal-dim">
              {visible.length} match{visible.length === 1 ? '' : 'es'}
            </div>
          )}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        }}
        className="flex-1 space-y-2 overflow-y-auto p-4 scroll-thin"
      >
        {visible.length === 0 && (
          <div className="mt-10 text-center text-sm text-rascal-dim">
            {q ? 'No messages match.' : `Say hi - everything here is encrypted end to end.`}
          </div>
        )}
        {dated.map(({ m, day, showDay }) => {
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex items-center gap-2 text-[11px] text-rascal-dim">
                  <div className="h-px flex-1 bg-rascal-line" />
                  {day}
                  <div className="h-px flex-1 bg-rascal-line" />
                </div>
              )}
              <Bubble
                m={m}
                chatKey={chatKey}
                myId={myId}
                senderName={isGroup && !m.mine ? nameOf(m.sender ?? '') : null}
                replyTarget={m.replyTo ? byId.get(m.replyTo) : undefined}
                pinned={pinnedSet.has(m.id)}
                onReply={(x) => setReplyTo(x.id)}
                onEdit={(x) => {
                  setEditing(x.id)
                  setEditText(x.body)
                }}
                onDelete={(x) => {
                  if (window.confirm('Delete this message for everyone?'))
                    void api.sendDelete(chatKey, x.id).catch(() => {})
                }}
              />
            </div>
          )
        })}
        {typing && (
          <div className="text-xs italic text-rascal-dim">
            {typingLabel} is typing...
          </div>
        )}
      </div>

      {replyMsg && !replyMsg.deleted && (
        <div className="flex items-center gap-2 border-t border-rascal-line bg-rascal-panel px-4 py-1.5 text-xs">
          <span className="text-rascal-dim">Replying to:</span>
          <span className="flex-1 truncate text-rascal-text">
            {(replyMsg.body || replyMsg.file?.name || 'attachment').slice(0, 100)}
          </span>
          <button onClick={() => setReplyTo(null)} className="rounded px-1.5 text-rascal-dim hover:text-white">
            x
          </button>
        </div>
      )}
      {editing && (
        <div className="border-t border-rascal-line bg-rascal-panel px-4 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rascal-amber">
            Editing message
          </div>
          <div className="mt-1 flex gap-2">
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveEdit()
                if (e.key === 'Escape') setEditing(null)
              }}
              autoFocus
              className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 text-sm outline-none focus:border-rascal-accent"
            />
            <button onClick={() => void saveEdit()} className="rounded-lg bg-rascal-accent px-3 py-1.5 text-sm font-semibold text-white">
              Save
            </button>
            <button onClick={() => setEditing(null)} className="rounded-lg bg-white/5 px-3 py-1.5 text-sm text-rascal-dim hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-rascal-line p-3">
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" multiple data-testid="file-input" className="hidden" onChange={(e) => void onFiles(e.target.files)} />
          <button
            onClick={() => fileRef.current?.click()}
            title="Attach files or images (E2EE, up to 25 MB)"
            className="shrink-0 rounded-xl border border-rascal-line bg-rascal-panel px-3 py-2 text-sm text-rascal-dim hover:text-white"
          >
            Attach
          </button>
          <VoiceButton chatKey={chatKey} />
          <button
            onClick={() => setGifOpen(true)}
            title="Send a GIF via Tenor (needs API key in Settings)"
            className="shrink-0 rounded-xl border border-rascal-line bg-rascal-panel px-3 py-2 text-sm text-rascal-dim hover:text-white"
          >
            GIF
          </button>
          <textarea
            value={draft}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="max-h-32 flex-1 resize-none rounded-xl border border-rascal-line bg-rascal-panel px-3 py-2 text-sm outline-none focus:border-rascal-accent"
          />
          <button
            onClick={() => void send()}
            disabled={!draft.trim()}
            className="shrink-0 rounded-xl bg-rascal-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
        {fileErr && <div className="mt-1 px-1 text-[11px] text-red-300">{fileErr}</div>}
        <div className="mt-1 px-1 text-[10px] text-rascal-dim">
          Enter to send - Shift+Enter for newline - **bold** *italic* `code` - YouTube links embed on click
        </div>
      </div>
      {gifOpen && <GifPicker chatKey={chatKey} onClose={() => setGifOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {infoOpen && isGroup && (
        <ManagedGroupInfo groupId={chatKey.slice(2)} myId={myId} onClose={() => setInfoOpen(false)} />
      )}
    </div>
  )
}

// Remount per chat so all per-chat useState starts fresh on switch — no
// reset effect needed (and none of the cascading renders that come with one).
export default function ChatPanel({ chatKey }: { chatKey: string }) {
  return <ChatPanelInner key={chatKey} chatKey={chatKey} />
}
