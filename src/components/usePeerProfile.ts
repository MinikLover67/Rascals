import { useEffect, useState } from 'react'
import { loadPeerProfile, type PeerProfile } from '../lib/profile'

// Peer's cached look (theme, name style). Refreshes when the userId changes;
// live refetches happen explicitly via ProfileModal, not here.
export function usePeerProfile(userId: string | null | undefined): PeerProfile | null {
  const key = userId ?? null
  const [state, setState] = useState<{ key: string | null; peer: PeerProfile | null }>({
    key,
    peer: null,
  })
  if (state.key !== key) setState({ key, peer: null })
  useEffect(() => {
    if (!state.key || state.peer) return
    let live = true
    void loadPeerProfile(state.key)
      .then((p) => {
        if (live) setState({ key: state.key, peer: p })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [state])
  return state.peer
}
