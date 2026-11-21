import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  Bell,
  Check,
  Globe,
  Image as ImageIcon,
  Mic,
  Moon,
  Palette,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sun,
  Upload,
  User,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { exportIdentity, importIdentity, renameIdentity } from '../lib/identity'
import { exportBackup, importBackup } from '../lib/backup'
import { getVoice } from '../lib/session'
import { checkForUpdates } from '../lib/updater'
import { clearCustomSound, importCustomSound, playSound } from '../lib/sound'
import { useApp, type SoundEvent } from '../store/app'
import { hashPin, pinValid, randomSalt, verifyPin } from '../lib/applock'

/** Accent presets: null follows the active theme's default accent. */
const ACCENT_PRESETS: { id: string; label: string; value: string | null }[] = [
  { id: 'default', label: 'Theme default', value: null },
  { id: 'violet', label: 'Violet', value: '#7c6cff' },
  { id: 'ocean', label: 'Ocean', value: '#4cc4ff' },
  { id: 'mint', label: 'Mint', value: '#3ddc84' },
  { id: 'amber', label: 'Amber', value: '#ffb224' },
  { id: 'rose', label: 'Rose', value: '#ff5d5d' },
  { id: 'pink', label: 'Pink', value: '#ff7ad9' },
]

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

type SectionId =
  | 'profile'
  | 'appearance'
  | 'sounds'
  | 'notifications'
  | 'startup'
  | 'voice'
  | 'network'
  | 'security'
  | 'gifs'
  | 'updates'
  | 'connection'

const SECTIONS: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'sounds', label: 'Sounds', icon: Volume2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'startup', label: 'Startup', icon: Power },
  { id: 'voice', label: 'Voice & calls', icon: Mic },
  { id: 'network', label: 'Network relay', icon: Globe },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'gifs', label: 'GIFs', icon: ImageIcon },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
  { id: 'connection', label: 'Connection', icon: Activity },
]

// Toggle switch (NN/g-style): slider + accent color, immediate effect,
// keyboard-operable like a native checkbox.
function Switch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean
  onChange: (on: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => void onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        on ? 'bg-rascal-accent' : 'bg-white/10 hover:bg-white/15'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  )
}

