import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import {
  loadPeerBlob,
  loadPeerProfile,
  type PeerProfile,
} from '../lib/profile'
import { shortUid } from '../lib/format'
import { useApp } from '../store/app'
import Avatar from './Avatar'
import { useStoredImage } from './useStoredImage'
import StyledName from './StyledName'

// Profile card: banner, avatar, styled name, theme colors. Own profile comes
// from the store; peers come from cache + live fetch on open/refresh.
export default function ProfileModal({
  userId,
  onClose,
  onCustomize,
}: {
  userId: string
  onClose: () => void
  onCustomize?: () => void
}) {
  const identity = useApp((s) => s.identity)
  const friends = useApp((s) => s.friends)
  const ownProfile = useApp((s) => s.profile)
  const peerTick = useApp((s) => s.peerProfileTick)
  const self = identity?.userId === userId
  const friend = friends.find((f) => f.userId === userId)
  const [peer, setPeer] = useState<PeerProfile | null>(null)
  const [fetching, setFetching] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null)
  const [peerBannerUrl, setPeerBannerUrl] = useState<string | null>(null)
  // Guard so the open-time auto-fetch and a manual Refresh never overlap.
  const fetchingRef = useRef(false)

  const ownAvatarUrl = useStoredImage('avatar', self ? (ownProfile.avatar?.id ?? null) : null)
  const ownBannerUrl = useStoredImage(
    'banner',
    self && ownProfile.banner?.kind === 'image' ? ownProfile.banner.id : null,
  )

  function setAvatarUrl(u: string | null) {
    setPeerAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return u
    })
  }

  function setBannerUrl(u: string | null) {
    setPeerBannerUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return u
    })
  }

  async function loadPeer() {
    const cached = await loadPeerProfile(userId)
    if (cached) {
      setPeer(cached)
      // Reset first: a removed avatar/banner must not keep showing the old one.
      if (cached.avatarMime) {
        const b = await loadPeerBlob(userId, 'avatar')
        setAvatarUrl(b ? URL.createObjectURL(b) : null)
      } else {
        setAvatarUrl(null)
      }
      if (cached.bannerMime) {
        const b = await loadPeerBlob(userId, 'banner')
        setBannerUrl(b ? URL.createObjectURL(b) : null)
      } else {
        setBannerUrl(null)
      }
    }
  }

  // Switching profiles must never flash the previous person's look:
  // clear everything, then load + auto-fetch the new one.
  useEffect(() => {
    setPeer(null)
    setStatus(null)
    setPeerAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPeerBannerUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    if (!self) {
      void loadPeer()
      void fetchLatest()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, self])

  // Their edit pushes straight to our cache — pick it up live while open.
  useEffect(() => {
    if (!self) void loadPeer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerTick])

  // Ask them for their latest look and wait for the cache to move.
  // Returns true when something newer actually landed.
  async function fetchLatest(): Promise<boolean> {
    if (self || fetchingRef.current) return false
    fetchingRef.current = true
    setFetching(true)
    setStatus(null)
    try {
      const session = await import('../lib/session')
      if ((session.getP2P()?.peerCount(userId) ?? 0) === 0) {
        setStatus('offline')
        return false
      }
      // Known-old app (no chunked profile images): meta still arrives, but
      // their big avatars/banners can never reach us until they update.
      const peerProto = session.getP2P()?.peerFileVersionOf(userId) ?? 0
      const outdated = peerProto === 1 || peerProto === 2
      const before = (await loadPeerProfile(userId))?.at ?? 0
      await session.requestPeerProfile(userId)
      // The answer arrives async (meta first, big GIFs as follow-up
      // chunks) — poll the cache until it lands.
      const t0 = Date.now()
      while (Date.now() - t0 < 10000) {
        await new Promise((r) => setTimeout(r, 500))
        const cur = await loadPeerProfile(userId)
        if (cur && cur.at > before) break
      }
      await loadPeer()
      const after = (await loadPeerProfile(userId))?.at ?? 0
      const updated = after > before
      setStatus(outdated ? 'oldversion' : updated ? 'updated' : 'uptodate')
      return updated
    } catch {
      setStatus('offline')
      return false
    } finally {
      fetchingRef.current = false
      setFetching(false)
    }
  }

  async function refresh() {
    await fetchLatest().catch(() => {})
  }

  const name = self ? (identity?.name ?? 'You') : (friend?.displayName ?? shortUid(userId))
  const styleId = self ? ownProfile.nameStyle : (peer?.nameStyle ?? 'default')
  // No cache yet = unknown, not defaults: render neutral until we know.
  const primary = self ? ownProfile.themePrimary : (peer?.themePrimary ?? '#3a3f4d')
  const accent = self ? ownProfile.themeAccent : (peer?.themeAccent ?? '#2a2e38')
  const avatarSrc = self ? ownAvatarUrl : peerAvatarUrl
  const bannerImg = self ? ownBannerUrl : peerBannerUrl
  const bannerGrad =
    self && ownProfile.banner?.kind === 'gradient'
      ? ownProfile.banner.value
      : (peer?.bannerCss ?? null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-rascal-line bg-rascal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="h-28 w-full bg-rascal-rail"
          style={
            bannerImg
              ? { backgroundImage: `url(${bannerImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : bannerGrad
                ? { background: bannerGrad }
                : undefined
          }
        />
        <div
          className="px-5 pb-5 text-white"
          style={{
            background: `linear-gradient(180deg, ${primary}, ${accent})`,
          }}
        >
          <div className="-mt-8 mb-2 flex items-end justify-between">
            <span className="rounded-full ring-4 ring-white/40">
              <Avatar url={avatarSrc} name={name} size={64} />
            </span>
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close profile"
              className="rounded-md p-1.5 text-white/70 hover:bg-black/20 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <StyledName name={name} styleId={styleId} className="block truncate text-xl font-bold" />
          <div className="mt-0.5 truncate font-mono text-[11px] text-white/75" title={userId}>
            {shortUid(userId)}
          </div>
          {self && (
            <p className="mt-1 text-[10px] text-white/75">
              Profile looks are alpha — still working on them.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <span
              className="h-5 w-5 rounded-md border border-white/40"
              style={{ background: primary }}
              title="Primary theme color"
            />
            <span
              className="h-5 w-5 rounded-md border border-white/40"
              style={{ background: accent }}
              title="Accent theme color"
            />
            <span className="flex-1" />
            {!self && (
              <button
                onClick={() => void refresh()}
                disabled={fetching}
                title="Fetch their latest look (they must be online)"
                className="flex items-center gap-1.5 rounded-lg bg-black/25 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/35 disabled:opacity-40"
              >
                <RefreshCw size={13} className={fetching ? 'animate-spin' : ''} />
                {fetching ? 'Fetching…' : peer ? 'Refresh' : 'Load profile'}
              </button>
            )}
            {self && onCustomize && (
              <button
                onClick={onCustomize}
                className="rounded-lg bg-black/25 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/35"
              >
                Customize
              </button>
            )}
          </div>
          {!self && !peer && !fetching && (
            <p className="mt-2 text-[11px] text-white/80">
              {status === 'offline'
                ? 'They seem to be offline — their look will load once you are both online.'
                : 'No profile fetched yet — they need to be online once so the app can fetch it.'}
            </p>
          )}
          {!self && status === 'updated' && (
            <p className="mt-2 text-[11px] text-white/80">Updated ✓ — showing their latest look.</p>
          )}
          {!self && status === 'oldversion' && (
            <p className="mt-2 text-[11px] text-rascal-amber">
              They're on an old Rascals — ask them to update (Settings → Check for updates) so their avatar and banner can load.
            </p>
          )}
          {!self && status === 'uptodate' && peer && (
            <p className="mt-2 text-[11px] text-white/80">Already up to date.</p>
          )}
        </div>
      </div>
    </div>
  )
}
