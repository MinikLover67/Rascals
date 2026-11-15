import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import LogoMark from './LogoMark'

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
      className={`flex h-9 w-12 items-center justify-center text-white/70 hover:bg-white/25 hover:text-white ${
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
      {/* rail is dark (dark theme) or purple (light theme) — white reads on both */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs font-semibold tracking-wide text-white">
        <LogoMark size={18} className="shrink-0" />
        <span className="shrink-0">Rascals</span>
        <span className="rail-chip hidden shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] min-[420px]:inline">
          P2P · Phase 0
        </span>
        <span
          title="Rascals is in beta: still testing, bugs to fix. Report issues on GitHub."
          className="rail-chip rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.14em]"
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
