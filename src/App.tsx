import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Plus, Upload } from 'lucide-react'
import ChatPanel from './components/ChatPanel'
import CreateServerModal from './components/CreateServerModal'
import FriendsPanel from './components/FriendsPanel'
import GroupsPanel from './components/GroupsPanel'
import IncomingCallModal from './components/IncomingCallModal'
import ServerChannels from './components/ServerChannels'
import TitleBar from './components/TitleBar'
import Toasts from './components/Toasts'
import UpdateBanner from './components/UpdateBanner'
import VoiceBar from './components/VoiceBar'
import { ensureIdentity, importIdentity, type Identity } from './lib/identity'
import { emitDropFiles } from './lib/dropfiles'
import { getVoice, startSession, stopSession } from './lib/session'
import { checkForUpdates } from './lib/updater'
import { groupChatKey, useApp } from './store/app'

function Onboarding({ onDone }: { onDone: (id: Identity) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      const id = await importIdentity(await files[0].text())
      if (id) onDone(id)
      else setError('That file is not a valid Rascals identity backup.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-rascal-line bg-rascal-panel p-8">
        <h1 className="text-2xl font-bold">Welcome to Rascals</h1>
        <p className="mt-2 text-sm text-rascal-dim">
          Private peer-to-peer chat. No accounts, no message server — your
          identity is a keypair stored only on this PC.
        </p>
        <p className="mt-2 rounded-lg bg-rascal-amber/10 px-3 py-1.5 text-xs text-rascal-amber">
          Beta: still testing, bugs to fix. Report issues on GitHub.
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
            className="text-xs text-rascal-dim underline underline-offset-2 hover:text-rascal-text disabled:opacity-40"
          >
            or restore from a backup file
          </button>
        </div>
      </div>
    </div>
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
        <p className="mx-auto mt-2 max-w-md">
          Share your invite code with someone else running Rascals — different
          network is fine. When you're both online you'll see each other light
          up green — no servers involved.
        </p>
        {friends.length === 0 && <CopyInviteCta />}
      </div>
    </div>
  )
}

function CopyInviteCta() {
  const identity = useApp((s) => s.identity)
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!identity) return
    const { userId, name } = identity
    try {
      const { encodeInvite } = await import('./lib/invite')
      await navigator.clipboard.writeText(encodeInvite(userId, name))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — code lives in the Friends panel instead
    }
  }
  if (!identity) return null
  return (
    <button
      onClick={() => void copy()}
      className="mx-auto mt-4 block rounded-xl bg-rascal-accent px-4 py-2 text-sm font-semibold text-white"
    >
      {copied ? 'Copied — send it to a friend!' : 'Copy my invite code'}
    </button>
  )
}

function Rail() {
  const servers = useApp((s) => s.servers)
  const selectedServer = useApp((s) => s.selectedServer)
  const selectServer = useApp((s) => s.selectServer)
  const [creating, setCreating] = useState(false)
  const list = Object.values(servers).sort((a, b) => a.createdAt - b.createdAt)

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-rascal-line bg-rascal-rail py-3 scroll-thin">
      <button
        onClick={() => selectServer(null)}
        title="Home - friends and groups"
        className={`flex h-11 w-11 items-center justify-center text-lg font-bold ${
          selectedServer === null ? 'rounded-2xl bg-rascal-accent' : 'rounded-full bg-white/10 text-rascal-dim hover:rounded-2xl hover:text-rascal-text'
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
              : 'rounded-full bg-white/10 text-rascal-dim hover:rounded-2xl hover:text-rascal-text'
          } transition-all`}
        >
          {s.name.slice(0, 2).toUpperCase()}
        </button>
      ))}
      <button
        onClick={() => setCreating(true)}
        title="Create a server"
        aria-label="Create a server"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-rascal-line text-rascal-dim transition-[border-radius,color] hover:text-rascal-text"
      >
        <Plus size={18} />
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
      .then((id) => {
        if (!cancelled && id) setIdentity(id)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [setIdentity])

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
    // Ask the OS for notification permission at boot, not at first message
    // (lazy asking can fail silently outside a user gesture — no toasts ever).
    void (async () => {
      try {
        const { ensureNotifyPermission } = await import('./lib/notify')
        await ensureNotifyPermission()
      } catch {
        // notifications stay best-effort
      }
    })()
  }, [])

  useEffect(() => {
    // Honor the auto-launch setting.
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
          <span className="flex items-center gap-1.5 rounded-xl bg-rascal-panel px-4 py-2 text-sm font-semibold">
            <Upload size={18} className="text-rascal-accent" />
            {dropChatKey() ? 'Drop files to attach — Enter sends them' : 'Open a chat first to send files'}
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
          <Toasts />
        </>
      ) : (
        <Onboarding onDone={setIdentity} />
      )}
    </div>
  )
}
