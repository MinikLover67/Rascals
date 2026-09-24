import { useEffect, useState } from 'react'
import { avatarUrl, bannerUrl } from '../lib/profile'

// Resolves an IndexedDB blob id to an object URL (null while loading or
// absent). Keyed on (kind, id) so callers pass plain values, never closures.
export function useStoredImage(kind: 'avatar' | 'banner', id: string | null | undefined): string | null {
  const key = id ?? null
  const [state, setState] = useState<{ key: string | null; url: string | null }>({ key, url: null })
  // Reset on key change during render (endorsed adjust-during-render pattern).
  if (state.key !== key) setState({ key, url: null })
  useEffect(() => {
    if (!state.key || state.url) return
    let live = true
    void (kind === 'avatar' ? avatarUrl(state.key) : bannerUrl(state.key))
      .then((u) => {
        if (live) setState({ key: state.key, url: u })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [kind, state])
  return state.url
}
