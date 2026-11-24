import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { verifyPin } from '../lib/applock'

/** Full-screen PIN gate shown on app start when settings.lockEnabled is on.
 * Verifies against the stored sha256(salt + pin); wrong guesses get an
 * escalating cooldown so brute-forcing is slow even without a server. */
export function LockScreen({
  salt,
  hash,
  name,
  onUnlock,
}: {
  salt: string
  hash: string
  name?: string
  onUnlock: () => void
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const attempts = useRef(0)

  // Ticking cooldown timer (blocks submit + disables input).
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function submit() {
    if (busy || cooldown > 0 || pin.length === 0) return
    setBusy(true)
    setError(null)
    const ok = await verifyPin(pin, salt, hash)
    setBusy(false)
    if (ok) {
      setPin('')
      onUnlock()
      return
    }
    attempts.current += 1
    setPin('')
    const wait = Math.min(2 ** (attempts.current - 1), 30)
    setCooldown(wait)
    setError(wait > 1 ? `Wrong PIN — wait ${wait}s.` : 'Wrong PIN.')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-rascal-bg">
      <div className="flex w-full max-w-[300px] flex-col items-center gap-4 px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rascal-panel shadow-panel">
          <Lock size={26} className="text-rascal-accent" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold">Rascals is locked</p>
          <p className="mt-1 text-xs text-rascal-dim">{name ? `Enter your PIN, ${name}.` : 'Enter your PIN.'}</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          disabled={cooldown > 0 || busy}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          aria-label="App PIN"
          placeholder="••••"
          className="w-full rounded-lg border border-rascal-line bg-rascal-panel px-3 py-2 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-rascal-accent disabled:opacity-50"
        />
        {error && <p className="text-xs text-rascal-red">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={cooldown > 0 || busy || pin.length === 0}
          className="w-full rounded-lg bg-rascal-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Checking…' : cooldown > 0 ? `Locked (${cooldown}s)` : 'Unlock'}
        </button>
      </div>
    </div>
  )
}
