import { useEffect, useRef, useState, type DragEvent } from 'react'
import { MessageCircle, Plus, Settings2, Upload, UserRound } from 'lucide-react'
import Avatar from './components/Avatar'
import AppBackground from './components/AppBackground'
import ChangelogModal from './components/ChangelogModal'
import ChatPanel from './components/ChatPanel'
import CreateServerModal from './components/CreateServerModal'
import CustomizeModal from './components/CustomizeModal'
import DitherBackground from './components/DitherBackground'
import FriendsPanel from './components/FriendsPanel'
import GroupsPanel from './components/GroupsPanel'
import IncomingCallModal from './components/IncomingCallModal'
import LogoMark from './components/LogoMark'
import ProfileModal from './components/ProfileModal'
import ServerChannels from './components/ServerChannels'
import SettingsModal from './components/SettingsModal'
import TitleBar from './components/TitleBar'
import Toasts from './components/Toasts'
import UpdateBanner from './components/UpdateBanner'
import VoiceBar from './components/VoiceBar'
import { useStoredImage } from './components/useStoredImage'
import { LockScreen } from './components/LockScreen'
import { ensureIdentity, importIdentity, type Identity } from './lib/identity'
import { inkOn } from './lib/color'
import { emitDropFiles } from './lib/dropfiles'
import { getVoice, startSession, stopSession } from './lib/session'
import { checkForUpdates } from './lib/updater'
import { useIsMobile } from './lib/useIsMobile'
import { pairingKeyFromUrl } from './lib/pairing'
import { groupChatKey, useApp } from './store/app'

