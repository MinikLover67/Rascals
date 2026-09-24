import { useEffect, useState } from 'react'
import { loadPeerBlob } from '../lib/profile'
import { usePeerProfile } from './usePeerProfile'
import StyledName from './StyledName'

// Avatar image with an initial-letter fallback. Works for static and
// animated (GIF) avatars. Pair with useStoredImage for IndexedDB ids.
export default function Avatar({
  url,
  name,
  size = 40,
}: {
  url?: string | null
  name: string
  size?: number
}) {
  const initial = (name.trim().slice(0, 1) || 'R').toUpperCase()
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-rascal-accent font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42) }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initial}
    </span>
  )
}

/** Peer avatar from cache (falls back to initial). Pair with StyledName. */
export function PeerAvatar({ userId, name, size = 40 }: { userId: string; name: string; size?: number }) {
  const [state, setState] = useState<{ uid: string; url: string | null }>({ uid: userId, url: null })
  if (state.uid !== userId) setState({ uid: userId, url: null })
  useEffect(() => {
    if (state.url) return
    let live = true
    void loadPeerBlob(state.uid, 'avatar')
      .then(async (b) => {
        if (!live || !b) return
        setState({ uid: state.uid, url: URL.createObjectURL(b) })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [state])
  return <Avatar url={state.url} name={name} size={size} />
}

/** Peer display name with their cached style (falls back to plain). */
export function PeerName({ userId, name, className }: { userId: string; name: string; className?: string }) {
  const peer = usePeerProfile(userId)
  return <StyledName name={name} styleId={peer?.nameStyle} className={className} />
}