// One setting row: label + note on the left, control on the right.
function Row({ label, note, control }: { label: string; note?: string; control: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.03]">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {note && <div className="mt-0.5 text-xs leading-relaxed text-rascal-dim">{note}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

// Card section with icon heading.
function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-rascal-accent" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {hint && <p className="mt-1 text-xs leading-relaxed text-rascal-dim">{hint}</p>}
      <div className="mt-2 rounded-xl border border-rascal-line bg-rascal-bg/50 p-1.5">{children}</div>
    </div>
  )
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const setTenorKey = useApp((s) => s.setTenorKey)
  const [section, setSection] = useState<SectionId>('profile')
  const [keyInput, setKeyInput] = useState(settings.tenorKey)
  const [saved, setSaved] = useState(false)
  // App-lock PIN flow (Security section).
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [curPin, setCurPin] = useState('')
  const [lockMsg, setLockMsg] = useState<string | null>(null)
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

  const activeSection = SECTIONS.find((s) => s.id === section)

  function saveVoice() {
    setSettings({ turnUrl: turnUrl.trim(), turnUser: turnUser.trim(), turnPass })
    getVoice()?.setSpeaker(useApp.getState().settings.speakerId)
    flashSaved()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-rascal-line bg-rascal-panel scroll-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="w-48 shrink-0 space-y-0.5 overflow-y-auto border-r border-rascal-line p-3 scroll-thin">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${
                section === id
                  ? 'bg-rascal-accent/15 font-semibold text-white'
                  : 'text-rascal-dim hover:bg-white/5 hover:text-rascal-text'
              }`}
            >
              <Icon size={15} className={section === id ? 'text-rascal-accent' : ''} />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-rascal-line px-5 py-3">
            <h2 className="text-base font-bold">Settings</h2>
            {activeSection && (
              <span className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-xs text-rascal-dim">
                <activeSection.icon size={13} className="text-rascal-accent" />
                {activeSection.label}
              </span>
            )}
            <span className="flex-1" />
            {appVersion && (
              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-rascal-dim">
                v{appVersion} beta
              </span>
            )}
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close settings"
              className="rounded-md p-1.5 text-rascal-dim hover:bg-white/5 hover:text-rascal-text"
            >
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 scroll-thin">
            {section === 'profile' && (
              <Section icon={User} title="Profile">
                <ProfileSection />
              </Section>
            )}

            {section === 'appearance' && (
              <Section icon={Palette} title="Appearance">
                <div className="p-1.5">
                  <p className="mb-2 px-1 text-xs font-semibold text-rascal-dim">Theme</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        {
                          id: 'dark',
                          label: 'Dark',
                          hint: 'black rail · night',
                          Icon: Moon,
                          rail: '#000000',
                          panel: '#101014',
                          text: '#e8e9ee',
                          accent: '#7c6cff',
                        },
                        {
                          id: 'light',
                          label: 'Light',
                          hint: 'lilac rail · day',
                          Icon: Sun,
                          rail: '#a78bfa',
                          panel: '#ffffff',
                          text: '#241b3a',
                          accent: '#7a4ff0',
                        },
                      ] as const
                    ).map((t) => {
                      const active = settings.theme === t.id
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSettings({ theme: t.id })}
                          aria-pressed={active}
                          className={`group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors ${
                            active
                              ? 'border-rascal-accent bg-rascal-accent/15'
                              : 'border-rascal-line hover:border-rascal-dim'
                          }`}
                        >
                          {/* mini live preview: rail + panel + sample text + accent dot */}
                          <div
                            className="flex h-12 overflow-hidden rounded-md border border-black/10"
                            style={{ backgroundColor: t.panel }}
                          >
                            <div className="w-3 shrink-0" style={{ backgroundColor: t.rail }} />
                            <div className="flex flex-1 flex-col justify-center gap-1 px-1.5">
                              <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: t.text, opacity: 0.85 }} />
                              <div className="flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.accent }} />
                                <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: t.text, opacity: 0.4 }} />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <t.Icon
                              size={14}
                              className={active ? 'text-rascal-accent' : 'text-rascal-dim'}
                            />
                            <span className={`text-sm ${active ? 'font-semibold' : ''}`}>{t.label}</span>
                            <span className="ml-auto text-[10px] font-normal text-rascal-dim">{t.hint}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Accent color: presets + custom picker, applied live via
                      --color-rascal-accent on <html> (see App.tsx effect). */}
                  <div className="mt-3 border-t border-rascal-line p-1.5 pt-3">
                    <p className="mb-2 px-1 text-xs font-semibold text-rascal-dim">Accent color</p>
                    <div className="flex flex-wrap items-center gap-2 px-1">
                      {ACCENT_PRESETS.map((a) => {
                        const active = (settings.accent ?? null) === a.value
                        const themeDefault = settings.theme === 'light' ? '#7a4ff0' : '#7c6cff'
                        return (
                          <button
                            key={a.id}
                            onClick={() => setSettings({ accent: a.value })}
                            aria-pressed={active}
                            title={a.label}
                            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-105 ${
                              active ? 'border-rascal-text' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: a.value ?? themeDefault }}
                          >
                            {active && <Check size={13} className="text-white drop-shadow" />}
                          </button>
                        )
                      })}
                      <label
                        title="Custom color"
                        className="relative h-7 w-7 cursor-pointer rounded-full border-2 border-dashed border-rascal-line transition-transform hover:scale-105"
                      >
                        <span
                          className="block h-4 w-4 rounded-full"
                          style={{
                            margin: 'auto',
                            backgroundColor: settings.accent ?? (settings.theme === 'light' ? '#7a4ff0' : '#7c6cff'),
                            opacity: settings.accent ? 1 : 0.5,
                          }}
                        />
                        <input
                          type="color"
                          value={settings.accent ?? '#7c6cff'}
                          onChange={(e) => setSettings({ accent: e.target.value })}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Custom accent color"
                        />
                      </label>
                      {settings.accent && (
                        <button
                          onClick={() => setSettings({ accent: null })}
                          className="ml-1 text-xs text-rascal-dim transition-colors hover:text-rascal-text"
                        >
                          Reset to theme default
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {section === 'sounds' && (
              <Section icon={Volume2} title="Sounds" hint="Import your own wav/mp3/ogg clips (2 MB max) per event.">
                <div className="flex gap-2 p-1.5">
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
                <div className="mt-1 space-y-0.5">
                  {SOUND_EVENTS.map((ev) => {
                    const custom = settings.customSounds[ev.id]
                    return (
                      <div key={ev.id} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/5">
                        <span className="flex-1 text-xs">
                          {ev.label}
                          {custom && <span className="ml-2 text-[10px] text-rascal-accent">custom</span>}
                        </span>
                        <button
                          onClick={() => playSound(ev.id)}
                          title="Preview"
                          aria-label={`Preview ${ev.label}`}
                          className="rounded p-1.5 text-rascal-dim hover:bg-white/10 hover:text-rascal-text"
                        >
                          <Play size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setSoundFor(ev.id)
                            fileRef.current?.click()
                          }}
                          disabled={soundBusy}
                          title="Import your own sound (wav/mp3/ogg, 2 MB max)"
                          aria-label={`Import ${ev.label} sound`}
                          className="rounded p-1.5 text-rascal-dim hover:bg-white/10 hover:text-rascal-text disabled:opacity-40"
                        >
                          <Upload size={13} />
                        </button>
                        {custom && (
                          <button
                            onClick={() => void clearCustomSound(ev.id).then(() => flashSaved())}
                            title="Back to default"
                            aria-label={`Reset ${ev.label} sound`}
                            className="rounded p-1.5 text-rascal-dim hover:bg-white/10 hover:text-rascal-text"
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                {soundErr && <p className="mt-1 px-2 text-[11px] text-red-300">{soundErr}</p>}
              </Section>
            )}

            {section === 'notifications' && (
              <Section icon={Bell} title="Notifications">
                <Row
                  label="Message & call alerts"
                  note="Notify me about messages, requests, and missed calls."
                  control={
                    <Switch
                      on={settings.notifications}
                      onChange={(on) => setSettings({ notifications: on })}
                      label="Message and call alerts"
                    />
                  }
                />
              </Section>
            )}

            {section === 'startup' && (
              <Section icon={Power} title="Startup">
                <Row
                  label="Launch at login"
                  note="Start Rascals when I log in (desktop app)."
                  control={
                    <Switch
                      on={settings.autostart}
                      onChange={(on) => void toggleAutostart(on)}
                      label="Launch at login"
                    />
                  }
                />
              </Section>
            )}

            {section === 'voice' && (
              <Section icon={Mic} title="Voice and calls">
                <div className="space-y-2 p-1.5">
                  <div>
                    <label className="block text-xs text-rascal-dim">Microphone</label>
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
                  </div>
                  <div>
                    <label className="block text-xs text-rascal-dim">Speaker</label>
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
                  </div>
                </div>
              </Section>
            )}

            {section === 'network' && (
              <Section
                icon={Globe}
                title="TURN relay (optional)"
                hint="Direct connections work for most networks. If calls never connect (strict NAT), add a TURN server - media stays end-to-end encrypted through it."
              >
                <div className="space-y-2 p-1.5">
                  <input
                    value={turnUrl}
                    onChange={(e) => setTurnUrl(e.target.value)}
                    placeholder="turn:host:3478"
                    className="w-full rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-rascal-accent"
                  />
                  <div className="flex gap-2">
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
                  <div className="rounded-xl px-1 py-1 hover:bg-white/[0.03]">
                    <Row
                      label="Built-in TURN relay"
                      note="Fallback TURN for strict NAT/firewalls, and what makes Hide-my-IP work with zero setup. It's a free public service (metered.ca Open Relay) - media stays end-to-end encrypted, but a third party could see connection metadata. Turn off if you want no third parties at all."
                      control={
                        <Switch
                          on={settings.defaultTurn}
                          onChange={(on) => setSettings({ defaultTurn: on })}
                          label="Built-in TURN relay"
                          disabled={!!settings.turnUrl.trim() || !!turnUrl.trim()}
                        />
                      }
                    />
                  </div>
                  <div className="rounded-xl px-1 py-1 hover:bg-white/[0.03]">
                    <Row
                      label="Hide my IP from peers"
                      note="Relay everything through TURN. Without this, anyone you connect to can see your IP address - normal for calls and P2P apps, but good to know. Works with your own TURN above or the built-in relay."
                      control={
                        <Switch
                          on={settings.hideIp}
                          onChange={(on) => setSettings({ hideIp: on })}
                          label="Hide my IP from peers"
                          disabled={
                            !settings.defaultTurn && !turnUrl.trim() && !settings.turnUrl.trim()
                          }
                        />
                      }
                    />
                  </div>
                  <button
                    onClick={saveVoice}
                    className="w-full rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15"
                  >
                    {saved ? 'Saved' : 'Save voice settings'}
                  </button>
                </div>
              </Section>
            )}

            {section === 'security' && (
              <Section
                icon={ShieldCheck}
                title="Security"
                hint="Local-only protections. Nothing here ever leaves this PC."
              >
                <div className="space-y-2 p-1.5">
                  {settings.lockEnabled && settings.lockHash && settings.lockSalt ? (
                    <>
                      <div className="rounded-xl px-1 py-1 hover:bg-white/[0.03]">
                        <Row
                          label="App lock is on"
                          note="A PIN is required every time Rascals starts."
                          control={
                            <Switch
                              on={settings.lockEnabled}
                              onChange={(on) => setSettings({ lockEnabled: on })}
                              label="App lock"
                            />
                          }
                        />
                      </div>
                      <input
                        type="password"
                        value={curPin}
                        onChange={(e) => setCurPin(e.target.value)}
                        placeholder="Current PIN"
                        className={`mt-1 ${sel}`}
                        aria-label="Current PIN"
                      />
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          placeholder="New PIN (4-16 chars)"
                          className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 text-sm outline-none focus:border-rascal-accent"
                          aria-label="New PIN"
                        />
                        <button
                          onClick={() => {
                            setLockMsg(null)
                            if (!pinValid(pin)) {
                              setLockMsg('PIN must be 4-16 characters, no spaces.')
                              return
                            }
                            if (pin !== pin2) {
                              setLockMsg('PINs do not match.')
                              return
                            }
                            void (async () => {
                              const ok = await verifyPin(curPin, settings.lockSalt!, settings.lockHash!)
                              if (!ok) {
                                setLockMsg('Current PIN is wrong.')
                                return
                              }
                              const salt = randomSalt()
                              const hash = await hashPin(pin, salt)
                              setSettings({ lockHash: hash, lockSalt: salt })
                              setPin('')
                              setPin2('')
                              setCurPin('')
                              setLockMsg('PIN changed.')
                            })()
                          }}
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                        >
                          Change PIN
                        </button>
                        <input
                          type="password"
                          value={pin2}
                          onChange={(e) => setPin2(e.target.value)}
                          placeholder="Repeat"
                          className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 text-sm outline-none focus:border-rascal-accent"
                          aria-label="Repeat new PIN"
                        />
                        <button
                          onClick={() => {
                            setLockMsg(null)
                            void (async () => {
                              const ok = await verifyPin(curPin, settings.lockSalt!, settings.lockHash!)
                              if (!ok) {
                                setLockMsg('Current PIN is wrong.')
                                return
                              }
                              setSettings({ lockEnabled: false, lockHash: null, lockSalt: null })
                              setPin('')
                              setPin2('')
                              setCurPin('')
                              setLockMsg('App lock removed.')
                            })()
                          }}
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                        >
                          Remove PIN
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <input
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="Choose a PIN (4-16 chars)"
                        className={`${sel}`}
                        aria-label="Choose a PIN"
                      />
                      <input
                        type="password"
                        value={pin2}
                        onChange={(e) => setPin2(e.target.value)}
                        placeholder="Repeat the PIN"
                        className={`${sel}`}
                        aria-label="Repeat the PIN"
                      />
                      <button
                        onClick={() => {
                          setLockMsg(null)
                          if (!pinValid(pin)) {
                            setLockMsg('PIN must be 4-16 characters, no spaces.')
                            return
                          }
                          if (pin !== pin2) {
                            setLockMsg('PINs do not match.')
                            return
                          }
                          void (async () => {
                            const salt = randomSalt()
                            const hash = await hashPin(pin, salt)
                            setSettings({ lockEnabled: true, lockHash: hash, lockSalt: salt })
                            setPin('')
                            setPin2('')
                            setLockMsg('App lock is on — Rascals will ask for this PIN on start.')
                          })()
                        }}
                        className="w-full rounded-lg bg-rascal-accent px-3 py-1.5 text-sm font-semibold text-white"
                      >
                        Enable app lock
                      </button>
                    </>
                  )}
                  {lockMsg && <p className="px-1 text-[11px] text-rascal-dim">{lockMsg}</p>}
                  <p className="px-1 text-[11px] text-rascal-dim">
                    The PIN is stored as a salted hash on this machine only. There is no
                    recovery — losing the PIN means reinstalling Rascals (use Full backup
                    from Profile to keep your data).
                  </p>
                </div>
              </Section>
            )}

            {section === 'gifs' && (
              <Section
                icon={ImageIcon}
                title="GIFs"
                hint="GIF search needs a free Tenor key (developers.google.com/tenor). Stored only on this PC."
              >
                <div className="flex gap-2 p-1.5">
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
              </Section>
            )}

            {section === 'updates' && (
              <Section icon={RefreshCw} title="Updates">
                <div className="p-1.5">
                  <p className="px-1 text-xs text-rascal-dim">
                    {appVersion ? `Rascals v${appVersion}` : 'Rascals (browser preview - updater lives in the desktop app)'}
                  </p>
                  <button
                    onClick={() => void checkUpdates()}
                    className="mt-2 w-full rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15"
                  >
                    Check for updates
                  </button>
                  {updateState && <p className="mt-1 px-1 text-[11px] text-rascal-dim">{updateState}</p>}
                </div>
              </Section>
            )}

            {section === 'connection' && <ConnectionSection />}

            <p className="border-t border-rascal-line pt-3 text-xs text-rascal-dim">
              Attachments are stored encrypted in transit and at rest in this PC's IndexedDB.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
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
    <Section
      icon={Activity}
      title="Connection"
      hint={
        diag
          ? `Signaling: ${connected}/${total} relays connected. ` +
            `Lobby peers: ${diag.lobbyPeers}. DM rooms: ${diag.dmRooms} (${diag.dmPeers} peers). ` +
            `Groups: ${diag.groupRooms} (${diag.groupPeers}). Servers: ${diag.serverRooms}.`
          : 'Gathering connection info...'
      }
    >
      <div className="space-y-2 p-1.5">
        {diag && diag.relays.length > 0 && (
          <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-rascal-line p-2 scroll-thin">
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
          <p className="text-[11px] text-rascal-amber">
            No signaling relays reachable. Friend requests and calls cannot connect until at
            least one turns green — check your internet/firewall/VPN, then press Refresh.
          </p>
        )}
        <div className="flex gap-2">
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
        {reconnectMsg && <p className="text-[11px] text-rascal-dim">{reconnectMsg}</p>}
      </div>
    </Section>
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
      // Accepts both identity-only exports and full backups.
      const res = await importBackup(text)
      if (!res.ok) {
        setMsg(res.error ?? 'That file is not a valid Rascals backup.')
        return
      }
      if (res.summary?.startsWith('Identity')) {
        const id = await importIdentity(text).catch(() => null)
        if (id) setIdentity(id)
      }
      setMsg(res.summary ?? 'Backup restored.')
    } catch {
      setMsg('Could not read that file.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function downloadFullBackup() {
    setMsg(null)
    const text = await exportBackup().catch(() => null)
    if (!text) {
      setMsg('No identity to back up.')
      return
    }
    try {
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rascals-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMsg('Full backup saved (identity, contacts, servers, chats, keys). Keep it private!')
    } catch {
      setMsg('Download failed — use "Back up identity" instead.')
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
    <div className="space-y-2 p-1.5">
      <div>
        <label className="block text-xs text-rascal-dim">Display name (change anytime)</label>
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
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => void showBackup()}
          title="Show your identity backup text (contains your secret key - keep it private)"
          className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
        >
          Back up identity
        </button>
        <button
          onClick={() => void downloadFullBackup()}
          title="Download everything: identity, contacts, servers, chats, keys"
          className="flex-1 rounded-lg bg-rascal-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Full backup
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          title="Restore from a backup file (identity or full)"
          className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
        >
          Restore backup
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void doImport(e.target.files)} />
      </div>
      {backup && (
        <div>
          <textarea
            readOnly
            value={backup}
            rows={4}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-lg border border-rascal-line bg-rascal-bg p-2 font-mono text-[10px] outline-none"
          />
          <button onClick={() => void copyBackup()} className="mt-1 text-xs text-rascal-dim underline underline-offset-2 hover:text-rascal-text">
            copy to clipboard
          </button>
        </div>
      )}
      {msg && <p className="text-[11px] text-rascal-dim">{msg}</p>}
    </div>
  )
}
