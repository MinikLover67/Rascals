import { useState } from 'react'
import { getVoice } from '../lib/session'
import { useApp } from '../store/app'

// Full-screen-ish prompt for an incoming 1:1 call.
export default function IncomingCallModal() {
  const call = useApp((s) => s.voice.call)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!call || call.outgoing || call.state !== 'ringing') return null

  async function accept() {
    setBusy(true)
    setErr(null)
    try {
      const e = await getVoice()?.acceptCall()
      if (e) setErr(e)
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not answer.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-rascal-line bg-rascal-panel p-6 text-center">
        <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-rascal-accent text-2xl font-bold text-white">
          {call.peerName.slice(0, 1).toUpperCase()}
        </div>
        <h2 className="mt-3 text-lg font-bold">{call.peerName}</h2>
        <p className="mt-1 text-sm text-rascal-dim">Incoming voice call...</p>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void getVoice()?.declineCall()}
            className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
          >
            Decline
          </button>
          <button
            onClick={() => void accept()}
            disabled={busy}
            className="flex-1 rounded-xl bg-rascal-green px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            {busy ? 'Joining...' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
