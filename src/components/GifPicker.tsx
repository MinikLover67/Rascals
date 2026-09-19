import { useState } from 'react'
import { chatFor } from '../lib/chatapi'
import { useApp } from '../store/app'

interface TenorResult {
  id: string
  preview: string
  full: string
}

async function searchTenor(key: string, q: string): Promise<TenorResult[]> {
  const res = await fetch(
    `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}&limit=8&media_filter=gif,tinygif`,
  )
  if (!res.ok) throw new Error(`Tenor search failed (${res.status})`)
  const data = (await res.json()) as {
    results?: Array<{
      id?: string
      media_formats?: {
        gif?: { url?: string }
        tinygif?: { url?: string }
      }
    }>
  }
  const out: TenorResult[] = []
  for (const r of data.results ?? []) {
    const full = r.media_formats?.gif?.url
    const preview = r.media_formats?.tinygif?.url ?? full
    if (full && preview) out.push({ id: String(r.id ?? full), preview, full })
  }
  return out
}

export default function GifPicker({
  chatKey,
  onClose,
}: {
  chatKey: string
  onClose: () => void
}) {
  const tenorKey = useApp((s) => s.settings.tenorKey)
  const setTenorKey = useApp((s) => s.setTenorKey)
  const [keyInput, setKeyInput] = useState(tenorKey)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TenorResult[]>([])
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function saveKey() {
    setTenorKey(keyInput.trim())
  }

  async function search() {
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    try {
      setResults(await searchTenor(tenorKey, query.trim()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.')
    } finally {
      setBusy(false)
    }
  }

  async function sendGif(r: TenorResult) {
    setSending(r.id)
    setError(null)
    try {
      const res = await fetch(r.full)
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()
      const err = await chatFor(chatKey).sendFile(chatKey, blob, 'tenor.gif', {})
      if (err) setError(err)
      else onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send GIF.')
    } finally {
      setSending(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-rascal-line bg-rascal-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Send a GIF</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-rascal-dim hover:text-white">
            Close
          </button>
        </div>
        {!tenorKey ? (
          <div className="mt-3 text-sm text-rascal-dim">
            <p>
              GIF search uses Tenor and needs a free API key. Get one at{' '}
              <span className="font-mono text-xs">developers.google.com/tenor</span>,
              then paste it here. It stays on this PC.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Tenor API key"
                className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 text-sm outline-none focus:border-rascal-accent"
              />
              <button
                onClick={saveKey}
                disabled={!keyInput.trim()}
                className="rounded-lg bg-rascal-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void search()}
                placeholder="Search Tenor..."
                autoFocus
                className="flex-1 rounded-lg border border-rascal-line bg-rascal-bg px-3 py-1.5 text-sm outline-none focus:border-rascal-accent"
              />
              <button
                onClick={() => void search()}
                disabled={busy || !query.trim()}
                className="rounded-lg bg-rascal-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? '...' : 'Go'}
              </button>
            </div>
            {results.length > 0 && (
              <div className="mt-3 grid max-h-72 grid-cols-4 gap-2 overflow-y-auto scroll-thin">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => void sendGif(r)}
                    disabled={sending !== null}
                    className="overflow-hidden rounded-lg border border-rascal-line hover:border-rascal-accent disabled:opacity-50"
                    title="Send this GIF (E2EE, like any image)"
                  >
                    <img src={r.preview} alt="GIF result" loading="lazy" className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setTenorKey('')}
              className="mt-3 text-[11px] text-rascal-dim underline underline-offset-2"
            >
              change API key
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        {sending && <p className="mt-3 text-xs text-rascal-dim">Sending GIF...</p>}
      </div>
    </div>
  )
}
