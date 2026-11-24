import { useEffect, useRef, useState } from 'react'
import {
  AlignLeft,
  CircleUser,
  Palette,
  RectangleHorizontal,
  Type,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  BANNER_PRESETS,
  NAME_STYLES,
  nameStyleProps,
  encodeCustomNameStyle,
  decodeCustomNameStyle,
} from '../lib/namestyles'
import {
  dropAvatar,
  dropBanner,
  storeAvatar,
  storeBanner,
  type StoredImage,
} from '../lib/profile'
import { useApp } from '../store/app'
import { inkOnGradient } from '../lib/color'
import Avatar from './Avatar'
import ColorPicker from './ColorPicker'
import { useStoredImage } from './useStoredImage'
import StyledName from './StyledName'

const THEME_SWATCHES = [
  '#7c6cff', '#3d9bff', '#3ddcff', '#3ddc84', '#b8f135',
  '#ffd76a', '#ff9a3c', '#ff4d6d', '#ff7ab8', '#ff5d5d',
]

type Tab = 'bio' | 'avatar' | 'banner' | 'theme' | 'name'

// Vertical rail entries — mirrors the settings modal's nav so both modals
// read as one design system (icons + solid active state, no tab underline).
const TABS: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'bio', label: 'Bio', icon: AlignLeft },
  { id: 'avatar', label: 'Avatar', icon: CircleUser },
  { id: 'banner', label: 'Banner', icon: RectangleHorizontal },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'name', label: 'Name style', icon: Type },
]