function Onboarding({ onDone }: { onDone: (id: Identity) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [welcome, setWelcome] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Peak-End moment: identity creation is the biggest step a new user takes
  // — give it a beat of celebration before landing in the app.
  function celebrate(id: Identity, displayName: string) {
    setWelcome(displayName)
    window.setTimeout(() => onDone(id), 1800)
  }

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const id = await ensureIdentity(name.trim())
      if (id) celebrate(id, name.trim())
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
      if (id) celebrate(id, id.name || 'friend')
      else setError('That file is not a valid Rascals identity backup.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (welcome !== null) {
    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
        <DitherBackground />
        <div className="relative w-full max-w-md rounded-2xl border border-rascal-line bg-rascal-panel/90 p-8 text-center shadow-panel backdrop-blur-sm">
          <div className="card-pop mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rascal-accent text-2xl font-bold text-white shadow-lg shadow-rascal-accent/40">
            {welcome.slice(0, 1).toUpperCase()}
          </div>
          <h1 className="card-pop mt-4 text-xl font-bold">You're in, {welcome}.</h1>
          <p className="mt-2 text-sm text-rascal-dim">
            Your identity lives only on this device — nothing to sign up for,
            nobody to hand it over to.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
      <DitherBackground />
      <div className="relative w-full max-w-md rounded-2xl border border-rascal-line bg-rascal-panel/90 p-8 shadow-panel backdrop-blur-sm">
        <div className="mb-4 flex items-center gap-3">
          {/* the mark carries its own dark tile now — no wrapper chip needed */}
          <LogoMark size={48} className="shrink-0" />
          <div>
            <h1 className="text-2xl font-bold">Welcome to Rascals</h1>
            <p className="text-xs text-rascal-dim">private p2p chat — no accounts, no servers</p>
          </div>
        </div>
        <p className="text-sm text-rascal-dim">
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
          className="mt-2 w-full rounded-xl border border-rascal-line bg-rascal-bg px-3 py-2 text-sm outline-none transition-colors duration-150 ease-smooth focus:border-rascal-accent"
        />
        {error && <p className="mt-3 text-sm text-rascal-red">{error}</p>}
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          data-testid="onboard-create"
          className="mt-4 w-full rounded-xl bg-rascal-accent px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-rascal-accent/30 transition-all duration-150 ease-smooth disabled:opacity-40"
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
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8 text-center text-sm text-rascal-dim">
      <DitherBackground />
      <div className="relative">
        <p className="text-base font-semibold text-rascal-text">
          {friends.length === 0
            ? 'Add a friend to get started.'
            : 'Pick a conversation on the left.'}
        </p>
        <p className="mx-auto mt-2 max-w-md">
          Share your invite code with someone else running Rascals. It works
          across networks, and you both stay in control of your own data.
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
      className="mx-auto mt-4 block rounded-xl bg-rascal-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rascal-accent/30 transition-all duration-150 ease-smooth"
    >
      {copied ? 'Copied — send it to a friend!' : 'Copy my invite code'}
    </button>
  )
}

function Rail() {
  const servers = useApp((s) => s.servers)
  const selectedServer = useApp((s) => s.selectedServer)
  const selectServer = useApp((s) => s.selectServer)
  const identity = useApp((s) => s.identity)
  const ownProfile = useApp((s) => s.profile)
  const ownAvatarUrl = useStoredImage('avatar', ownProfile.avatar?.id ?? null)
  const [creating, setCreating] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const list = Object.values(servers).sort((a, b) => a.createdAt - b.createdAt)

  return (
    <div className="flex w-16 shrink-0 flex-col border-r border-rascal-line bg-rascal-rail">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto py-3 scroll-thin">
        <button
          onClick={() => selectServer(null)}
          title="Home - friends and groups"
          className={`flex h-11 w-11 items-center justify-center text-lg font-bold ${
            selectedServer === null ? 'rounded-2xl bg-rascal-accent text-white shadow-lg shadow-rascal-accent/40' : 'rounded-full rail-chip'
          } transition-all duration-150 ease-smooth`}
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
                ? 'rounded-2xl bg-rascal-accent text-white shadow-lg shadow-rascal-accent/40'
                : 'rounded-full rail-chip'
          } transition-all duration-150 ease-smooth`}
          >
            {s.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button
          onClick={() => setCreating(true)}
          title="Create a server"
          aria-label="Create a server"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-rascal-line text-rascal-dim transition-[border-radius,color,border-color] duration-150 ease-smooth hover:border-rascal-accent/60 hover:text-rascal-text"
        >
          <Plus size={18} />
        </button>
      </div>
      {/* Own profile lives at the rail's bottom — where every chat app puts
          the account chip, not floating mid-list. */}
      {identity && (
        <div className="flex flex-col items-center border-t border-rascal-line/60 py-2.5">
          <button
            onClick={() => setProfileOpen(true)}
            title={`${identity.name} — view my profile`}
            aria-label="My profile"
            data-testid="rail-profile"
            className="rounded-full transition-transform duration-150 ease-smooth hover:scale-105"
          >
            <Avatar url={ownAvatarUrl} name={identity.name} size={40} />
          </button>
        </div>
      )}
      {profileOpen && identity && (
        <ProfileModal
          userId={identity.userId}
          onClose={() => setProfileOpen(false)}
          onCustomize={() => {
            setProfileOpen(false)
            setCustomizing(true)
          }}
        />
      )}
      {customizing && <CustomizeModal onClose={() => setCustomizing(false)} />}
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
      <div className="flex w-full shrink-0 flex-col border-r border-rascal-line bg-rascal-panel lg:w-64">
        <ServerChannels serverId={selectedServer} />
      </div>
    )
  }
  return (
    <div className="flex w-full shrink-0 flex-col border-r border-rascal-line bg-rascal-panel lg:w-64">
      <GroupsPanel />
      <FriendsPanel />
    </div>
  )
}

export default function App() {
  const identity = useApp((s) => s.identity)
  const setIdentity = useApp((s) => s.setIdentity)
  const [ready, setReady] = useState(false)
  const isMobile = useIsMobile()
  const selectedFriend = useApp((s) => s.selectedFriend)
  const selectedGroup = useApp((s) => s.selectedGroup)
  const selectFriend = useApp((s) => s.selectFriend)
  const selectGroup = useApp((s) => s.selectGroup)
  const inChat = !!(selectedFriend || selectedGroup)
  // A pairing QR opens the app with #pair=<key>: the phone decides what to
  // do there — take the computer's account or set up fresh. This works
  // regardless of whether THIS device already has an account: a phone that
  // onboarded once and then scanned a pairing QR used to silently ignore
  // the link (0.1.50-0.1.54 "pairing doesn't work" reports).
  const pairKey = ready ? pairingKeyFromUrl() : null
  // Auto-discovery (user request): a phone served by the computer's built-in
  // server polls /pair/status — if a pairing QR is armed on the PC, say so
  // even though no QR was scanned yet. The key stays in the QR.
  const [pcArmed, setPcArmed] = useState(false)
  const [navProfile, setNavProfile] = useState(false)
  const [navCustomize, setNavCustomize] = useState(false)
  const [navSettings, setNavSettings] = useState(false)
  // Optional PIN gate (Security settings). Unlock lives in memory only —
  // every fresh app start locks again. The P2P session keeps running while
  // locked, so background notifications still work; this gates the UI.
  const lockEnabled = useApp((s) => s.settings.lockEnabled)
  const lockHash = useApp((s) => s.settings.lockHash)
  const lockSalt = useApp((s) => s.settings.lockSalt)
  const [appUnlocked, setAppUnlocked] = useState(false)
  const lockGate = lockEnabled && !!lockHash && !!lockSalt && !appUnlocked

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

  // Auto-discovery poll: only meaningful while this device has no account
  // yet (the onboarding phone). Stops the moment pairing or an account wins.
  useEffect(() => {
    if (!ready || identity || pairKey) return
    let cancelled = false
    const poll = () =>
      import('./lib/pairing')
        .then(({ detectHttpPairing }) => detectHttpPairing())
        .then((ok) => {
          if (!cancelled && ok) setPcArmed(true)
        })
        .catch(() => {})
    void poll()
    const iv = window.setInterval(() => void poll(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(iv)
    }
  }, [ready, identity, pairKey])

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

  // Theme + custom accent + background look, all applied on <html>.
  const theme = useApp((s) => s.settings.theme)
  const accent = useApp((s) => s.settings.accent)
  const bgMode = useApp((s) => s.settings.bgMode)
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
  }, [theme])

  // Glass panels only make sense when something shows through: acrylic,
  // image and ascii modes set [data-bg-glass]; standard mode stays solid.
  useEffect(() => {
    if (bgMode === 'standard') delete document.documentElement.dataset.bgGlass
    else document.documentElement.dataset.bgGlass = '1'
  }, [bgMode])

  // Acrylic hands the blur to Windows itself: the window turns truly
  // transparent (desktop shows through, Windhawk-style), the page paints
  // nothing behind the panels, and no dim layer is added. Browser builds
  // have no OS blur, so they keep the CSS-blob fallback from
  // AppBackground instead.
  const isDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  useEffect(() => {
    const root = document.documentElement
    if (bgMode === 'acrylic' && isDesktopApp) {
      root.dataset.bgAcrylic = '1'
      void import('@tauri-apps/api/window').then(({ getCurrentWindow, Effect }) =>
        getCurrentWindow().setEffects({ effects: [Effect.Acrylic] }).catch(() => {}),
      )
    } else {
      delete root.dataset.bgAcrylic
      if (isDesktopApp) {
        void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
          getCurrentWindow().clearEffects().catch(() => {}),
        )
      }
    }
  }, [bgMode, isDesktopApp])

  // Custom accent overrides the theme default. Only well-formed #rrggbb is
  // applied — a corrupt stored value falls back to the theme accent. The
  // matching ink color keeps text readable on bright accents (e.g. white).
  useEffect(() => {
    const root = document.documentElement
    if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
      root.style.setProperty('--color-rascal-accent', accent)
      root.style.setProperty('--accent-ink', inkOn(accent))
    } else {
      root.style.removeProperty('--color-rascal-accent')
      root.style.removeProperty('--accent-ink')
    }
  }, [accent])

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
      <AppBackground />
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
      ) : pairKey ? (
        // A scanned pairing QR outranks the local account: the phone decides
        // there whether to take the computer's account or keep its own.
        <PairReceive pairKey={pairKey} hasIdentity={!!identity} />
      ) : identity ? (
        <>
          {lockGate && (
            <LockScreen
              salt={lockSalt}
              hash={lockHash}
              name={identity.name}
              onUnlock={() => setAppUnlocked(true)}
            />
          )}
          <UpdateBanner />
          <ChangelogModal appVersion={__APP_VERSION__} />
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              {isMobile ? (
                // Discord-mobile single-pane: the list OR the open chat,
                // never both — the bottom nav switches between sections.
                inChat ? (
                  <MainPanel />
                ) : (
                  <Sidebar />
                )
              ) : (
                <>
                  <Rail />
                  <Sidebar />
                  <MainPanel />
                </>
              )}
            </div>
            {isMobile && (
              <nav className="flex shrink-0 items-stretch border-t border-rascal-line bg-rascal-panel pb-[env(safe-area-inset-bottom)]">
                {(
                  [
                    {
                      icon: MessageCircle,
                      label: 'Chats',
                      active: !inChat && !navProfile && !navSettings,
                      onClick: () => {
                        selectFriend(null)
                        selectGroup(null)
                        setNavProfile(false)
                        setNavSettings(false)
                      },
                    },
                    {
                      icon: UserRound,
                      label: 'Profile',
                      active: navProfile,
                      onClick: () => {
                        setNavProfile(true)
                        setNavSettings(false)
                      },
                    },
                    {
                      icon: Settings2,
                      label: 'Settings',
                      active: navSettings,
                      onClick: () => {
                        setNavSettings(true)
                        setNavProfile(false)
                      },
                    },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.label}
                    onClick={t.onClick}
                    aria-label={t.label}
                    aria-pressed={t.active}
                    className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                      t.active ? 'text-rascal-accent' : 'text-rascal-dim hover:text-rascal-text'
                    }`}
                  >
                    <t.icon size={20} />
                    {t.label}
                  </button>
                ))}
              </nav>
            )}
          </div>
          {navProfile && identity && (
            <ProfileModal
              userId={identity.userId}
              onClose={() => setNavProfile(false)}
              onCustomize={() => {
                setNavProfile(false)
                setNavCustomize(true)
              }}
            />
          )}
          {navCustomize && <CustomizeModal onClose={() => setNavCustomize(false)} />}
          {navSettings && <SettingsModal onClose={() => setNavSettings(false)} />}
          <VoiceBar />
          <IncomingCallModal />
          <Toasts />
        </>
      ) : (
        <>
          {pcArmed && (
            <div
              data-testid="pair-available-banner"
              className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border border-rascal-line bg-rascal-panel px-4 py-2 text-center text-xs font-semibold text-rascal-text shadow-xl"
            >
              Your computer is ready to pair — scan the QR on the PC screen.
            </div>
          )}
          <Onboarding onDone={setIdentity} />
        </>
      )}
    </div>
  )
}

