import { useEffect } from 'react'
import { useApp } from '../store/app'

// In-app arrival toasts: bottom-right stack, always visible (OS
// notifications can be suppressed, denied, or missed while focused).
// Click opens the chat; each auto-dismisses after a few seconds.
export default function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismissToast = useApp((s) => s.dismissToast)
  const selectFriend = useApp((s) => s.selectFriend)
  const selectGroup = useApp((s) => s.selectGroup)

  useEffect(() => {
    if (toasts.length === 0) return
    const timer = window.setTimeout(() => {
      const first = useApp.getState().toasts[0]
      if (first) useApp.getState().dismissToast(first.id)
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [toasts])

  if (toasts.length === 0) return null

  function open(t: (typeof toasts)[number]) {
    dismissToast(t.id)
    if (!t.chatKey) return
    if (t.chatKey.startsWith('g:')) selectGroup(t.chatKey.slice(2))
    else selectFriend(t.chatKey)
  }

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => open(t)}
          className="pointer-events-auto rounded-xl border border-rascal-line bg-rascal-panel p-3 text-left shadow-xl hover:border-rascal-accent"
        >
          <div className="truncate text-xs font-bold">{t.title}</div>
          <div className="mt-0.5 line-clamp-2 break-words text-xs text-rascal-dim">{t.body}</div>
        </button>
      ))}
    </div>
  )
}
