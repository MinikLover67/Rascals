import { useEffect, useState } from 'react'
import { blobUrl } from '../lib/idb'
import { chatFor } from '../lib/chatapi'
import { fmtBytes, fmtDuration } from '../lib/format'
import { useApp, type ChatMessage } from '../store/app'

export default function AttachmentCard({
  chatKey,
  m,
}: {
  chatKey: string
  m: ChatMessage
}) {
  const fileId = m.file?.id ?? ''
  const transfer = useApp((s) => s.files[fileId])
  const [url, setUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const ready = transfer?.ready ?? false
  const total = Math.max(1, transfer?.total ?? 1)
  const received = transfer?.received ?? 0
  const pct = Math.min(100, Math.round((received / total) * 100))

  // Loads the blob URL from IndexedDB: genuine external-system sync.
  useEffect(() => {
    let live = true
    if (fileId && ready) {
      void blobUrl(fileId).then((u) => {
        // eslint-disable-next-line react/set-state-in-effect
        if (live) setUrl(u)
      })
    } else {
      // eslint-disable-next-line react/set-state-in-effect
      setUrl(null)
    }
    return () => {
      live = false
    }
  }, [ready, fileId])

  const file = m.file
  if (!file) return null
  const fid = file.id
  const isImage = file.mime.startsWith('image/')
  const isVoice = file.voice === true

  async function retry() {
    setErr(null)
    try {
      await chatFor(chatKey).requestFile(chatKey, fid, 0)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    }
  }

  return (
    <div className="mb-1.5">
      {isImage && (url || file.thumb) && (
        <button onClick={() => url && setZoom(true)} className="block max-w-full cursor-zoom-in">
          <img
            src={url ?? file.thumb}
            alt={file.name}
            className={`max-h-64 rounded-lg object-contain ${url ? '' : 'opacity-70 blur-[1px]'}`}
          />
        </button>
      )}
      {isVoice && url && (
        <div className="flex items-center gap-2">
          <audio controls src={url} className="h-9 max-w-full" preload="metadata" />
          {typeof file.duration === 'number' && (
            <span className="shrink-0 text-[11px] opacity-70">{fmtDuration(file.duration)}</span>
          )}
        </div>
      )}
      {!isImage && !isVoice && (
        <div className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-bold">
            {file.name.includes('.')
              ? file.name.slice(file.name.lastIndexOf('.') + 1, file.name.lastIndexOf('.') + 4).toUpperCase()
              : 'FILE'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">{file.name}</div>
            <div className="text-[11px] opacity-70">{fmtBytes(file.size)}</div>
          </div>
          {ready && url && (
            <a
              href={url}
              download={file.name}
              className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              Save
            </a>
          )}
        </div>
      )}
      {!ready && (
        <div className="mt-1.5">
          <div className="h-1 overflow-hidden rounded-full bg-black/30">
            <div className="h-full rounded-full bg-white/60" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] opacity-70">
            <span>
              {pct}%{m.mine ? ' uploaded' : ' downloaded'}
            </span>
            {!m.mine && (
              <button onClick={retry} className="underline underline-offset-2">
                retry
              </button>
            )}
          </div>
        </div>
      )}
      {ready && !url && !isImage && (
        <button onClick={retry} className="mt-1 text-[11px] underline underline-offset-2 opacity-70">
          reload file
        </button>
      )}
      {err && <div className="mt-1 text-[11px] text-red-300">{err}</div>}
      {zoom && url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoom(false)}
        >
          <img src={url} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}