// ── Phone-side pairing screen ──────────────────────────────────────────────
// Shown when the app was opened through a pairing QR (#pair=<key>): the
// whole account streams from the computer — no backup file to handle.

function PairReceive({ pairKey, hasIdentity }: { pairKey: string; hasIdentity: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'receiving' | 'saving' | 'celebrate' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [detail, setDetail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [welcome, setWelcome] = useState('')
  // The user asked for visibility: every transport decision is logged on
  // screen — direct line found, claim served, P2P fallback, failures.
  const [log, setLog] = useState<string[]>([])
  const [directLine, setDirectLine] = useState(false)

  const addLog = (line: string) =>
    setLog((l) => [...l.slice(-5), `${new Date().toLocaleTimeString()} ${line}`])

  useEffect(() => {
    // Direct-line detection: this page may BE the computer's phone server.
    let dead = false
    void import('./lib/pairing').then(({ detectHttpPairing }) =>
      detectHttpPairing(),
    ).then((ok) => {
      if (dead) return
      setDirectLine(ok)
      if (ok) addLog('direct line to your computer found')
    })
    return () => {
      dead = true
    }
  }, [])

  async function receive() {
    // Honest states: tapping the button only starts LOOKING for the
    // computer — "Receiving 0%" would be a lie until the first chunk lands.
    setPhase('connecting')
    setDetail('')
    setErr(null)
    try {
      const { receivePairing, claimPairingHttp, clearPairingHash } = await import('./lib/pairing')
      const { importBackup } = await import('./lib/backup')
      const onStatus = (s: { phase: string; progress?: number; detail?: string }) => {
        if (s.phase === 'connecting') setDetail(s.detail ?? '')
        if (s.phase === 'receiving') {
          setProgress(s.progress ?? 0)
          setDetail(s.detail ?? '')
          setPhase('receiving')
        }
        if (s.phase === 'error') setErr(s.detail ?? 'Transfer failed.')
      }
      let text: string
      if (directLine) {
        try {
          text = await claimPairingHttp(pairKey, onStatus)
          addLog('account claimed over the direct line')
        } catch (httpErr) {
          addLog(`direct line refused: ${httpErr instanceof Error ? httpErr.message : 'failed'} — trying P2P`)
          text = await receivePairing(pairKey, onStatus)
        }
      } else {
        addLog('no direct line — using P2P over relays')
        text = await receivePairing(pairKey, onStatus)
      }
      setPhase('saving')
      const res = await importBackup(text)
      if (!res.ok) {
        setErr(res.error ?? 'Restore failed.')
        setPhase('error')
        return
      }
      // End-of-journey moment: greet the person by their own name before the
      // app reboots into the transferred account.
      const parsed = JSON.parse(text) as { identity?: { name?: string } }
      setWelcome(parsed.identity?.name ?? '')
      setPhase('celebrate')
      window.setTimeout(() => {
        // Storage now holds the PC's account; a reload boots straight into it.
        clearPairingHash()
        window.location.reload()
      }, 1600)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Transfer failed — try scanning the QR again.')
      setPhase('error')
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="card-pop w-full max-w-sm p-6 text-center">
        <LogoMark className="mx-auto" />
        <h1 className="mt-3 text-lg font-bold">
          {hasIdentity ? 'Replace this phone’s account?' : 'Pair with your computer'}
        </h1>
        <p className="mt-2 text-sm text-rascal-dim">
          {hasIdentity
            ? 'This phone already has its own account. Receiving replaces it with the computer’s account — identity, friends, servers and chats, streamed directly, nothing through a server.'
            : 'Rascals was opened through a pairing link. Your whole account — identity, friends, servers and chats — streams directly from the computer that showed the QR. Nothing goes through a server.'}
        </p>
        {phase === 'idle' && (
          <>
            <button
              data-testid="pair-receive-button"
              onClick={() => void receive()}
              className="mt-5 w-full rounded-xl bg-rascal-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rascal-accent/30 transition-all duration-150 ease-smooth hover:brightness-110"
            >
              {hasIdentity ? 'Use my computer’s account' : 'Receive from my computer'}
            </button>
            <button
              data-testid="pair-new-device-button"
              onClick={() => {
                void import('./lib/pairing').then(({ clearPairingHash }) => clearPairingHash())
                window.location.reload()
              }}
              className="mt-2 w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-rascal-text transition-all duration-150 ease-smooth hover:bg-white/15"
            >
              {hasIdentity ? 'Keep this phone’s account' : 'Set up as new on this phone'}
            </button>
            {hasIdentity && (
              <p className="mt-3 text-[11px] text-rascal-dim">
                Keeping your account closes this pairing link.
              </p>
            )}
          </>
        )}
        {phase === 'idle' && directLine && (
          <p data-testid="pair-direct-line" className="mt-3 text-[11px] text-rascal-green">
            Direct line to your computer found — the transfer rides your
            Tailscale/LAN, no internet needed.
          </p>
        )}
        {log.length > 0 && (
          <div
            data-testid="pair-log"
            className="mt-3 rounded-lg bg-black/30 p-2 text-left font-mono text-[10px] leading-relaxed text-rascal-dim"
          >
            {log.map((line, i) => (
              <div key={i} className="truncate">{line}</div>
            ))}
          </div>
        )}
        {phase === 'connecting' && (
          <div className="mt-5">
            <div className="mx-auto h-1 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-rascal-accent" />
            </div>
            <p className="mt-2 text-xs font-semibold">Looking for your computer…</p>
            {detail && <p className="mt-1 text-xs text-rascal-green">{detail}</p>}
            <p className="mt-2 text-[11px] leading-relaxed text-rascal-dim">
              Keep this screen open. On the computer, leave the pairing screen
              open too (Settings → Connection) — the transfer starts on its own
              once the data line is up (this can take half a minute).
            </p>
          </div>
        )}
        {phase === 'receiving' && (
          <div className="mt-5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-rascal-accent transition-all duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-rascal-dim">
              Receiving… {Math.round(progress * 100)}% {detail}
            </p>
          </div>
        )}
        {phase === 'saving' && (
          <p className="mt-5 text-sm font-semibold">Saving account…</p>
        )}
        {phase === 'celebrate' && (
          <div className="mt-5">
            <div className="card-pop mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rascal-accent text-2xl font-bold text-white shadow-lg shadow-rascal-accent/40">
              {(welcome || '✓').slice(0, 1).toUpperCase()}
            </div>
            <p className="card-pop mt-3 text-base font-bold">
              {welcome ? `You're all set, ${welcome}.` : 'Account received!'}
            </p>
            <p className="mt-1 text-xs text-rascal-dim">Opening your account…</p>
          </div>
        )}
        {phase === 'error' && (
          <div className="mt-5">
            <p className="text-sm text-rascal-amber">{err ?? 'Transfer failed — try scanning the QR again.'}</p>
            <button
              onClick={() => {
                void import('./lib/pairing').then(({ clearPairingHash }) => clearPairingHash())
                window.location.reload()
              }}
              className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
            >
              Start fresh instead
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
