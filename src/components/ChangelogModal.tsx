// One-time what's-new modal after an update. Lucide icons, no emoji.
// Opens only when the running version differs from the last seen one.
import { useEffect, useState } from 'react'
import { Check, Sparkles, Wrench, Zap, X, type LucideIcon } from 'lucide-react'
import { CHANGELOG, markChangelogSeen, shouldShowChangelog } from '../lib/changelog'

const TAG_STYLE: Record<string, { icon: LucideIcon; cls: string; label: string }> = {
  new: { icon: Sparkles, cls: 'text-rascal-green', label: 'New' },
  fix: { icon: Wrench, cls: 'text-rascal-amber', label: 'Fixed' },
  improve: { icon: Zap, cls: 'text-rascal-accent', label: 'Improved' },
}

export default function ChangelogModal({ appVersion }: { appVersion: string }) {
  const [open, setOpen] = useState(false)

  // Decide once at mount — a version change mid-session never re-pops it.
  useEffect(() => {
    if (shouldShowChangelog(appVersion)) setOpen(true)
  }, [appVersion])

  function close() {
    markChangelogSeen(appVersion)
    setOpen(false)
  }

  if (!open) return null

  // Only the current version's notes — older versions live on GitHub.
  const visible = CHANGELOG.filter((e) => e.version === appVersion)
  const entry = visible[0] ?? CHANGELOG[0]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={close}
      data-testid="changelog-overlay"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-rascal-line bg-rascal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-rascal-line px-5 py-3">
          <Sparkles size={16} className="text-rascal-accent" />
          <h2 className="text-base font-bold">What's new</h2>
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-rascal-dim">
            v{appVersion}
          </span>
          <span className="flex-1" />
          <button
            onClick={close}
            title="Close"
            aria-label="Close changelog"
            className="rounded-md p-1.5 text-rascal-dim hover:bg-white/5 hover:text-rascal-text"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 scroll-thin">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">v{entry.version}</h3>
              <span className="text-xs font-normal text-rascal-dim">{entry.title}</span>
            </div>
            <ul className="mt-1.5 space-y-1">
              {entry.items.map((it) => {
                const st = TAG_STYLE[it.tag]
                return (
                  <li key={it.text} className="flex items-start gap-2 rounded-lg px-1 py-1 text-sm">
                    <st.icon size={14} className={`mt-0.5 shrink-0 ${st.cls}`} />
                    <span className="flex-1 leading-relaxed">{it.text}</span>
                    <span className={`mt-0.5 shrink-0 text-[10px] uppercase tracking-wide ${st.cls}`}>{st.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <a
            href="https://github.com/MinikLover67/Rascals/releases"
            target="_blank"
            rel="noreferrer"
            className="block pt-1 text-center text-[11px] text-rascal-dim underline underline-offset-2 hover:text-rascal-text"
          >
            See older versions on GitHub
          </a>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-rascal-line px-5 py-3">
          <span className="flex items-center gap-1.5 text-[11px] text-rascal-dim">
            <Check size={12} />
            Only shown once per update
          </span>
          <button
            onClick={close}
            data-testid="changelog-continue"
            className="rounded-lg bg-rascal-accent px-4 py-1.5 text-sm font-semibold text-white"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
