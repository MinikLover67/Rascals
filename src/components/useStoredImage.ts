import { useEffect, useState } from 'react'
import { avatarUrl, bannerUrl } from '../lib/profile'

// Resolves an IndexedDB blob id to an object URL (null while loading or
// absent). Keyed on (kind, id) so callers pass plain values, never closures.
export function useStoredImage(kind: 'avatar' | 'banner', id: string | null | undefined): string | null {
  const key = id ?? null
  const [state, setState] = useState<{ key: string | null; url: string | null; tried: boolean }>({
    key,
    url: null,
    tried: false,
  })

  // Reset on key change during render (endorsed adjust-during-render pattern).
  if (state.key !== key) setState({ key, url: null, tried: false })

  useEffect(() => {
    if (!key || state.tried) return
    let live = true
    const fn = kind === 'avatar' ? avatarUrl : bannerUrl
    void fn(key)
      .then((u) => {
        if (live) setState({ key, url: u, tried: true })
      })
      .catch(() => {
        if (live) setState({ key, url: null, tried: true })
      })
    return () => {
      live = false
    }
  }, [kind, key, state.tried])

  return state.url
}