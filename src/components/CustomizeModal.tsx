import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import {
  BANNER_PRESETS,
  NAME_STYLES,
  nameStyleProps,
  encodeCustomNameStyle,
} from '../lib/namestyles'
import {
  dropAvatar,
  dropBanner,
  storeAvatar,
  storeBanner,
  type StoredImage,
} from '../lib/profile'
import { useApp } from '../store/app'
import Avatar from './Avatar'
import { useStoredImage } from './useStoredImage'
import StyledName from './StyledName'

const THEME_SWATCHES = [
  '#7c6cff', '#3d9bff', '#3ddcff', '#3ddc84', '#b8f135',
  '#ffd76a', '#ff9a3c', '#ff4d6d', '#ff7ab8', '#ff5d5d',
]

type Tab = 'avatar' | 'banner' | 'theme' | 'name'

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

  // Custom name style scratchpad.
  const [custom, setCustom] = useState({
    from: '#7c6cff', to: '#3ddcff', angle: 90, glow: '#7c6cff',
    glowSize: 16, tracking: 0, weight: 700, animate: false,
    font: 'default' as 'default' | 'mono' | 'serif' | 'rounded',
  })
  // If the draft already uses a custom style, seed the scratchpad.
  useEffect(() => {
    if (typeof draft.nameStyle === 'string' && draft.nameStyle.startsWith('custom:')) {
      // best-effort decode via nameStyleProps? just keep current; editing starts from defaults
    }
  }, [draft.nameStyle])

  function applyCustom() {
    const id = encodeCustomNameStyle(custom)
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


  const customPreviewStyle = nameStyleProps(encodeCustomNameStyle(custom))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={handleClose}>
      <div className="grid max-h-[90vh] w-full max-w-4xl grid-cols-1 gap-4 overflow-hidden rounded-2xl border border-rascal-line bg-rascal-panel p-4 md:grid-cols-[300px_1fr]" onClick={(e) => e.stopPropagation()}>
        {/* Preview */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between md:hidden">
            <h2 className="text-base font-bold">Customize profile</h2>
            <button onClick={handleClose} className="rounded-md p-1.5 text-rascal-dim hover:bg-white/5"><X size={16} /></button>
          </div>
          <div className="overflow-hidden rounded-xl border border-rascal-line">
            <div className="h-24 w-full bg-rascal-rail" style={bannerStyle} />
            <div className="flex items-center gap-3 px-3 pb-3 pt-2 text-white" style={{ background: `linear-gradient(90deg, ${draft.themePrimary}, ${draft.themeAccent})` }}>
              <span className="-mt-6 rounded-full ring-4 ring-white/40">
                <Avatar url={avatarUrl} name={identity?.name ?? '?'} size={56} />
              </span>
              <div className="min-w-0">
                <StyledName name={identity?.name ?? '?'} styleId={draft.nameStyle} className="truncate text-base font-bold" />
                <div className="text-[10px] opacity-75">Preview of your profile card</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-rascal-line bg-rascal-bg/40 p-3 text-[11px] text-rascal-dim">
            <div className="mb-1 font-semibold text-rascal-text">Crop preview</div>
            <div className="flex items-center gap-3">
              <span className="rounded-full ring-2 ring-rascal-line"><Avatar url={avatarUrl} name={identity?.name ?? '?'} size={48} /></span>
              <span>Your avatar is clipped to a circle everywhere it appears.</span>
            </div>
          </div>
          <p className="text-[11px] text-rascal-dim">Friends see your look when they open your profile.</p>
        </div>

        {/* Editor */}
        <div className="flex min-h-0 flex-col">
          <div className="hidden items-center justify-between md:flex">
            <h2 className="text-base font-bold">Customize profile</h2>
            <button onClick={handleClose} className="rounded-md p-1.5 text-rascal-dim hover:bg-white/5"><X size={16} /></button>
          </div>
          {dirty && !confirmDiscard && <p className="mt-1 text-[11px] text-rascal-amber">Unsaved changes.</p>}
          {confirmDiscard && <p className="mt-1 text-[11px] text-rascal-amber">Tap ✕ once more to discard.</p>}

          <div className="mt-3 flex gap-1 border-b border-rascal-line">
            {(['avatar', 'banner', 'theme', 'name'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-semibold capitalize ${tab === t ? 'border-b-2 border-rascal-accent text-rascal-text' : 'text-rascal-dim'}`}>{t === 'name' ? 'Name style' : t}</button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-3 scroll-thin">
            {tab === 'avatar' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-rascal-dim">Avatar (GIFs animate)</div>
                <div className="flex gap-2">
                  <input ref={avatarRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => void onAvatarFile(e.target.files)} />
                  <button onClick={() => avatarRef.current?.click()} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"><Upload size={13} /> Upload avatar</button>
                  {draft.avatar && <button onClick={removeAvatar} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-rascal-dim hover:text-rascal-text">Remove</button>}
                </div>
                <p className="text-[11px] text-rascal-dim">JPEG/PNG/WebP are resized to 256 px. GIFs are kept animated (max 2 MB).</p>
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
                    <input type="color" value={draft.banner?.kind === 'gradient' ? '#7c6cff' : '#7c6cff'} onChange={(e) => setDraft((d) => ({ ...d, banner: { kind: 'gradient', value: `linear-gradient(120deg, ${e.target.value}, ${e.target.value})` } }))} />
                    <span className="text-[11px] text-rascal-dim">Solid color background</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => void onBannerFile(e.target.files)} />
                  <button onClick={() => bannerRef.current?.click()} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"><Upload size={13} /> Upload banner (GIFs animate)</button>
                  {draft.banner && <button onClick={removeBanner} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-rascal-dim hover:text-rascal-text">Remove</button>}
                </div>
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
                          <button key={c} onClick={() => setDraft((d) => ({ ...d, [key]: c }))} className={`h-5 w-5 rounded-md border-2 ${draft[key].toLowerCase() === c ? 'border-white' : 'border-transparent hover:border-rascal-dim'}`} style={{ background: c }} />
                        ))}
                        <label className="relative flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-rascal-dim/50">
                          <span className="pointer-events-none text-[11px] text-rascal-dim">+</span>
                          <input type="color" value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                        </label>
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

                <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-rascal-dim">Custom style builder</div>
                <div className="rounded-xl border border-rascal-line p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-rascal-dim">From</label>
                    <input type="color" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                    <label className="text-[11px] text-rascal-dim">To</label>
                    <input type="color" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                    <label className="text-[11px] text-rascal-dim">Angle</label>
                    <input type="range" min={0} max={360} value={custom.angle} onChange={(e) => setCustom((c) => ({ ...c, angle: Number(e.target.value) }))} className="flex-1" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-rascal-dim">Glow</label>
                    <input type="color" value={custom.glow || '#000000'} onChange={(e) => setCustom((c) => ({ ...c, glow: e.target.value }))} />
                    <button onClick={() => setCustom((c) => ({ ...c, glow: '' }))} className="text-[11px] text-rascal-dim hover:text-rascal-text">none</button>
                    <label className="text-[11px] text-rascal-dim">Glow size</label>
                    <input type="range" min={0} max={40} value={custom.glowSize} onChange={(e) => setCustom((c) => ({ ...c, glowSize: Number(e.target.value) }))} className="flex-1" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-rascal-dim">Tracking</label>
                    <input type="range" min={-0.1} max={0.3} step={0.01} value={custom.tracking} onChange={(e) => setCustom((c) => ({ ...c, tracking: Number(e.target.value) }))} className="flex-1" />
                    <label className="text-[11px] text-rascal-dim">Weight</label>
                    <select value={custom.weight} onChange={(e) => setCustom((c) => ({ ...c, weight: Number(e.target.value) }))} className="rounded bg-rascal-bg px-1 py-0.5 text-xs">
                      <option value={400}>400</option><option value={600}>600</option><option value={700}>700</option><option value={800}>800</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-rascal-dim">Font</label>
                    <select value={custom.font} onChange={(e) => setCustom((c) => ({ ...c, font: e.target.value as typeof custom.font }))} className="rounded bg-rascal-bg px-1 py-0.5 text-xs">
                      <option value="default">Default</option><option value="mono">Mono</option><option value="serif">Serif</option><option value="rounded">Rounded</option>
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-rascal-dim">
                      <input type="checkbox" checked={custom.animate} onChange={(e) => setCustom((c) => ({ ...c, animate: e.target.checked }))} /> Animate
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