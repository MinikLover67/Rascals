import { useState } from 'react'
import { installUpdate } from '../lib/updater'
import { useApp } from '../store/app'

// Quiet banner when the updater found a newer signed release.
export default function UpdateBanner() {
  const update = useApp((s) => s.availableUpdate)
  const dismissUpdate = useApp((s) => s.dismissUpdate)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!update) return null

  async function install() {
    setBusy(true)
    setErr(null)
    const msg = await installUpdate()
    if (msg !== 'Restarting...') {
      setErr(msg)
      setBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-rascal-accent/40 bg-rascal-accent/10 px-4 py-2">
      <span className="min-w-0 flex-1 truncate text-xs">
        <strong>Rascals v{update.version} available.</strong>
        {update.notes && <span className="text-rascal-dim"> {update.notes.slice(0, 120)}</span>}
      </span>
      {err && <span className="max-w-48 truncate text-[11px] text-red-300" title={err}>{err}</span>}
      <button
        onClick={() => dismissUpdate()}
        className="rounded-md px-2 py-1 text-xs text-rascal-dim hover:bg-white/5 hover:text-white"
      >
        Later
      </button>
      <button
        onClick={() => void install()}
        disabled={busy}
        className="rounded-md bg-rascal-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Installing...' : 'Install and restart'}
      </button>
    </div>
  )
}
