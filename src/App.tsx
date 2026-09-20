import { useEffect, useRef, useState } from 'react'
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
    // Honor the auto-launch setting (desktop only; no-op in browsers).
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

  return (
    <div className="flex h-full flex-col bg-rascal-bg">
      <TitleBar />
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
