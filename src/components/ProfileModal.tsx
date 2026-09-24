import { useEffect, useState } from 'react'
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
  const self = identity?.userId === userId
  const friend = friends.find((f) => f.userId === userId)
  const [peer, setPeer] = useState<PeerProfile | null>(null)
  const [fetching, setFetching] = useState(false)
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null)
  const [peerBannerUrl, setPeerBannerUrl] = useState<string | null>(null)

  const ownAvatarUrl = useStoredImage('avatar', self ? (ownProfile.avatar?.id ?? null) : null)
  const ownBannerUrl = useStoredImage(
    'banner',
    self && ownProfile.banner?.kind === 'image' ? ownProfile.banner.id : null,
  )

  async function loadPeer() {
    const cached = await loadPeerProfile(userId)
    if (cached) {
      setPeer(cached)
      if (cached.avatarMime) {
        const b = await loadPeerBlob(userId, 'avatar')
        if (b) setPeerAvatarUrl(URL.createObjectURL(b))
      }
      if (cached.bannerMime) {
        const b = await loadPeerBlob(userId, 'banner')
        if (b) setPeerBannerUrl(URL.createObjectURL(b))
      }
    }
  }

  useEffect(() => {
    if (!self) void loadPeer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, self])

  async function refresh() {
    if (self || fetching) return
    setFetching(true)
    try {
      const { requestPeerProfile } = await import('../lib/session')
      await requestPeerProfile(userId)
      await loadPeer()
    } catch {
      // peer offline — cache stays
    } finally {
      setFetching(false)
    }
  }

  const name = self ? (identity?.name ?? 'You') : (friend?.displayName ?? shortUid(userId))
  const styleId = self ? ownProfile.nameStyle : (peer?.nameStyle ?? 'default')
  const primary = self ? ownProfile.themePrimary : (peer?.themePrimary ?? '#7c6cff')
  const accent = self ? ownProfile.themeAccent : (peer?.themeAccent ?? '#3ddc84')
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
        <div className="px-5 pb-5">
          <div className="-mt-8 mb-2 flex items-end justify-between">
            <span className="rounded-full ring-4 ring-rascal-panel">
              <Avatar url={avatarSrc} name={name} size={64} />
            </span>
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close profile"
              className="rounded-md p-1.5 text-rascal-dim hover:bg-white/5 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <StyledName name={name} styleId={styleId} className="block truncate text-xl font-bold" />
          <div className="mt-0.5 truncate font-mono text-[11px] text-rascal-dim" title={userId}>
            {shortUid(userId)}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className="h-5 w-5 rounded-md border border-white/20"
              style={{ background: primary }}
              title="Primary theme color"
            />
            <span
              className="h-5 w-5 rounded-md border border-white/20"
              style={{ background: accent }}
              title="Accent theme color"
            />
            <span className="flex-1" />
            {!self && (
              <button
                onClick={() => void refresh()}
                disabled={fetching}
                title="Fetch their latest look (they must be online)"
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
              >
                <RefreshCw size={13} className={fetching ? 'animate-spin' : ''} />
                {fetching ? 'Fetching…' : peer ? 'Refresh' : 'Load profile'}
              </button>
            )}
            {self && onCustomize && (
              <button
                onClick={onCustomize}
                className="rounded-lg bg-rascal-accent px-3 py-1.5 text-xs font-semibold text-white"
              >
                Customize
              </button>
            )}
          </div>
          {!self && !peer && !fetching && (
            <p className="mt-2 text-[11px] text-rascal-dim">
              No cached look yet — they need to be online once so the app can fetch it.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
