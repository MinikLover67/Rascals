import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { chatFor } from '../lib/chatapi'
import { fmtDuration } from '../lib/format'

const MAX_SECONDS = 300

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const c of candidates) {
    try {
      if (window.MediaRecorder?.isTypeSupported(c)) return c
    } catch {
      // ignore
    }
  }
  return ''
}

export default function VoiceButton({ chatKey }: { chatKey: string }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMime()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.start(250)
      recRef.current = rec
      setSeconds(0)
      setRecording(true)
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) {
            void stop(true)
            return s
          }
          return s + 1
        })
      }, 1000)
    } catch {
      setError('Microphone unavailable.')
    }
  }

  function cleanup() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recRef.current = null
    setRecording(false)
  }

  async function stop(send: boolean) {
    const rec = recRef.current
    if (!rec) {
      cleanup()
      return
    }
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }))
      }
    })
    rec.stop()
    const blob = await done
    const elapsed = seconds
    cleanup()
    if (!send) return
    if (blob.size === 0) {
      setError('Recording was empty.')
      return
    }
    setBusy(true)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const err = await chatFor(chatKey).sendFile(chatKey, blob, `voice-${stamp}.webm`, {
        voice: true,
        duration: elapsed,
      })
      if (err) setError(err)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send voice message.')
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    void stop(false)
  }

  if (!recording) {
    return (
      <div className="flex flex-col items-center">
        <button
          onClick={() => void start()}
          disabled={busy}
          title="Record a voice message"
          aria-label="Record a voice message"
          className="rounded-xl border border-rascal-line bg-rascal-panel px-3 py-2 text-rascal-dim hover:text-white disabled:opacity-40"
        >
          <Mic size={18} />
        </button>
        {error && <span className="mt-1 text-[10px] text-red-300">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-400/40 bg-rascal-panel px-3 py-2">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
      <span className="font-mono text-sm">{fmtDuration(seconds)}</span>
      <button onClick={() => void stop(true)} className="rounded-lg bg-rascal-accent px-2.5 py-1 text-xs font-semibold text-white">
        Send
      </button>
      <button onClick={cancel} className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-rascal-dim hover:text-white">
        Drop
      </button>
    </div>
  )
}
