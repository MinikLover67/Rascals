import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { BANNER_PRESETS, NAME_STYLES, nameStyleProps } from '../lib/namestyles'
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

// Curated theme presets (wheel below covers anything else).
const THEME_SWATCHES = [
  '#7c6cff',
  '#3d9bff',
  '#3ddcff',
  '#3ddc84',
  '#b8f135',
  '#ffd76a',
  '#ff9a3c',
  '#ff4d6d',
  '#ff7ab8',
  '#ff5d5d',
]
import StyledName from './StyledName'

// Own profile studio: avatar (GIFs animate), banner (preset/image/GIF),
// theme colors, name style — all with a live preview card. Applies instantly.
export default function CustomizeModal({ onClose }: { onClose: () => void }) {
  const identity = useApp((s) => s.identity)
  const profile = useApp((s) => s.profile)
  const setProfile = useApp((s) => s.setProfile)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  // Staged draft: nothing touches the live profile until Save. Uploaded
  // blobs are tracked so discarded ones can be reaped, never orphaned.
  const [draft, setDraft] = useState(() => profile)
  const sessionBlobs = useRef<Set<string>>(new Set())
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)

  const avatarUrl = useStoredImage('avatar', draft.avatar?.id ?? null)
  const bannerUrl = useStoredImage(
    'banner',
    draft.banner?.kind === 'image' ? draft.banner.id : null,
  )

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
    reapOrphans(collectIds(draft))
    setConfirmDiscard(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  function discard() {
    reapOrphans(collectIds(profile))
    setDraft(profile)
    setConfirmDiscard(false)
    setErr(null)
  }

  function handleClose() {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    if (dirty) discard()
    onClose()
  }

  async function onAvatarFile(files: FileList | null) {
    if (!files || files.length === 0) return
    setErr(null)
    setBusy(true)
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
    setErr(null)
    setBusy(true)
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

  function removeAvatar() {
    setDraft((d) => ({ ...d, avatar: null }))
  }

  function removeBanner() {
    setDraft((d) => ({ ...d, banner: null }))
  }

  const bannerStyle =
    draft.banner?.kind === 'image' && bannerUrl
      ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : draft.banner?.kind === 'gradient'
        ? { background: draft.banner.value }
        : undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={handleClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-rascal-line bg-rascal-panel p-5 scroll-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold">
            Customize profile
            <span
              title="Profile customization is alpha: still working on it, looks may shift between updates."
              className="rounded bg-rascal-amber/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rascal-amber"
            >
              ALPHA
            </span>
          </h2>
          <button
            onClick={handleClose}
            title={dirty && !confirmDiscard ? 'Discard unsaved changes' : 'Close'}
            aria-label="Close customization"
            className="rounded-md p-1.5 text-rascal-dim hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        {dirty && !confirmDiscard && (
          <p className="mt-1 text-[11px] text-rascal-amber">You have unsaved changes — closing discards them.</p>
        )}
        {confirmDiscard && (
          <p className="mt-1 text-[11px] text-rascal-amber">Tap ✕ once more to discard your changes.</p>
        )}

        <div className="mt-3 overflow-hidden rounded-xl border border-rascal-line">
          <div className="h-20 w-full bg-rascal-rail" style={bannerStyle} />
          <div
            className="flex items-center gap-3 px-3 pb-3 text-white"
            style={{
              background: `linear-gradient(90deg, ${draft.themePrimary}, ${draft.themeAccent})`,
            }}
          >
            <span className="-mt-5 rounded-full ring-4 ring-white/40">
              <Avatar url={avatarUrl} name={identity?.name ?? '?'} size={48} />
            </span>
            <StyledName
              name={identity?.name ?? '?'}
              styleId={draft.nameStyle}
              className="truncate text-base font-bold"
            />
          </div>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Avatar (GIFs animate)
        </div>
        <div className="mt-1.5 flex gap-2">
          <input ref={avatarRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => void onAvatarFile(e.target.files)} />
          <button
            onClick={() => avatarRef.current?.click()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
          >
            <Upload size={13} />
            Upload avatar
          </button>
          {draft.avatar && (
            <button
              onClick={removeAvatar}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-rascal-dim hover:text-white"
            >
              Remove
            </button>
          )}
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Banner
        </div>
        <div className="mt-1.5 grid grid-cols-6 gap-1.5">
          {BANNER_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setDraft((d) => ({ ...d, banner: { kind: 'gradient', value: p.css } }))}
              title={p.label}
              aria-label={`Banner ${p.label}`}
              className={`h-9 rounded-lg border-2 ${
                draft.banner?.kind === 'gradient' && draft.banner.value === p.css
                  ? 'border-rascal-accent'
                  : 'border-transparent hover:border-rascal-dim'
              }`}
              style={{ background: p.css }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex gap-2">
          <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => void onBannerFile(e.target.files)} />
          <button
            onClick={() => bannerRef.current?.click()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
          >
            <Upload size={13} />
            Upload banner (GIFs animate)
          </button>
          {draft.banner && (
            <button
              onClick={removeBanner}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-rascal-dim hover:text-white"
            >
              Remove
            </button>
          )}
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Profile theme
        </div>
        <p className="mt-1 text-[11px] text-rascal-dim">
          Paints your profile card background. Pick a preset or open the wheel.
        </p>
        <div className="mt-1.5 flex gap-2">
          {(
            [
              ['themePrimary', 'Primary'],
              ['themeAccent', 'Accent'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex-1 rounded-lg border border-rascal-line px-3 py-2">
              <div className="text-xs text-rascal-dim">{label}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {THEME_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraft((d) => ({ ...d, [key]: c }))}
                    title={c}
                    aria-label={`${label} ${c}`}
                    className={`h-6 w-6 rounded-md border-2 ${
                      draft[key].toLowerCase() === c ? 'border-white' : 'border-transparent hover:border-rascal-dim'
                    }`}
                    style={{ background: c }}
                  />
                ))}
                <label
                  title="Custom color (color wheel)"
                  aria-label={`Custom ${label.toLowerCase()} color`}
                  className="relative flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-rascal-dim/50 hover:border-rascal-dim"
                >
                  <span className="pointer-events-none text-[12px] leading-none text-rascal-dim">+</span>
                  <input
                    type="color"
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              </div>
              <div className="mt-1 font-mono text-[11px] text-rascal-dim">{draft[key]}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Display name style
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {NAME_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setDraft((d) => ({ ...d, nameStyle: s.id }))}
              title={s.label}
              className={`rounded-lg border px-2 py-2 text-sm font-bold ${
                draft.nameStyle === s.id
                  ? 'border-rascal-accent bg-rascal-accent/15'
                  : 'border-rascal-line hover:border-rascal-dim'
              }`}
            >
              <span style={nameStyleProps(s.id)}>Aa</span>
              <span className="mt-1 block text-[10px] font-normal text-rascal-dim">{s.label}</span>
            </button>
          ))}
        </div>

        {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
        {dirty && (
          <div className="sticky bottom-0 mt-3 flex items-center gap-2 rounded-xl border border-rascal-accent/40 bg-rascal-bg p-2">
            <span className="flex-1 px-1 text-xs text-rascal-dim">Unsaved look changes</span>
            <button
              onClick={discard}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-rascal-dim hover:text-white"
            >
              Reset
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-rascal-accent px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {savedFlash ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        )}
        <p className="mt-3 text-[11px] text-rascal-dim">
          Friends see your look when they open your profile (they must be online once to fetch it).
        </p>
      </div>
    </div>
  )
}
