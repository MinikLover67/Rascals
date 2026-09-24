import { useEffect, useRef, useState } from 'react'
import { exportIdentity, importIdentity, renameIdentity } from '../lib/identity'
import { getVoice } from '../lib/session'
import { checkForUpdates } from '../lib/updater'
import { clearCustomSound, importCustomSound, playSound } from '../lib/sound'
import { useApp, type SoundEvent } from '../store/app'

interface DeviceOption {
  id: string
  label: string
}

const SOUND_EVENTS: Array<{ id: SoundEvent; label: string }> = [
  { id: 'message', label: 'New message' },
  { id: 'request', label: 'Friend request' },
  { id: 'ring', label: 'Incoming call' },
  { id: 'join', label: 'Voice join' },
  { id: 'leave', label: 'Voice leave' },
  { id: 'send', label: 'Message sent' },
]

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const setTenorKey = useApp((s) => s.setTenorKey)
  const [keyInput, setKeyInput] = useState(settings.tenorKey)
  const [saved, setSaved] = useState(false)
  const [mics, setMics] = useState<DeviceOption[]>([])
  const [speakers, setSpeakers] = useState<DeviceOption[]>([])
  const [turnUrl, setTurnUrl] = useState(settings.turnUrl)
  const [turnUser, setTurnUser] = useState(settings.turnUser)
  const [turnPass, setTurnPass] = useState(settings.turnPass)
  const [soundFor, setSoundFor] = useState<SoundEvent | null>(null)
  const [soundBusy, setSoundBusy] = useState(false)
  const [soundErr, setSoundErr] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((devs) => {
        if (!live) return
        const m: DeviceOption[] = []
        const sp: DeviceOption[] = []
        for (const d of devs) {
          const label = d.label || `${d.kind} ${m.length + sp.length + 1}`
          if (d.kind === 'audioinput') m.push({ id: d.deviceId, label })
          else if (d.kind === 'audiooutput') sp.push({ id: d.deviceId, label })
        }
        setMics(m)
        setSpeakers(sp)
      })
      .catch(() => {})
    void import('@tauri-apps/api/app')
      .then(async ({ getVersion }) => {
        try {
          const v = await getVersion()
          if (live) setAppVersion(v)
        } catch {
          // browser dev — no version
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function toggleAutostart(on: boolean) {
    setSettings({ autostart: on })
    try {
      const plugin = await import('@tauri-apps/plugin-autostart')
      if (on) await plugin.enable()
      else await plugin.disable()
    } catch {
      // desktop-only; the preference is still stored
    }
  }

  async function checkUpdates() {
    setUpdateState('Checking...')
    setUpdateState(await checkForUpdates(true))
  }

  async function onSoundFile(files: FileList | null) {
    if (!files || files.length === 0 || !soundFor) return
    setSoundBusy(true)
    setSoundErr(null)
    try {
      await importCustomSound(soundFor, files[0])
      flashSaved()
    } catch (e) {
      setSoundErr(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setSoundBusy(false)
      setSoundFor(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const sel =
    'w-full rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 text-sm outline-none focus:border-rascal-accent'
  const h = 'mt-5 text-xs font-semibold uppercase tracking-wider text-rascal-dim'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-rascal-line bg-rascal-panel p-5 scroll-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Settings</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-rascal-dim hover:text-white">
            Close
          </button>
        </div>

        <ProfileSection />

        <div className={h}>Appearance</div>
        <div className="mt-2 flex gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSettings({ theme: t })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize ${
                settings.theme === t
                  ? 'border-rascal-accent bg-rascal-accent/15 font-semibold'
                  : 'border-rascal-line hover:border-rascal-dim'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={h}>Sounds</div>
        <div className="mt-2 flex gap-2">
          {(['default', 'silent'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setSettings({ soundPack: p })}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm capitalize ${
                settings.soundPack === p
                  ? 'border-rascal-accent bg-rascal-accent/15 font-semibold'
                  : 'border-rascal-line hover:border-rascal-dim'
              }`}
            >
              {p === 'default' ? 'Default pack' : 'Silent'}
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="audio/*,.wav,.mp3,.ogg" className="hidden" onChange={(e) => void onSoundFile(e.target.files)} />
        <div className="mt-2 space-y-1">
          {SOUND_EVENTS.map((ev) => {
            const custom = settings.customSounds[ev.id]
            return (
              <div key={ev.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5">
                <span className="flex-1 text-xs">
                  {ev.label}
                  {custom && <span className="ml-2 text-[10px] text-rascal-accent">custom</span>}
                </span>
                <button
                  onClick={() => playSound(ev.id)}
                  title="Preview"
                  className="rounded px-1.5 py-0.5 text-xs text-rascal-dim hover:text-white"
                >
                  play
                </button>
                <button
                  onClick={() => {
                    setSoundFor(ev.id)
                    fileRef.current?.click()
                  }}
                  disabled={soundBusy}
                  title="Import your own sound (wav/mp3/ogg, 2 MB max)"
                  className="rounded px-1.5 py-0.5 text-xs text-rascal-dim hover:text-white disabled:opacity-40"
                >
                  import
                </button>
                {custom && (
                  <button
                    onClick={() => void clearCustomSound(ev.id).then(() => flashSaved())}
                    title="Back to default"
                    className="rounded px-1.5 py-0.5 text-xs text-rascal-dim hover:text-white"
                  >
                    reset
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {soundErr && <p className="mt-1 text-[11px] text-red-300">{soundErr}</p>}

        <div className={h}>Notifications</div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.notifications}
            onChange={(e) => setSettings({ notifications: e.target.checked })}
            className="accent-[#7c6cff]"
          />
          Notify me about messages, requests, and missed calls
        </label>

        <div className={h}>Startup</div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.autostart}
            onChange={(e) => void toggleAutostart(e.target.checked)}
            className="accent-[#7c6cff]"
          />
          Launch Rascals when I log in (desktop app)
        </label>

        <div className={h}>Voice and calls</div>
        <label className="mt-2 block text-xs text-rascal-dim">Microphone</label>
        <select
          value={settings.micId}
          onChange={(e) => setSettings({ micId: e.target.value })}
          className={`mt-1 ${sel}`}
        >
          <option value="">System default</option>
          {mics.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <label className="mt-2 block text-xs text-rascal-dim">Speaker</label>
        <select
          value={settings.speakerId}
          onChange={(e) => {
            setSettings({ speakerId: e.target.value })
            getVoice()?.setSpeaker(e.target.value)
          }}
          className={`mt-1 ${sel}`}
        >
          <option value="">System default</option>
          {speakers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>

        <div className={h}>TURN relay (optional)</div>
        <p className="mt-1 text-[11px] text-rascal-dim">
          Direct connections work for most networks. If calls never connect (strict NAT),
          add a TURN server - media stays end-to-end encrypted through it.
        </p>
        <input
          value={turnUrl}
          onChange={(e) => setTurnUrl(e.target.value)}
          placeholder="turn:host:3478"
          className="mt-2 w-full rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-rascal-accent"
        />
        <div className="mt-1.5 flex gap-2">
          <input
            value={turnUser}
            onChange={(e) => setTurnUser(e.target.value)}
            placeholder="username"
            className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-rascal-accent"
          />
          <input
            value={turnPass}
            onChange={(e) => setTurnPass(e.target.value)}
            type="password"
            placeholder="credential"
            className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-rascal-accent"
          />
        </div>
        <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs" title="Force all calls and chats through TURN so peers never see your IP address. Needs a TURN server above, and uses more relay bandwidth.">
          <input
            type="checkbox"
            checked={settings.hideIp}
            disabled={!turnUrl.trim() && !settings.turnUrl.trim()}
            onChange={(e) => setSettings({ hideIp: e.target.checked })}
            className="mt-0.5 accent-[#7c6cff]"
          />
          <span>
            Hide my IP from peers (relay everything through TURN)
            <span className="block text-[11px] text-rascal-dim">
              Without this, anyone you connect to can see your IP address - normal for
              calls and P2P apps, but good to know. Needs TURN configured above.
            </span>
          </span>
        </label>
        <button
          onClick={saveVoice}
          className="mt-2 w-full rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15"
        >
          {saved ? 'Saved' : 'Save voice settings'}
        </button>

        <div className={h}>GIFs</div>
        <p className="mt-1 text-xs text-rascal-dim">
          GIF search needs a free Tenor key (developers.google.com/tenor). Stored only on this PC.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Paste key or leave empty to disable GIFs"
            className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-rascal-accent"
          />
          <button
            onClick={() => {
              setTenorKey(keyInput.trim())
              flashSaved()
            }}
            className="rounded-lg bg-rascal-accent px-3 py-1.5 text-sm font-semibold text-white"
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>

        <div className={h}>Updates</div>
        <p className="mt-1 text-xs text-rascal-dim">
          {appVersion ? `Rascals v${appVersion}` : 'Rascals (browser preview - updater lives in the desktop app)'}
        </p>
        <button
          onClick={() => void checkUpdates()}
          className="mt-2 w-full rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15"
        >
          Check for updates
        </button>
        {updateState && <p className="mt-1 text-[11px] text-rascal-dim">{updateState}</p>}

        <ConnectionSection />

        <div className="mt-4 border-t border-rascal-line pt-3 text-xs text-rascal-dim">
          <p>Attachments are stored encrypted in transit and at rest in this PC's IndexedDB.</p>
        </div>
      </div>
    </div>
  )

  function saveVoice() {
    setSettings({ turnUrl: turnUrl.trim(), turnUser: turnUser.trim(), turnPass })
    getVoice()?.setSpeaker(useApp.getState().settings.speakerId)
    flashSaved()
  }
}

type Diag = ReturnType<typeof import('../lib/session').diagnostics>

function ConnectionSection() {
  const [diag, setDiag] = useState<Diag>(null)
  const [copied, setCopied] = useState(false)
  const [reconnectMsg, setReconnectMsg] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)

  function refresh() {
    void import('../lib/session').then(({ diagnostics }) => {
      try {
        setDiag(diagnostics())
      } catch {
        setDiag(null)
      }
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [])

  const connected = diag?.relays.filter((r) => r.state === 'connected').length ?? 0
  const total = diag?.relays.length ?? 0

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ when: new Date().toISOString(), ...diag }, null, 2),
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  async function reconnect() {
    if (reconnecting) return
    setReconnecting(true)
    setReconnectMsg(null)
    try {
      const { resetConnection } = await import('../lib/session')
      setReconnectMsg(await resetConnection())
      refresh()
    } catch {
      setReconnectMsg('Reconnect hit a snag — try again.')
    } finally {
      setReconnecting(false)
    }
  }

  return (
    <div>
      <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-rascal-dim">
        Connection
      </div>
      <p className="mt-1 text-xs text-rascal-dim">
        {diag
          ? `Signaling: ${connected}/${total} relays connected. ` +
            `Lobby peers: ${diag.lobbyPeers}. DM rooms: ${diag.dmRooms} (${diag.dmPeers} peers). ` +
            `Groups: ${diag.groupRooms} (${diag.groupPeers}). Servers: ${diag.serverRooms}.`
          : 'Gathering connection info...'}
      </p>
      {diag && diag.relays.length > 0 && (
        <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-rascal-line p-2 scroll-thin">
          {diag.relays.map((r) => (
            <div key={r.url} className="flex items-center gap-2 font-mono text-[10px]">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  r.state === 'connected' ? 'bg-rascal-green' : r.state === 'connecting' ? 'bg-rascal-amber' : 'bg-rascal-red'
                }`}
              />
              <span className="truncate text-rascal-dim">{r.url}</span>
            </div>
          ))}
        </div>
      )}
      {diag && connected === 0 && (
        <p className="mt-2 text-[11px] text-rascal-amber">
          No signaling relays reachable. Friend requests and calls cannot connect until at
          least one turns green — check your internet/firewall/VPN, then press Refresh.
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={refresh}
          className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15"
        >
          Refresh
        </button>
        <button
          onClick={() => void reconnect()}
          disabled={reconnecting}
          title="Rejoin lobby + all chat rooms and re-announce (fixes stuck invites/presence without restarting)"
          className="flex-1 rounded-lg bg-rascal-accent/20 px-3 py-1.5 text-sm font-semibold text-rascal-accent hover:bg-rascal-accent/30 disabled:opacity-40"
        >
          {reconnecting ? 'Reconnecting…' : 'Reconnect'}
        </button>
        <button
          onClick={() => void copy()}
          disabled={!diag}
          className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-40"
        >
          {copied ? 'Copied' : 'Copy diagnostics'}
        </button>
      </div>
      {reconnectMsg && <p className="mt-1 text-[11px] text-rascal-dim">{reconnectMsg}</p>}
    </div>
  )
}

function ProfileSection() {
  const identity = useApp((s) => s.identity)
  const setIdentity = useApp((s) => s.setIdentity)
  const [name, setName] = useState(identity?.name ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [backup, setBackup] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!identity) return null

  async function saveName() {
    setMsg(null)
    const updated = await renameIdentity(name).catch(() => null)
    if (!updated) {
      setMsg('Name cannot be empty.')
      return
    }
    setIdentity(updated)
    setMsg('Name updated everywhere (your keys never change).')
  }

  async function showBackup() {
    setMsg(null)
    const text = await exportIdentity().catch(() => null)
    if (!text) {
      setMsg('No identity to back up.')
      return
    }
    setBackup(text)
  }

  async function doImport(files: FileList | null) {
    if (!files || files.length === 0) return
    setMsg(null)
    setBackup(null)
    try {
      const text = await files[0].text()
      const id = await importIdentity(text)
      if (!id) {
        setMsg('That file is not a valid Rascals identity backup.')
        return
      }
      setIdentity(id)
      setMsg('Identity restored. Restart the app to reconnect as yourself.')
    } catch {
      setMsg('Could not read that file.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function copyBackup() {
    if (!backup) return
    try {
      await navigator.clipboard.writeText(backup)
      setMsg('Backup copied - paste it somewhere safe (it holds your secret key).')
    } catch {
      setMsg('Clipboard unavailable - select the text manually.')
    }
  }

  return (
    <div>
      <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-rascal-dim">
        Profile
      </div>
      <label className="mt-2 block text-xs text-rascal-dim">Display name (change anytime)</label>
      <div className="mt-1 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void saveName()}
          className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 text-sm outline-none focus:border-rascal-accent"
        />
        <button
          onClick={() => void saveName()}
          className="rounded-lg bg-rascal-accent px-3 py-1.5 text-sm font-semibold text-white"
        >
          Save
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => void showBackup()}
          title="Show your identity backup text (contains your secret key - keep it private)"
          className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
        >
          Back up identity
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          title="Restore from a backup file"
          className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
        >
          Restore backup
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void doImport(e.target.files)} />
      </div>
      {backup && (
        <div className="mt-2">
          <textarea
            readOnly
            value={backup}
            rows={4}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-lg border border-rascal-line bg-rascal-bg p-2 font-mono text-[10px] outline-none"
          />
          <button onClick={() => void copyBackup()} className="mt-1 text-xs text-rascal-dim underline underline-offset-2 hover:text-white">
            copy to clipboard
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-[11px] text-rascal-dim">{msg}</p>}
    </div>
  )
}
