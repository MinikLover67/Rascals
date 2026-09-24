import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

function WinButton({
  label,
  onClick,
  close,
}: {
  label: string
  onClick: () => void
  close?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label === 'min' ? 'Minimize' : label === 'max' ? 'Maximize' : 'Close'}
      className={`flex h-9 w-12 items-center justify-center text-rascal-dim hover:bg-white/10 hover:text-white ${
        close ? 'hover:bg-rascal-red!' : ''
      }`}
    >
      {label === 'min' && <Minus size={14} />}
      {label === 'max' && <Square size={12} />}
      {label === 'close' && <X size={16} />}
    </button>
  )
}

export default function TitleBar() {
  async function withWindow(fn: (w: ReturnType<typeof getCurrentWindow>) => Promise<void>) {
    try {
      await fn(getCurrentWindow())
    } catch {
      // Running in plain browser dev (vite) — no window controls available.
    }
  }

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-stretch justify-between border-b border-rascal-line bg-rascal-rail pl-3"
    >
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-rascal-accent text-[11px] font-bold text-white">
          R
        </span>
        <span>Rascals</span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-rascal-dim">
          P2P · Phase 0
        </span>
        <span
          title="Rascals is in beta: still testing, bugs to fix. Report issues on GitHub."
          className="rounded bg-rascal-amber/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rascal-amber"
        >
          BETA
        </span>
      </div>
      <div className="flex">
        <WinButton label="min" onClick={() => withWindow((w) => w.minimize())} />
        <WinButton label="max" onClick={() => withWindow((w) => w.toggleMaximize())} />
        <WinButton label="close" close onClick={() => withWindow((w) => w.close())} />
      </div>
    </div>
  )
}
