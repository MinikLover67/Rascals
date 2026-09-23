import { useEffect, useState } from 'react'
import { decodeInvite, encodeInvite } from '../lib/invite'
import { acceptRequest, getP2P, requestFriend, unfriend } from '../lib/session'
import { useApp, unreadCount } from '../store/app'
import SettingsModal from './SettingsModal'

function shortId(userId: string): string {
  return userId.length > 16 ? `${userId.slice(0, 12)}…` : userId
}

export default function FriendsPanel() {
  const identity = useApp((s) => s.identity)
  const friends = useApp((s) => s.friends)
  const favorites = useApp((s) => s.favorites)
  const toggleFavorite = useApp((s) => s.toggleFavorite)
  const requests = useApp((s) => s.requests)
  const selectedFriend = useApp((s) => s.selectedFriend)
  const selectFriend = useApp((s) => s.selectFriend)
  const removeRequest = useApp((s) => s.removeRequest)
  const recent = useApp((s) => s.recent)
  const dropRecent = useApp((s) => s.dropRecent)
  const messages = useApp((s) => s.messages)
  const lastRead = useApp((s) => s.lastRead)

  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [knock, setKnock] = useState<Record<string, 'busy' | 'done'>>({})

  if (!identity) return null
  const me = identity
  const myCode = encodeInvite(me.userId, me.name)
  const incoming = requests.filter((r) => r.direction === 'in')
  const outgoing = requests.filter((r) => r.direction === 'out')
  const onlineCount = friends.filter((f) => f.online).length
  // Favorites first (by favorited-at), then the rest in existing order.
  const orderedFriends = [...friends].sort((a, b) => {
    const fa = favorites[a.userId] ?? 0
    const fb = favorites[b.userId] ?? 0
    if (fa && fb) return fa - fb
    if (fa) return -1
    if (fb) return 1
    return 0
  })

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(myCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Clipboard unavailable — select the code text manually.')
    }
  }

  async function addFriend() {
    setError(null)
    const parsed = decodeInvite(codeInput)
    if (!parsed) {
      setError('That does not look like a Rascals invite code.')
      return
    }
    if (parsed.userId === me.userId) {
      setError('That is your own code — send it to a friend instead.')
      return
    }
    setBusy(true)
    try {
      await requestFriend(parsed.userId, parsed.displayName)
      setCodeInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request.')
    } finally {
      setBusy(false)
    }
  }

  async function accept(userId: string, displayName: string) {
    setError(null)
    try {
      await acceptRequest(userId, displayName)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept the request.')
    }
  }

  async function retry(userId: string) {
    setError(null)
    setKnock((prev) => ({ ...prev, [userId]: 'busy' }))
    try {
      await getP2P()?.sendFriendRequest(userId)
      setKnock((prev) => ({ ...prev, [userId]: 'done' }))
      window.setTimeout(() => {
        setKnock((prev) => {
          if (prev[userId] !== 'done') return prev
          const next = { ...prev }
          delete next[userId]
          return next
        })
      }, 3000)
    } catch (e) {
      setKnock((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      setError(e instanceof Error ? e.message : 'Could not re-send the knock.')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-rascal-panel">
      <div className="border-b border-rascal-line p-3">
        <div className="text-xs font-bold uppercase tracking-wider text-rascal-dim">
          {me.name}        </div>
        <div className="truncate font-mono text-[11px] text-rascal-dim" title={me.userId}>
          {shortId(me.userId)}
        </div>
        <button
          onClick={() => setShowCode((v) => !v)}
          data-testid="show-code"
          className="mt-2 w-full rounded-lg border border-rascal-line px-2 py-1.5 text-xs font-semibold hover:border-rascal-accent"
        >
          {showCode ? 'Hide my invite code' : 'Show my invite code'}
        </button>
        {showCode && (
          <div className="mt-2 rounded-lg bg-rascal-bg p-2">
            <div data-testid="invite-code" className="mt-2 break-all font-mono text-[10px] leading-relaxed text-rascal-dim">
              {myCode}
            </div>
            <button
              onClick={copyCode}
              className="mt-2 w-full rounded-lg bg-rascal-accent px-2 py-1 text-xs font-semibold text-white"
            >
              {copied ? 'Copied!' : 'Copy code'}
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 scroll-thin">
        <ConnHealth />
        <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Add friend
        </div>
        <p className="mt-1 text-[11px] text-rascal-dim">
          Codes work across the internet — different Wi-Fi, different cities, no problem.
        </p>
        <div className="mt-2 flex gap-1.5">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addFriend()}
            placeholder="Paste rascal1:… code"
            data-testid="add-input"
            className="min-w-0 flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-2 py-1.5 font-mono text-[11px] outline-none focus:border-rascal-accent"
          />
          <button
            onClick={addFriend}
            disabled={busy || !codeInput.trim()}
            data-testid="add-button"
            className="shrink-0 rounded-lg bg-rascal-accent px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-rascal-red">{error}</p>}

        {incoming.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">
              Requests · {incoming.length}
            </div>
            {incoming.map((r) => (
              <div key={r.userId} data-testid="request-in" className="mt-2 rounded-lg border border-rascal-line bg-rascal-bg p-2">
                <div className="truncate text-sm font-semibold">{r.displayName}</div>
                <div className="truncate font-mono text-[10px] text-rascal-dim" title={r.userId}>
                  {shortId(r.userId)}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => accept(r.userId, r.displayName)}
                    data-testid="accept-request"
                    className="flex-1 rounded-md bg-rascal-green/20 px-2 py-1 text-xs font-semibold text-rascal-green"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => removeRequest(r.userId)}
                    className="flex-1 rounded-md bg-white/5 px-2 py-1 text-xs text-rascal-dim hover:text-white"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">
              Sent · {outgoing.length}
            </div>
            {outgoing.map((r) => (
              <div key={r.userId} data-testid="request-out" className="mt-2 rounded-lg border border-rascal-line bg-rascal-bg p-2">
                <div className="truncate text-sm">{r.displayName}</div>
                <div className="text-[11px] text-rascal-amber">waiting for them... (retries automatically)</div>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    onClick={() => retry(r.userId)}
                    disabled={knock[r.userId] === 'busy'}
                    className="flex-1 rounded-md bg-white/5 px-2 py-1 text-[11px] hover:text-white disabled:opacity-50"
                  >
                    {knock[r.userId] === 'busy'
                      ? 'Knocking…'
                      : knock[r.userId] === 'done'
                        ? 'Knocked ✓'
                        : 'Knock again'}
                  </button>
                  <button onClick={() => removeRequest(r.userId)} className="flex-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-rascal-dim hover:text-white">
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Friends · {onlineCount}/{friends.length} online
        </div>
        {friends.length === 0 && (
          <p className="mt-2 text-xs leading-relaxed text-rascal-dim">
            No friends yet. Share your invite code with someone running Rascals
            and have them paste it above. No accounts, no servers — direct
            encrypted connection.
          </p>
        )}
        {orderedFriends.map((f) => {
          const unread = unreadCount(messages[f.userId], lastRead[f.userId])
          const fav = favorites[f.userId] !== undefined
          return (
            <div
              key={f.userId}
              data-testid="friend-row"
              onClick={() => selectFriend(f.userId)}
              className={`mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 ${
                selectedFriend === f.userId ? 'bg-white/5' : ''
              }`}
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${f.online ? 'bg-rascal-green' : 'bg-rascal-dim/40'}`}
                title={f.online ? 'online' : 'offline'}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{f.displayName}</div>
                <div className="truncate font-mono text-[10px] text-rascal-dim">
                  {f.online ? 'online' : shortId(f.userId)}
                </div>
              </div>
              {unread > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rascal-accent px-1.5 text-[11px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFavorite(f.userId)
                }}
                title={fav ? 'Unfavorite' : 'Favorite (pin to top)'}
                className={`rounded px-1.5 text-sm leading-none hover:bg-white/10 ${fav ? 'text-rascal-amber' : 'text-rascal-dim/50 hover:text-rascal-amber'}`}
              >
                {fav ? '★' : '☆'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const label = [...f.displayName].length > 30 ? `${[...f.displayName].slice(0, 30).join('')}…` : f.displayName
                  if (window.confirm(`Remove ${label} as a friend? Chat history is kept.`))
                    void unfriend(f.userId).catch(() => {})
                }}
                title="Remove friend"
                data-testid="remove-friend"
                className="rounded px-1.5 text-rascal-dim hover:bg-white/10 hover:text-rascal-red"
              >
                ×
              </button>
            </div>
          )
        })}
        {recent.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">
              Recently removed
            </div>
            {recent.map((r) => (
              <div
                key={r.userId}
                data-testid="recent-row"
                className="mt-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-rascal-dim">{r.displayName}</div>
                  <div className="truncate font-mono text-[10px] text-rascal-dim">
                    {shortId(r.userId)}
                  </div>
                </div>
                <button
                  onClick={() => void requestFriend(r.userId, r.displayName).catch(() => {})}
                  title="Send friend request again (no code needed)"
                  data-testid="readd-friend"
                  className="shrink-0 rounded-md bg-rascal-accent/20 px-2 py-1 text-[11px] font-semibold text-rascal-accent hover:bg-rascal-accent/30"
                >
                  Re-add
                </button>
                <button
                  onClick={() => dropRecent(r.userId)}
                  title="Forget"
                  className="rounded px-1 text-rascal-dim hover:text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-rascal-line p-3 text-[11px] text-rascal-dim">
        <ConnDot />
        <span className="min-w-0 flex-1 truncate">P2P · E2EE only</span>
        <AppVersion />
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings (connection, devices, updates)"
          className="rounded-md px-2 py-1 text-xs hover:bg-white/5 hover:text-white"
        >
          Settings
        </button>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

// Live signaling dot: green when at least one relay is connected, red when
// none are, dim while unknown. Polled — cheap, synchronous, never throws.
// Weak-connection banner: when almost no signaling relays are reachable
// (captive portal, firewall, VPN, DNS trouble), SAY SO where invites live —
// otherwise "request sent, nothing arrives" looks like an app bug.
function ConnHealth() {
  const [weak, setWeak] = useState(false)
  useEffect(() => {
    let live = true
    const poll = () => {
      void import('../lib/session').then(({ diagnostics }) => {
        if (!live) return
        try {
          const d = diagnostics()
          if (!d || d.relays.length === 0) {
            setWeak(false)
            return
          }
          const up = d.relays.filter((r) => r.state === 'connected').length
          setWeak(up <= 1)
        } catch {
          setWeak(false)
        }
      })
    }
    poll()
    const t = setInterval(poll, 15000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  if (!weak) return null
  return (
    <div className="mb-2 rounded-lg border border-rascal-amber/50 bg-rascal-amber/10 p-2 text-[11px] leading-relaxed">
      <span className="font-bold text-rascal-amber">Weak connection.</span>{' '}
      <span className="text-rascal-dim">
        Almost no signaling relays reachable — invites and messages may not
        arrive. Check internet, VPN, firewall, or try another network. Details
        in Settings → Connection.
      </span>
    </div>
  )
}

function ConnDot() {  const [connected, setConnected] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    const poll = () => {
      void import('../lib/session').then(({ diagnostics }) => {
        if (!live) return
        try {
          const d = diagnostics()
          if (!d) {
            setConnected(null)
            return
          }
          setConnected(d.relays.filter((r) => r.state === 'connected').length)
        } catch {
          setConnected(null)
        }
      })
    }
    poll()
    const t = setInterval(poll, 10000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  const cls =
    connected === null
      ? 'text-rascal-dim'
      : connected > 0
        ? 'text-rascal-green'
        : 'text-rascal-red'
  const title =
    connected === null
      ? 'Connection status unknown'
      : connected > 0
        ? `Connected (${connected} relays) - ready for invites and calls`
        : 'No signaling connection - invites and calls cannot work. See Settings > Connection.'
  return (
    <span className={cls} title={title}>
      ●
    </span>
  )
}

function AppVersion() {
  const [version, setVersion] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void import('@tauri-apps/api/app')
      .then(async ({ getVersion }) => {
        try {
          const v = await getVersion()
          if (live) setVersion(v)
        } catch {
          if (live) setVersion('web')
        }
      })
      .catch(() => {
        if (live) setVersion('web')
      })
    return () => {
      live = false
    }
  }, [])
  if (!version) return null

  async function check() {
    if (busy) return
    setBusy(true)
    setNote('checking...')
    try {
      const { checkForUpdates } = await import('../lib/updater')
      setNote(await checkForUpdates(true))
    } catch {
      setNote('check failed')
    } finally {
      setBusy(false)
      setTimeout(() => setNote(null), 5000)
    }
  }

  return (
    <button
      onClick={() => void check()}
      title={note ?? `Rascals v${version} - click to check for updates (an update banner appears up top when one is found)`}
      className="shrink-0 rounded px-1 font-mono text-[10px] hover:bg-white/5 hover:text-white"
    >
      {busy ? '...' : note ? `${note.slice(0, 28)}` : `v${version}`}
    </button>
  )
}
