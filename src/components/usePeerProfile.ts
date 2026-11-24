import { useEffect, useState } from 'react'
import { loadPeerProfile, type PeerProfile } from '../lib/profile'
import { useApp } from '../store/app'

// Peer's cached look (theme, name style). Reloads when the userId changes
// and whenever a fresh profile show lands (peerProfileTick), so pushed
// profile edits appear without reopening anything.
export function usePeerProfile(userId: string | null | undefined): PeerProfile | null {
  const key = userId ?? null
  const tick = useApp((s) => s.peerProfileTick)
  const [state, setState] = useState<{ key: string | null; peer: PeerProfile | null; tick: number }>({
    key,
    peer: null,
    tick,
  })
  if (state.key !== key) setState({ key, peer: null, tick })
  useEffect(() => {
    if (!key) return
    // Initial load, or a newer show arrived since we last read the cache.
    if (state.peer && state.tick === tick) return
    let live = true
    void loadPeerProfile(key)
      .then((p) => {
        if (live) setState({ key, peer: p, tick })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [key, tick, state.peer, state.tick])
  return state.peer
}
