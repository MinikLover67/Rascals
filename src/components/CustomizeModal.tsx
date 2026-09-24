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
import StyledName from './StyledName'

// Own profile studio: avatar (GIFs animate), banner (preset/image/GIF),
// theme colors, name style — all with a live preview card. Applies instantly.
export default function CustomizeModal({ onClose }: { onClose: () => void }) {
  const identity = useApp((s) => s.identity)
  const profile = useApp((s) => s.profile)
  const setProfile = useApp((s) => s.setProfile)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  const avatarUrl = useStoredImage('avatar', profile.avatar?.id ?? null)
  const bannerUrl = useStoredImage(
    'banner',
    profile.banner?.kind === 'image' ? profile.banner.id : null,
  )

  async function onAvatarFile(files: FileList | null) {
    if (!files || files.length === 0) return
    setErr(null)
    setBusy(true)
    try {
      const prev = profile.avatar
      const stored: StoredImage = await storeAvatar(files[0])
      setProfile({ avatar: stored })
      if (prev) void dropAvatar(prev.id)
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
      const prev = profile.banner
      const stored: StoredImage = await storeBanner(files[0])
      setProfile({ banner: { kind: 'image', id: stored.id, mime: stored.mime } })
      if (prev?.kind === 'image') void dropBanner(prev.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not use that image.')
    } finally {
      setBusy(false)
      if (bannerRef.current) bannerRef.current.value = ''
    }
  }

  function removeAvatar() {
    const prev = profile.avatar
    setProfile({ avatar: null })
    if (prev) void dropAvatar(prev.id)
  }

  function removeBanner() {
    const prev = profile.banner
    setProfile({ banner: null })
    if (prev?.kind === 'image') void dropBanner(prev.id)
  }

  const bannerStyle =
    profile.banner?.kind === 'image' && bannerUrl
      ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : profile.banner?.kind === 'gradient'
        ? { background: profile.banner.value }
        : undefined

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
            onClick={onClose}
            title="Close"
            aria-label="Close customization"
            className="rounded-md p-1.5 text-rascal-dim hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-rascal-line">
          <div className="h-20 w-full bg-rascal-rail" style={bannerStyle} />
          <div className="flex items-center gap-3 bg-rascal-bg px-3 pb-3">
            <span className="-mt-5 rounded-full ring-4 ring-rascal-bg">
              <Avatar url={avatarUrl} name={identity?.name ?? '?'} size={48} />
            </span>
            <StyledName
              name={identity?.name ?? '?'}
              styleId={profile.nameStyle}
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
          {profile.avatar && (
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
              onClick={() => {
                const prev = profile.banner
                setProfile({ banner: { kind: 'gradient', value: p.css } })
                if (prev?.kind === 'image') void dropBanner(prev.id)
              }}
              title={p.label}
              aria-label={`Banner ${p.label}`}
              className={`h-9 rounded-lg border-2 ${
                profile.banner?.kind === 'gradient' && profile.banner.value === p.css
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
          {profile.banner && (
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
        <div className="mt-1.5 flex gap-2">
          {(
            [
              ['themePrimary', 'Primary'],
              ['themeAccent', 'Accent'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-rascal-line px-3 py-2 hover:border-rascal-dim"
            >
              <input
                type="color"
                value={profile[key]}
                onChange={(e) => setProfile({ [key]: e.target.value })}
                className="h-6 w-8 cursor-pointer bg-transparent"
              />
              <span className="text-xs text-rascal-dim">{label}</span>
              <span className="flex-1 text-right font-mono text-[11px] text-rascal-dim">{profile[key]}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-rascal-dim">
          Display name style
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {NAME_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setProfile({ nameStyle: s.id })}
              title={s.label}
              className={`rounded-lg border px-2 py-2 text-sm font-bold ${
                profile.nameStyle === s.id
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
        <p className="mt-3 text-[11px] text-rascal-dim">
          Friends see your look when they open your profile (they must be online once to fetch it).
        </p>
      </div>
    </div>
  )
}
