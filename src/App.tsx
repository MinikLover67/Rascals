import { useEffect, useRef, useState, type DragEvent } from 'react'
import ChatPanel from './components/ChatPanel'
import CreateServerModal from './components/CreateServerModal'
import FriendsPanel from './components/FriendsPanel'
import GroupsPanel from './components/GroupsPanel'
import IncomingCallModal from './components/IncomingCallModal'
import ServerChannels from './components/ServerChannels'
import TitleBar from './components/TitleBar'
import UpdateBanner from './components/UpdateBanner'
import VoiceBar from './components/VoiceBar'
import { ensureIdentity, importIdentity, type Identity } from './lib/identity'
import { isWeb } from './lib/platform'
import { applyWeblinkSnapshot, describeSnapshot, fetchWeblinkIdentity, publishWeblink, replaceWithDesktopAccount } from './lib/weblink'
import { emitDropFiles } from './lib/dropfiles'
import { getVoice, startSession, stopSession } from './lib/session'
import { checkForUpdates } from './lib/updater'
import { groupChatKey, useApp } from './store/app'

function Onboarding({ onDone }: { onDone: (id: Identity) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const id = await ensureIdentity(name.trim())
      if (id) onDone(id)
      else setError('Could not create identity. Please try again.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function restore(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await restoreText(await files[0].text())
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Shared by file restore and pasted-text restore (the web-app account link).
  async function restoreText(text: string) {
    const id = await importIdentity(text).catch(() => null)
    if (id) onDone(id)
    else setError('That is not a valid Rascals identity backup.')
  }

  // One-click account link: the desktop app copies the backup to the
  // clipboard, the browser reads it back (permission prompt) — no typing.
  async function restoreFromClipboard(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setShowPaste(true)
        setError('Clipboard is empty — copy the backup in the desktop app first.')
        return
      }
      await restoreText(text.trim())
      // restoreText only sets an error on failure; reveal manual box then.
      setShowPaste(true)
    } catch {
      setShowPaste(true)
      setError('Browser blocked clipboard access — allow it or paste manually below.')
    } finally {
      setBusy(false)
    }
  }

  // Desktop "open web app" links here: auto-expand + try the clipboard once.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#link') {
      window.location.hash = ''
      setShowPaste(true)
      void restoreFromClipboard()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-rascal-line bg-rascal-panel p-8">
        <h1 className="text-2xl font-bold">Welcome to Rascals</h1>
        <p className="mt-2 text-sm text-rascal-dim">
          Private peer-to-peer chat. No accounts, no message server — your
          identity is a keypair stored only on this PC.
        </p>
        <label className="mt-6 block text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Display name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="e.g. minik"
          data-testid="onboard-name"
          className="mt-2 w-full rounded-lg border border-rascal-line bg-rascal-bg px-3 py-2 text-sm outline-none focus:border-rascal-accent"
        />
        {error && <p className="mt-3 text-sm text-rascal-red">{error}</p>}
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          data-testid="onboard-create"
          className="mt-4 w-full rounded-lg bg-rascal-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Creating identity…' : 'Create my identity'}
        </button>
        <div className="mt-3 text-center">
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void restore(e.target.files)} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="text-xs text-rascal-dim underline underline-offset-2 hover:text-white disabled:opacity-40"
          >
            or restore from a backup file
          </button>
          <span className="mx-2 text-xs text-rascal-dim">·</span>
          <button
            onClick={() => setShowPaste((v) => !v)}
            disabled={busy}
            className="text-xs text-rascal-dim underline underline-offset-2 hover:text-white disabled:opacity-40"
          >
            use my desktop account
          </button>
        </div>
        {showPaste && (
          <div className="mt-3 rounded-lg border border-rascal-line bg-rascal-bg p-3">
            <p className="text-[11px] text-rascal-dim">
              Already have Rascals on this PC? In the desktop app open Settings →
              Profile → Back up identity → copy, then one click here. Same account,
              same friends — the web app just borrows it.
            </p>
            <button
              onClick={() => void restoreFromClipboard()}
              disabled={busy}
              data-testid="onboard-clipboard"
              className="mt-2 w-full rounded-lg bg-rascal-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Reading clipboard…' : 'Read backup from clipboard'}
            </button>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder='Paste the {"app":"rascals-identity",…} backup text'
              rows={3}
              data-testid="onboard-paste"
              className="mt-2 w-full rounded-lg border border-rascal-line bg-rascal-panel p-2 font-mono text-[10px] outline-none focus:border-rascal-accent"
            />
            <button
              onClick={() => {
                setBusy(true)
                setError(null)
                void restoreText(pasted.trim()).finally(() => setBusy(false))
              }}
              disabled={busy || !pasted.trim()}
              data-testid="onboard-use-pasted"
              className="mt-2 w-full rounded-lg bg-rascal-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Checking…' : 'Use this account'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Web only, empty account: the desktop snapshot has friends this browser
// doesn't — offer a one-click pull instead of a bare "add a friend".
function EmptyAccountCTA() {
  const [info, setInfo] = useState<{ friends: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void describeSnapshot()
      .then((d) => {
        if (live && d && !d.sameIdentity && d.friends > 0) setInfo({ friends: d.friends })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!info) return null
  return (
    <button
      onClick={() => {
        setBusy(true)
        void replaceWithDesktopAccount()
      }}
      disabled={busy}
      data-testid="pull-desktop-account"
      className="mx-auto mt-4 block max-w-md rounded-xl border border-rascal-accent/50 bg-rascal-accent/10 px-4 py-2.5 text-sm font-semibold hover:bg-rascal-accent/20 disabled:opacity-50"
    >
      {busy
        ? 'Bringing in your account…'
        : `Your desktop has ${info.friends} friend${info.friends === 1 ? '' : 's'} — bring them here`}
    </button>
  )
}

function MainPanel() {
  const friends = useApp((s) => s.friends)
  const groups = useApp((s) => s.groups)
  const servers = useApp((s) => s.servers)
  const selectedFriend = useApp((s) => s.selectedFriend)
  const selectedGroup = useApp((s) => s.selectedGroup)
  const selectedServer = useApp((s) => s.selectedServer)
  const friend = friends.find((f) => f.userId === selectedFriend)
  const group = selectedGroup ? groups[selectedGroup] : undefined
  const server = selectedServer ? servers[selectedServer] : undefined

  if (group) {
    return <ChatPanel chatKey={groupChatKey(selectedGroup as string)} />
  }

  if (friend) {
    return <ChatPanel chatKey={friend.userId} />
  }

  if (server) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-rascal-dim">
        <div>
          <p className="text-base font-semibold text-rascal-text">{server.name}</p>
          <p className="mx-auto mt-2 max-w-md">
            {server.channels.length === 0
              ? 'No channels yet - add one from the channel list.'
              : 'Pick a channel on the left to start talking.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-rascal-dim">
      <div>
        <p className="text-base font-semibold text-rascal-text">
          {friends.length === 0
            ? 'Add a friend to get started.'
            : 'Pick a friend, group, or server to open the conversation.'}
        </p>
        {friends.length === 0 && isWeb() && <EmptyAccountCTA />}
        <p className="mx-auto mt-2 max-w-md">
          Share your invite code with someone else running Rascals. When
          you're both online you'll see each other light up green — no
          servers involved.
        </p>
      </div>
    </div>
  )
}

function Rail() {
  const servers = useApp((s) => s.servers)
  const selectedServer = useApp((s) => s.selectedServer)
  const selectServer = useApp((s) => s.selectServer)
  const [creating, setCreating] = useState(false)
  const list = Object.values(servers).sort((a, b) => a.createdAt - b.createdAt)

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rascal-rail py-3 scroll-thin">
      <button
        onClick={() => selectServer(null)}
        title="Home - friends and groups"
        className={`flex h-11 w-11 items-center justify-center text-lg font-bold ${
          selectedServer === null ? 'rounded-2xl bg-rascal-accent' : 'rounded-full bg-white/10 text-rascal-dim hover:rounded-2xl hover:text-white'
        } transition-all`}
      >
        R
      </button>
      <div className="h-px w-8 bg-rascal-line" />
      {list.map((s) => (
        <button
          key={s.id}
          onClick={() => selectServer(s.id)}
          title={s.name}
          className={`flex h-11 w-11 items-center justify-center text-sm font-bold ${
            selectedServer === s.id
              ? 'rounded-2xl bg-rascal-accent'
              : 'rounded-full bg-white/10 text-rascal-dim hover:rounded-2xl hover:text-white'
          } transition-all`}
        >
          {s.name.slice(0, 2).toUpperCase()}
        </button>
      ))}
      <button
        onClick={() => setCreating(true)}
        title="Create a server"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-rascal-line text-xl text-rascal-dim hover:text-white"
      >
        +
      </button>
      {creating && (
        <CreateServerModal
          onClose={() => setCreating(false)}
          onCreated={() => setCreating(false)}
        />
      )}
    </div>
  )
}

function Sidebar() {
  const selectedServer = useApp((s) => s.selectedServer)
  if (selectedServer) {
    return (
      <div className="flex w-64 shrink-0 flex-col border-r border-rascal-line bg-rascal-panel">
        <ServerChannels serverId={selectedServer} />
      </div>
    )
  }
  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-rascal-line bg-rascal-panel">
      <GroupsPanel />
      <FriendsPanel />
    </div>
  )
}

export default function App() {
  const identity = useApp((s) => s.identity)
  const setIdentity = useApp((s) => s.setIdentity)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ensureIdentity()
      .then(async (id) => {
        if (cancelled) return
        if (id) {
          setIdentity(id)
          return
        }
        // Web with no identity of its own: apply the desktop-published
        // snapshot (identity, friends, groups, history, settings), then
        // reload so the store boots with the transferred account. Zero clicks
        // when the desktop app ran on this PC. The browser's own account,
        // once set, always wins — this path only runs when it has none.
        if (isWeb()) {
          const applied = await applyWeblinkSnapshot().catch(() => false)
          if (!cancelled && applied) {
            window.location.reload()
            return
          }
          const linked = await fetchWeblinkIdentity().catch(() => null)
          if (!cancelled && linked) setIdentity(linked)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [setIdentity])

  // Desktop: always publish the login for web auto-login (silent, idempotent).
  // No toggle, no UI — browsers on this PC just open already signed in.
  // Re-publishes when account membership changes so new friends/groups
  // transfer too (a plain string signal — presence flips don't rewrite).
  // Live messages arrive over P2P once the web session is running anyway.
  const pubSig = useApp((s) =>
    [
      ...s.friends.map((f) => f.userId),
      ...Object.keys(s.groups),
      ...Object.keys(s.servers),
      ...s.requests.map((r) => r.userId),
    ].join(','),
  )
  useEffect(() => {
    if (!identity || isWeb()) return
    void publishWeblink().catch(() => {
      // disk hiccup — next change or boot retries
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, pubSig])

  // Start / stop the P2P session with the identity's lifetime.
  useEffect(() => {
    if (!identity) return
    let cancelled = false
    startSession(identity).catch(() => {
      if (!cancelled) {
        // Signaling hiccup — session stays down; user can reload.
      }
    })
    return () => {
      cancelled = true
      stopSession()
    }
  }, [identity])

  // Theme + global hotkeys + autostart, all desktop-local.
  const theme = useApp((s) => s.settings.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
  }, [theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+M: toggle mute while in voice.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
        const v = useApp.getState().voice
        if (v.call || v.channel) {
          e.preventDefault()
          getVoice()?.setMuted(!v.muted)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    // Honor the auto-launch setting (desktop only; no-op in browsers).
    if (isWeb()) return
    const apply = useApp.getState().settings.autostart
    void import('@tauri-apps/plugin-autostart')
      .then(async ({ enable, disable, isEnabled }) => {
        try {
          if (apply && !(await isEnabled())) await enable()
          else if (!apply && (await isEnabled())) await disable()
        } catch {
          // plugin unavailable — ignore
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Silent update check at most once a day — the banner appears if needed.
    // Web builds have no bundled updater (see updater.ts).
    if (isWeb()) return
    void checkForUpdates(false)
  }, [])

  // Whole-window file drop: anywhere on screen sends to the open chat.
  // The active key mirrors MainPanel exactly, so drops land where you look.
  const dropFriends = useApp((s) => s.friends)
  const dropGroups = useApp((s) => s.groups)
  const dropSelFriend = useApp((s) => s.selectedFriend)
  const dropSelGroup = useApp((s) => s.selectedGroup)
  const [dragging, setDragging] = useState(false)
  const [dropHint, setDropHint] = useState(false)
  const dragDepth = useRef(0)
  const hintTimer = useRef(0)

  function dropChatKey(): string | null {
    if (dropSelGroup && dropGroups[dropSelGroup]) return groupChatKey(dropSelGroup)
    if (dropFriends.some((f) => f.userId === dropSelFriend)) return dropSelFriend
    return null
  }

  function dropHasFiles(e: DragEvent): boolean {
    try {
      return Array.from(e.dataTransfer.types).includes('Files')
    } catch {
      return false
    }
  }

  function onDragEnter(e: DragEvent) {
    if (!identity || !dropHasFiles(e)) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragOver(e: DragEvent) {
    if (!identity || (!dropHasFiles(e) && !dragging)) return
    // Must cancel the default or the browser navigates to the file instead.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(e: DragEvent) {
    if (!identity || (!dropHasFiles(e) && !dragging)) return
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function onDrop(e: DragEvent) {
    if (!identity) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    if (dropChatKey()) {
      emitDropFiles(Array.from(files))
    } else {
      // Nowhere to send — say so briefly instead of swallowing the drop.
      setDropHint(true)
      window.clearTimeout(hintTimer.current)
      hintTimer.current = window.setTimeout(() => setDropHint(false), 2500)
    }
  }

  return (
    <div
      className="relative flex h-full flex-col bg-rascal-bg"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <TitleBar />
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-rascal-accent bg-rascal-accent/10"
          data-testid="drop-overlay"
        >
          <span className="rounded-xl bg-rascal-panel px-4 py-2 text-sm font-semibold">
            {dropChatKey() ? 'Drop files to send — encrypted end to end' : 'Open a chat first to send files'}
          </span>
        </div>
      )}
      {dropHint && (
        <div className="absolute bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-rascal-panel px-4 py-2 text-sm font-semibold shadow-xl">
          Open a chat first — then drop files anywhere to send them
        </div>
      )}
      {!ready ? (
        <div className="flex flex-1 items-center justify-center text-sm text-rascal-dim">
          Loading Rascals…
        </div>
      ) : identity ? (
        <>
          <UpdateBanner />
          <div className="flex min-h-0 flex-1">
            <Rail />
            <Sidebar />
            <MainPanel />
          </div>
          <VoiceBar />
          <IncomingCallModal />
        </>
      ) : (
        <Onboarding onDone={setIdentity} />
      )}
    </div>
  )
}