export default function CustomizeModal({ onClose }: { onClose: () => void }) {
  const identity = useApp((s) => s.identity)
  const profile = useApp((s) => s.profile)
  const setProfile = useApp((s) => s.setProfile)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [tab, setTab] = useState<Tab>('avatar')
  const avatarRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(() => profile)
  const sessionBlobs = useRef<Set<string>>(new Set())
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)

  const avatarUrl = useStoredImage('avatar', draft.avatar?.id ?? null)
  const bannerUrl = useStoredImage(
    'banner',
    draft.banner?.kind === 'image' ? draft.banner.id : null,
  )

  // Custom name style, simplified: two colors + optional glow. The old
  // nine-knob builder (angle/tracking/weight/font/…) looked like a design
  // tool bolted onto a chat app — presets cover the fancy cases now.
  const [custom, setCustom] = useState<{ from: string; to: string; glow: boolean }>(() => {
    const cur = typeof profile.nameStyle === 'string'
      ? decodeCustomNameStyle(profile.nameStyle)
      : null
    return {
      from: cur?.from ?? profile.themePrimary,
      to: cur?.to ?? profile.themeAccent,
      glow: !!cur?.glow,
    }
  })
  // Re-seed when the draft's style changes (e.g. preset → edit custom again).
  useEffect(() => {
    if (typeof draft.nameStyle === 'string' && draft.nameStyle.startsWith('custom:')) {
      const cur = decodeCustomNameStyle(draft.nameStyle)
      if (cur) setCustom({ from: cur.from, to: cur.to, glow: !!cur.glow })
    }
  }, [draft.nameStyle])

  function applyCustom() {
    const id = encodeCustomNameStyle({
      from: custom.from,
      to: custom.to,
      angle: 100,
      glow: custom.glow ? custom.from : '',
      glowSize: custom.glow ? 14 : 0,
    })
    setDraft((d) => ({ ...d, nameStyle: id }))
  }

  function reapOrphans(keep: Set<string>) {
    const known = new Set<string>(sessionBlobs.current)
    const old = profile.avatar ? [profile.avatar.id] : []
    if (profile.banner?.kind === 'image') old.push(profile.banner.id)
    for (const id of [...known, ...old]) {
      if (keep.has(id)) continue
      if (id.startsWith('av-')) void dropAvatar(id)
      else if (id.startsWith('bn-')) void dropBanner(id)
    }
    sessionBlobs.current.clear()
  }
  function collectIds(p: typeof draft): Set<string> {
    const s = new Set<string>()
    if (p.avatar) s.add(p.avatar.id)
    if (p.banner?.kind === 'image') s.add(p.banner.id)
    return s
  }
  function save() {
    setProfile(draft)
    setDraft(useApp.getState().profile)
    reapOrphans(collectIds(useApp.getState().profile))
    setConfirmDiscard(false)
    setSavedFlash(true)
    void import('../lib/session').then((m) => m.broadcastOwnProfile()).catch(() => {})
    setTimeout(() => setSavedFlash(false), 2000)
  }
  function discard() {
    reapOrphans(collectIds(profile))
    setDraft(profile)
    setConfirmDiscard(false)
    setErr(null)
  }
  function handleClose() {
    if (dirty && !confirmDiscard) { setConfirmDiscard(true); return }
    if (dirty) discard()
    onClose()
  }
  async function onAvatarFile(files: FileList | null) {
    if (!files || files.length === 0) return
    setErr(null); setBusy(true)
    try {
      const stored: StoredImage = await storeAvatar(files[0])
      sessionBlobs.current.add(stored.id)
      setDraft((d) => ({ ...d, avatar: stored }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not use that image.')
    } finally {
      setBusy(false)
      if (avatarRef.current) avatarRef.current.value = ''
    }
  }
  async function onBannerFile(files: FileList | null) {
    if (!files || files.length === 0) return
    setErr(null); setBusy(true)
    try {
      const stored: StoredImage = await storeBanner(files[0])
      sessionBlobs.current.add(stored.id)
      setDraft((d) => ({ ...d, banner: { kind: 'image', id: stored.id, mime: stored.mime } }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not use that image.')
    } finally {
      setBusy(false)
      if (bannerRef.current) bannerRef.current.value = ''
    }
  }
  function removeAvatar() { setDraft((d) => ({ ...d, avatar: null })) }
  function removeBanner() { setDraft((d) => ({ ...d, banner: null })) }

  const bannerStyle =
    draft.banner?.kind === 'image' && bannerUrl
      ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : draft.banner?.kind === 'gradient'
        ? { background: draft.banner.value }
        : undefined


  const customPreviewStyle = nameStyleProps(
    encodeCustomNameStyle({
      from: custom.from,
      to: custom.to,
      angle: 100,
      glow: custom.glow ? custom.from : '',
      glowSize: custom.glow ? 14 : 0,
    }),
  )

  // Extract the solid hex from a "solid" banner gradient (from==to).
  const solidBanner = (() => {
    if (draft.banner?.kind !== 'gradient') return null
    const m = /^linear-gradient\(120deg, (#[0-9a-fA-F]{6}), \1\)$/.exec(draft.banner.value)
    return m ? m[1] : null
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-0 sm:p-3" onClick={handleClose}>
      <div className="grid h-[100dvh] max-h-none w-full max-w-4xl grid-cols-1 overflow-hidden rounded-none border border-rascal-line bg-rascal-panel sm:h-auto sm:max-h-[90vh] sm:rounded-2xl md:grid-cols-[230px_1fr]" onClick={(e) => e.stopPropagation()}>
        {/* Vertical nav rail — same pattern as the settings modal */}
        <nav className="flex flex-col border-b border-rascal-line p-3 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Customize profile</h2>
            <button onClick={handleClose} className="rounded-md p-1.5 text-rascal-dim hover:bg-white/5" aria-label="Close customize"><X size={16} /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1 md:flex-col md:gap-0.5">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-pressed={active}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
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
          {dirty && !confirmDiscard && <p className="mt-3 px-1 text-[11px] text-rascal-amber">Unsaved changes.</p>}
          {confirmDiscard && <p className="mt-3 px-1 text-[11px] text-rascal-amber">Tap ✕ once more to discard.</p>}
        </nav>

        {/* Editor */}
        <div className="flex min-h-0 flex-col overflow-y-auto scroll-thin">
          {/* Compact live preview strip — always visible above the controls */}
          <div className="shrink-0 overflow-hidden border-b border-rascal-line">
            <div className="h-14 w-full bg-rascal-rail" style={bannerStyle} />
            <div className="flex items-center gap-3 px-4 pb-3 pt-1" style={{ background: `linear-gradient(90deg, ${draft.themePrimary}, ${draft.themeAccent})`, color: inkOnGradient(draft.themePrimary, draft.themeAccent) }}>
              <span className="-mt-7 rounded-full ring-4 ring-white/40">
                <Avatar url={avatarUrl} name={identity?.name ?? '?'} size={52} />
              </span>
              <div className="min-w-0">
                <StyledName name={identity?.name ?? '?'} styleId={draft.nameStyle} className="truncate text-base font-bold" />
                <div className="text-[10px] opacity-75">Live preview — friends see this look</div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-4">
            {tab === 'bio' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">About you</div>
                <textarea
                  value={draft.bio}
                  onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value.slice(0, 200) }))}
                  rows={4}
                  placeholder="A few words about you. Shows on your profile card."
                  className="w-full resize-none rounded-lg border border-rascal-line bg-rascal-bg px-3 py-2 text-sm outline-none transition-colors duration-150 ease-smooth focus:border-rascal-accent"
                />
                <div className="flex items-center justify-between text-[11px] text-rascal-dim">
                  <span>Shows under your name on the profile card, for you and your friends.</span>
                  <span>{draft.bio.length}/200</span>
                </div>
              </div>
            )}

            {tab === 'avatar' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">Avatar (GIFs animate)</div>
                <div className="flex gap-2">
                  <input ref={avatarRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => void onAvatarFile(e.target.files)} />
                  <button onClick={() => avatarRef.current?.click()} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"><Upload size={13} /> Upload avatar</button>
                  {draft.avatar && <button onClick={removeAvatar} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-rascal-dim hover:text-rascal-text">Remove</button>}
                </div>
                <div className="rounded-xl border border-rascal-line bg-rascal-bg/40 p-3 text-[11px] text-rascal-dim">
                  <div className="mb-1 font-semibold text-rascal-text">Crop preview</div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full ring-2 ring-rascal-line"><Avatar url={avatarUrl} name={identity?.name ?? '?'} size={48} /></span>
                    <span>Your avatar is clipped to a circle everywhere it appears.</span>
                  </div>
                </div>
                <p className="text-[11px] text-rascal-dim">JPEG/PNG/WebP are resized automatically. GIFs stay animated (up to 4 MB).</p>
              </div>
            )}

            {tab === 'banner' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">Banner presets</div>
                <div className="grid grid-cols-6 gap-1.5">
                  {BANNER_PRESETS.map((p) => (
                    <button key={p.id} onClick={() => setDraft((d) => ({ ...d, banner: { kind: 'gradient', value: p.css } }))} title={p.label} className={`h-9 rounded-lg border-2 ${draft.banner?.kind === 'gradient' && draft.banner.value === p.css ? 'border-rascal-accent' : 'border-transparent hover:border-rascal-dim'}`} style={{ background: p.css }} />
                  ))}
                </div>
                <div className="rounded-lg border border-rascal-line px-3 py-2">
                  <div className="text-xs text-rascal-dim">Banner color</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ColorPicker
                      value={solidBanner ?? '#7c6cff'}
                      onChange={(hex) => setDraft((d) => ({ ...d, banner: { kind: 'gradient', value: `linear-gradient(120deg, ${hex}, ${hex})` } }))}
                      label="Solid banner color"
                      compact
                    />
                    <span className="text-[11px] text-rascal-dim">Solid color background</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => void onBannerFile(e.target.files)} />
                  <button onClick={() => bannerRef.current?.click()} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"><Upload size={13} /> Upload banner (GIFs animate)</button>
                  {draft.banner && <button onClick={removeBanner} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-rascal-dim hover:text-rascal-text">Remove</button>}
                </div>
                <p className="text-[11px] text-rascal-dim">JPEG/PNG/WebP are resized automatically. GIFs stay animated (up to 8 MB).</p>
              </div>
            )}

            {tab === 'theme' && (
              <div className="space-y-3">
                <p className="text-[11px] text-rascal-dim">Paints your profile card. Pick presets or custom colors.</p>
                <div className="flex flex-wrap gap-1.5">
                  {THEME_SWATCHES.map((c) => (
                    <button key={c} onClick={() => setDraft((d) => ({ ...d, themePrimary: c, themeAccent: c }))} title={c} className="h-7 w-7 rounded-md border border-transparent hover:scale-105" style={{ background: c }} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['themePrimary', 'themeAccent'] as const).map((key) => (
                    <div key={key} className="rounded-lg border border-rascal-line px-3 py-2">
                      <div className="text-xs text-rascal-dim">{key === 'themePrimary' ? 'Primary' : 'Accent'}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {THEME_SWATCHES.map((c) => (
                          <button key={c} onClick={() => setDraft((d) => ({ ...d, [key]: c }))} className={`h-5 w-5 rounded-md border-2 ${draft[key].toLowerCase() === c ? 'border-rascal-text' : 'border-transparent hover:border-rascal-dim'}`} style={{ background: c }} />
                        ))}
                        <ColorPicker value={draft[key]} onChange={(hex) => setDraft((d) => ({ ...d, [key]: hex }))} label={`Custom ${key === 'themePrimary' ? 'primary' : 'accent'}`} compact />
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-rascal-dim">{draft[key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'name' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">Built-in styles</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {NAME_STYLES.map((s) => (
                    <button key={s.id} onClick={() => setDraft((d) => ({ ...d, nameStyle: s.id }))} title={s.label} className={`rounded-lg border px-2 py-2 text-sm font-bold ${draft.nameStyle === s.id ? 'border-rascal-accent bg-rascal-accent/15' : 'border-rascal-line hover:border-rascal-dim'}`}>
                      <span style={nameStyleProps(s.id)}>Aa</span>
                      <span className="mt-1 block text-[10px] font-normal text-rascal-dim">{s.label}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-rascal-dim">Custom style</div>
                <div className="rounded-xl border border-rascal-line p-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <ColorPicker value={custom.from} onChange={(hex) => setCustom((c) => ({ ...c, from: hex }))} label="Gradient start" compact />
                    <ColorPicker value={custom.to} onChange={(hex) => setCustom((c) => ({ ...c, to: hex }))} label="Gradient end" compact />
                    <label className="flex items-center gap-1.5 text-xs text-rascal-dim">
                      <input type="checkbox" checked={custom.glow} onChange={(e) => setCustom((c) => ({ ...c, glow: e.target.checked }))} />
                      Glow
                    </label>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={customPreviewStyle} className="text-lg font-bold">Aa preview</span>
                    <button onClick={applyCustom} className="rounded-lg bg-rascal-accent px-3 py-1.5 text-xs font-semibold text-white">Use custom style</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {err && <p className="text-xs text-red-300">{err}</p>}
          {dirty && (
            <div className="flex items-center gap-2 rounded-xl border border-rascal-accent/40 bg-rascal-bg p-2">
              <span className="flex-1 px-1 text-xs text-rascal-dim">Unsaved look changes</span>
              <button onClick={discard} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-rascal-dim hover:text-rascal-text">Reset</button>
              <button onClick={save} disabled={busy} className="rounded-lg bg-rascal-accent px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{savedFlash ? 'Saved ✓' : 'Save'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}