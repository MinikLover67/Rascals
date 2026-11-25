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
import { bakeWallpaper } from '../lib/wallpaper'
import { getVoice } from '../lib/session'
import { checkForUpdates } from '../lib/updater'
import { clearCustomSound, importCustomSound, playSound } from '../lib/sound'
import { qrSvg as renderQrSvg } from '../lib/qr'
import { useApp, type SoundEvent } from '../store/app'
import { hashPin, pinValid, randomSalt, verifyPin } from '../lib/applock'
import ColorPicker from './ColorPicker'
import DitherBackground, { type AsciiStyle } from './DitherBackground'

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

// Vertical rail, grouped like every chat app people know: account stuff
// up top, app behavior in the middle, plumbing at the bottom.
const NAV_GROUPS: Array<{ heading: string; items: typeof SECTIONS }> = [
  {
    heading: 'My account',
    items: SECTIONS.filter((s) => s.id === 'profile' || s.id === 'appearance'),
  },
  {
    heading: 'App',
    items: SECTIONS.filter((s) =>
      ['sounds', 'notifications', 'startup', 'gifs', 'updates'].includes(s.id),
    ),
  },
  {
    heading: 'Chat',
    items: SECTIONS.filter((s) => s.id === 'voice'),
  },
  {
    heading: 'Advanced',
    items: SECTIONS.filter((s) => ['network', 'security', 'connection'].includes(s.id)),
  },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[100dvh] max-h-none w-full max-w-5xl flex-col overflow-hidden rounded-none border border-rascal-line bg-rascal-panel shadow-raised sm:h-auto sm:max-h-[88vh] sm:flex-row sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="flex w-full shrink-0 gap-2 overflow-x-auto border-b border-rascal-line p-3 scroll-thin sm:w-60 sm:flex-col sm:overflow-y-auto sm:gap-0 sm:border-b-0 sm:border-r">
          {NAV_GROUPS.map(({ heading, items }) => (
            <div key={heading} className="contents sm:mb-3 sm:block">
              <p className="hidden px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-rascal-dim sm:block">
                {heading}
              </p>
              {items.map(({ id, label, icon: Icon }) => {
                const active = section === id
                return (
                  <button
                    key={id}
                    onClick={() => setSection(id)}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-left text-sm transition-colors sm:w-full sm:gap-3 sm:rounded-xl sm:px-3 sm:py-2.5 sm:whitespace-normal ${
                      active
                        ? 'bg-rascal-accent font-semibold shadow-lg shadow-rascal-accent/25'
                        : 'text-rascal-dim hover:bg-white/5 hover:text-rascal-text'
                    }`}
                  >
                    <Icon size={16} className={active ? '' : 'text-rascal-dim'} />
                    {label}
                  </button>
                )
              })}
            </div>
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
          <div className="min-h-0 flex-1 overflow-y-auto p-6 scroll-thin">
            <div className="mx-auto w-full max-w-2xl space-y-6">
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
                          hint: 'accent rail · day',
                          Icon: Sun,
                          rail: '#443b85',
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
                      <ColorPicker
                        value={settings.accent ?? (settings.theme === 'light' ? '#7a4ff0' : '#7c6cff')}
                        onChange={(hex) => setSettings({ accent: hex })}
                        label="Custom accent color"
                        labeled
                      />
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

                  {/* App-wide background: standard theme surfaces, frosted
                      acrylic blur, your own image, or an ASCII animation. */}
                  <div className="mt-3 border-t border-rascal-line p-1.5 pt-3">
                    <p className="mb-2 px-1 text-xs font-semibold text-rascal-dim">
                      App background
                    </p>
                    <BackgroundSettings />
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
                hint="Local-only protections, configured and stored on this PC."
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
    </div>
  )
}

type Diag = ReturnType<typeof import('../lib/session').diagnostics>

// ── App background ────────────────────────────────────────────────────────
// Four looks behind the whole window. Acrylic is the real Windows effect:
// the window goes truly transparent and the desktop shows through, blurred
// by the OS — no dim layer. Browser builds fall back to CSS blobs. Panels
// stay readable in every mode (App.tsx applies the glass classes; the
// canvas modes render in AppBackground).

const BG_MODES: Array<{
  id: 'standard' | 'acrylic' | 'image' | 'ascii'
  label: string
  hint: string
}> = [
  { id: 'standard', label: 'Standard', hint: 'normal' },
  { id: 'acrylic', label: 'Acrylic', hint: 'see-through' },
  { id: 'image', label: 'Image', hint: 'your picture' },
  { id: 'ascii', label: 'ASCII', hint: 'moving letters' },
]

/** Downscale an image file to a JPEG data URL that fits localStorage. */
async function fileToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const max = 1280
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.75)
}

/** Live look at how the chosen background composes — updates as you tweak,
 *  so nobody has to close the modal just to check if a wallpaper "looks good". */
function BackgroundPreview() {
  const settings = useApp((s) => s.settings)
  const { bgMode, bgImage, bgBlur, bgAscii } = settings
  const [baked, setBaked] = useState<string | null>(null)
  useEffect(() => {
    if (!bgImage) {
      setBaked(null)
      return
    }
    let cancelled = false
    bakeWallpaper(bgImage, bgBlur)
      .then((url) => !cancelled && setBaked(url))
      .catch(() => !cancelled && setBaked(bgImage))
    return () => {
      cancelled = true
    }
  }, [bgImage, bgBlur])
  const showImage = !!baked && (bgMode === 'image' || bgMode === 'ascii')
  if (bgMode === 'standard') return null
  return (
    <div
      data-testid="bg-preview"
      aria-label="Live background preview"
      className="relative mb-3 h-40 overflow-hidden rounded-xl border border-rascal-line"
    >
      {showImage && (
        <div
          className="absolute inset-[-16px] bg-cover bg-center"
          style={{ backgroundImage: `url("${baked}")` }}
        />
      )}
      {bgMode === 'acrylic' && (
        <div
          className="absolute inset-[-24px]"
          style={{
            background:
              'radial-gradient(16rem 16rem at 18% 12%, rgb(124 108 255 / 0.35), transparent 60%),' +
              'radial-gradient(14rem 14rem at 82% 24%, rgb(76 196 255 / 0.28), transparent 62%),' +
              'radial-gradient(18rem 18rem at 62% 88%, rgb(167 139 250 / 0.3), transparent 58%),' +
              'radial-gradient(12rem 12rem at 10% 82%, rgb(255 122 217 / 0.22), transparent 60%)',
            filter: `blur(${Math.max(10, bgBlur) / 2}px) saturate(1.15)`,
          }}
        />
      )}
      {bgMode === 'ascii' && <DitherBackground variant={bgAscii as AsciiStyle} />}
      {bgMode === 'ascii' && bgImage && <div className="absolute inset-0 bg-rascal-bg/35" />}
      <div className="absolute inset-0 bg-rascal-bg/45" />
      {/* Mini app mock: rail + chat panel, translucent like the glass mode. */}
      <div className="absolute inset-x-4 bottom-3 top-8 flex gap-2">
        <div className="w-10 rounded-lg bg-rascal-rail/85 p-1.5">
          <div className="mx-auto h-5 w-5 rounded-full bg-white/25" />
          <div className="mt-1.5 h-1.5 rounded bg-white/15" />
          <div className="mt-1 h-1.5 rounded bg-white/15" />
        </div>
        <div className="min-w-0 flex-1 rounded-lg bg-rascal-panel/85 p-2.5">
          <div className="h-2 w-1/3 rounded bg-rascal-accent/70" />
          <div className="mt-2 h-2 w-2/3 rounded bg-white/20" />
          <div className="mt-1.5 h-2 w-1/2 rounded bg-white/15" />
          <div className="mt-1.5 h-2 w-3/5 rounded bg-white/15" />
        </div>
      </div>
      <span className="absolute left-3 top-2 text-[10px] font-bold uppercase tracking-widest text-rascal-dim">
        Live preview
      </span>
    </div>
  )
}

function BackgroundSettings() {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const [err, setErr] = useState<string | null>(null)
  const imgRef = useRef<HTMLInputElement>(null)

  async function onImage(files: FileList | null) {
    setErr(null)
    if (!files || files.length === 0) return
    try {
      const data = await fileToDataUrl(files[0])
      setSettings({ bgImage: data, bgMode: 'image' })
    } catch {
      setErr('Could not read that image — try a png/jpg.')
    } finally {
      if (imgRef.current) imgRef.current.value = ''
    }
  }

  return (
    <div className="p-1.5">
      <BackgroundPreview />
      <div className="grid grid-cols-2 gap-2">
        {BG_MODES.map((m) => {
          const active = settings.bgMode === m.id
          return (
            <button
              key={m.id}
              onClick={() => setSettings({ bgMode: m.id })}
              aria-pressed={active}
              data-testid={`bg-mode-${m.id}`}
              className={`rounded-lg border p-2 text-left transition-colors ${
                active
                  ? 'border-rascal-accent bg-rascal-accent/10'
                  : 'border-rascal-line hover:border-rascal-dim'
              }`}
            >
              <div className={`text-sm ${active ? 'font-semibold' : ''}`}>{m.label}</div>
              <div className="text-[11px] text-rascal-dim">{m.hint}</div>
            </button>
          )
        })}
      </div>

      {/* Only image mode exposes a blur slider: acrylic is blurred by
          Windows itself, at a strength the user can't (and needn't) tune. */}
      {settings.bgMode === 'image' && (
        <div className="mt-3 px-1">
          <label className="block text-xs text-rascal-dim">
            Blur — {settings.bgBlur}px
          </label>
          <input
            type="range"
            min={0}
            max={24}
            step={1}
            value={settings.bgBlur}
            onChange={(e) => setSettings({ bgBlur: Number(e.target.value) })}
            aria-label="Background blur strength"
            className="mt-1 w-full accent-rascal-accent"
          />
        </div>
      )}

      {settings.bgMode === 'image' && (
        <div className="mt-2 px-1">
          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onImage(e.target.files)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => imgRef.current?.click()}
              className="rounded-lg bg-rascal-accent px-3 py-1.5 text-xs font-semibold"
            >
              {settings.bgImage ? 'Change image' : 'Choose image'}
            </button>
            {settings.bgImage && (
              <>
                <span
                  className="h-8 w-14 shrink-0 rounded-md border border-rascal-line bg-cover bg-center"
                  style={{ backgroundImage: `url("${settings.bgImage}")` }}
                  aria-hidden="true"
                />
                <button
                  onClick={() => setSettings({ bgImage: null, bgMode: 'standard' })}
                  className="text-xs text-rascal-dim transition-colors hover:text-rascal-text"
                >
                  Remove
                </button>
              </>
            )}
          </div>
          {err && <p className="mt-1 text-[11px] text-red-300">{err}</p>}
          <p className="mt-1 text-[11px] text-rascal-dim">
            Kept on this device only — downscaled and stored locally, never synced.
          </p>
        </div>
      )}

      {settings.bgMode === 'ascii' && (
        <div className="mt-3 px-1">
          <label className="block text-xs text-rascal-dim">ASCII animation</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(
              [
                { id: 'drift', label: 'Drift' },
                { id: 'stars', label: 'Stars' },
                { id: 'rain', label: 'Rain' },
              ] as const
            ).map((a) => (
              <button
                key={a.id}
                onClick={() => setSettings({ bgAscii: a.id })}
                aria-pressed={settings.bgAscii === a.id}
                className={`rounded-lg border px-2 py-1.5 text-xs ${
                  settings.bgAscii === a.id
                    ? 'border-rascal-accent bg-rascal-accent/10 font-semibold'
                    : 'border-rascal-line hover:border-rascal-dim'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Phone pairing ─────────────────────────────────────────────────────────
// The webapp (Tailscale / LAN / any static host) shows a QR of its own URL.
// Scan it with the phone camera, the same app opens in the mobile browser.
// "Pair my phone" upgrades the QR to a one-time pairing link: the phone
// receives the whole account (identity, friends, servers, chats) streamed
// directly from this device — no backup file juggling, nothing on servers.

function PhonePairCard() {
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  // Desktop app: URL of its own built-in phone server (null = not running).
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null)
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [phoneErr, setPhoneErr] = useState<string | null>(null)
  const isDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  const [pairing, setPairing] = useState(false)
  const [status, setStatus] = useState<{ phase: 'waiting' | 'sending' | 'done' | 'error'; progress?: number; detail?: string } | null>(null)
  // The URL the phone should open: our built-in server (desktop app) or the
  // address this webapp is already hosted at (plain browser).
  const [appUrl, setAppUrl] = useState('')
  // ONE pairing code per card lifetime: the QR never switches under the
  // user (0.1.54 and before swapped the code the moment "Pair" was pressed,
  // so a phone that had just scanned the plain URL had to start over).
  const linkKeyRef = useRef<string | null>(null)
  const stopSenderRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopSenderRef.current?.(), [])

  async function ensurePairingQr(base: string) {
    const { createPairingLink, runPairingSender } = await import('../lib/pairing')
    const link = createPairingLink(base || undefined, linkKeyRef.current ?? undefined)
    linkKeyRef.current = link.key
    setUrl(link.url)
    try {
      setQrSvg(await renderQrSvg(link.url))
    } catch {
      // QR is decorative — the URL text below always carries the link.
    }
    if (!stopSenderRef.current) {
      // Arm immediately: the code on screen is live from the start, and it
      // STAYS the same across re-arms ("Pair again" reuses this exact key).
      stopSenderRef.current = runPairingSender(link.key, (s) => {
        setStatus(s)
        if (s.phase === 'done' || s.phase === 'error') setPairing(false)
      })
      setPairing(true)
      setStatus(null)
    }
  }

  useEffect(() => {
    if (isDesktopApp) {
      // The server keeps running across settings sessions — restore its URL.
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke<string | null>('phone_server_status'))
        .then((u) => {
          if (u) {
            setAppUrl(u)
            void ensurePairingQr(u)
          }
        })
        .catch(() => {})
      return
    }
    const origin = window.location.origin + window.location.pathname
    setAppUrl(origin)
    void ensurePairingQr(origin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopApp])

  async function togglePhoneServer() {
    setPhoneBusy(true)
    setPhoneErr(null)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      if (phoneUrl) {
        stopSenderRef.current?.()
        stopSenderRef.current = null
        setPairing(false)
        setStatus(null)
        await invoke('phone_server_stop')
        setPhoneUrl(null)
      } else {
        const u = await invoke<string>('phone_server_start')
        setPhoneUrl(u)
        setAppUrl(u)
        await ensurePairingQr(u)
      }
    } catch (e) {
      setPhoneErr(e instanceof Error ? e.message : String(e))
    } finally {
      setPhoneBusy(false)
    }
  }

  async function startPairing() {
    // Re-arm with the SAME code — the QR on screen never changes.
    stopSenderRef.current?.()
    stopSenderRef.current = null
    setStatus(null)
    setPairing(true)
    const { createPairingLink, runPairingSender } = await import('../lib/pairing')
    const link = createPairingLink(appUrl || undefined, linkKeyRef.current ?? undefined)
    linkKeyRef.current = link.key
    stopSenderRef.current = runPairingSender(link.key, (s) => {
      setStatus(s)
      if (s.phase === 'done' || s.phase === 'error') setPairing(false)
    })
  }

  const pairUi = (
    <>
      <div className="mt-2 flex items-start gap-3">
            <div
              className="h-[120px] w-[120px] shrink-0 rounded-lg bg-rascal-bg p-2 [&>svg]:h-full [&>svg]:w-full"
              // QR generated locally from the one-time pairing link — no
              // network call, and it never changes while this card lives.
              dangerouslySetInnerHTML={{ __html: qrSvg ?? '' }}
              aria-label="QR code with one-time pairing link"
              role="img"
            />
            {pairing ? (
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-rascal-dim">
                  This one code stays live. Scan it with the phone camera — the
                  app opens and receives your whole account from this device:
                  identity, friends, servers and chats. Nothing goes through a
                  server.
                </p>
                {status && (
                  <p
                    data-testid="pairing-status"
                    className={`mt-2 text-xs font-semibold ${
                      status.phase === 'error' ? 'text-rascal-amber' : status.phase === 'done' ? 'text-rascal-green' : 'text-rascal-text'
                    }`}
                  >
                    {status.phase === 'waiting' && 'Waiting for your phone…'}
                    {status.phase === 'sending' && `Sending — ${Math.round((status.progress ?? 0) * 100)}%`}
                    {status.phase === 'done' && 'Done — account copied to your phone.'}
                    {status.phase === 'error' && status.detail}
                  </p>
                )}
                {status?.phase === 'sending' && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-rascal-accent transition-all duration-200"
                      style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }}
                    />
                  </div>
                )}
                <p className="mt-2 truncate font-mono text-[10px] text-rascal-dim">{url}</p>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                {/* Final pairing states must stay visible after pairing ends —
                    the v0.1.48 give-up message used to vanish instantly here
                    because setPairing(false) unmounted the status line. */}
                {status?.phase === 'error' && (
                  <p data-testid="pairing-status" className="mb-2 text-xs font-semibold text-rascal-amber">
                    {status.detail}
                  </p>
                )}
                {status?.phase === 'done' && (
                  <p data-testid="pairing-status" className="mb-2 text-xs font-semibold text-rascal-green">
                    Done — account copied to your phone.
                  </p>
                )}
                <ol className="list-decimal space-y-1 pl-4 text-[11px] text-rascal-dim">
                  <li>Point your phone's camera at the QR — pairing arms itself.</li>
                  <li>
                    The phone chooses: take this computer's account, or set up
                    as new. Identity, friends, servers and chats stream straight
                    from this PC — no backup file, no server.
                  </li>
                  <li>Same Tailscale/LAN network required — pairing travels P2P.</li>
                </ol>
                <button
                  data-testid="pair-phone-button"
                  onClick={() => void startPairing()}
                  className="mt-2 rounded-lg bg-rascal-accent px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-rascal-accent/30 transition-all duration-150 ease-smooth hover:brightness-110"
                >
                  {status?.phase === 'error' ? 'Pair again — same QR' : 'Pair my phone'}
                </button>
              </div>
            )}
          </div>
          {!pairing && url && (
            <p className="mt-2 truncate font-mono text-[10px] text-rascal-dim">{url}</p>
          )}
  </>
  )

  return (
    <div data-testid="phone-pair" className="rounded-lg border border-rascal-line p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Open on your phone</p>
        {isDesktopApp && (
          <button
            data-testid="phone-server-toggle"
            onClick={() => void togglePhoneServer()}
            disabled={phoneBusy}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ease-smooth disabled:opacity-50 ${
              phoneUrl
                ? 'bg-white/5 text-rascal-text hover:bg-white/10'
                : 'bg-rascal-accent text-white shadow-lg shadow-rascal-accent/30 hover:brightness-110'
            }`}
          >
            {phoneBusy ? 'Working…' : phoneUrl ? 'Stop phone server' : 'Start phone server'}
          </button>
        )}
      </div>
      {isDesktopApp ? (
        <>
          <p className="mt-1 text-[11px] text-rascal-dim">
            {phoneUrl
              ? 'Serving the web app from this PC — over your tailnet (100.x…) or LAN. The QR below is the pairing code; scanning it arms the transfer and the phone chooses which account to use.'
              : 'Runs a tiny built-in web server on this PC and points the QR at it over Tailscale/LAN — no manual hosting, no tools. The phone must be on the same tailnet or Wi-Fi.'}
          </p>
          {phoneErr && (
            <p data-testid="phone-server-error" className="mt-1 text-[11px] text-rascal-amber">
              {phoneErr}
            </p>
          )}
          {phoneUrl && pairUi}
        </>
      ) : (
        pairUi
      )}
    </div>
  )
}

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
        <PhonePairCard />
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
