import { useEffect, useRef, useState } from 'react'
import { ScreenShare } from 'lucide-react'
import { getVoice } from '../lib/session'
import { useApp } from '../store/app'

function VideoTile({ stream, name, local }: { stream: MediaStream; name: string; local?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  // Always muted: remote screen audio rides a dedicated audio element, and
  // the local preview must never play back (feedback). Video-only here.
  return (
    <div className="overflow-hidden rounded-xl border border-rascal-line">
      <video ref={ref} autoPlay playsInline muted className="aspect-video w-full bg-black" />
      <div className="bg-rascal-panel px-2 py-1 text-[11px] text-rascal-dim">
        {local ? 'You are sharing (preview)' : `${name} - screen`}
      </div>
    </div>
  )
}

// Who is in voice right now + screenshares (theirs + your preview).
// Shown inside the active chat.
export default function VoiceParticipants() {
  const participants = useApp((s) => s.voice.participants)
  const sharing = useApp((s) => s.voice.sharing)
  const videosRev = useApp((s) => s.voice.videosRev)
  const [videos, setVideos] = useState<Array<{ peerId: string; name: string; stream: MediaStream }>>([])
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null)

  useEffect(() => {
    let live = true
    const refresh = () => {
      if (!live) return
      const api = getVoice()
      setVideos(api?.getRemoteVideos() ?? [])
      setLocalScreen(api?.getLocalScreen() ?? null)
    }
    refresh()
    // Reactive (videosRev bumps on arrive/end/preview) + a slow safety poll
    // in case a track event slips past.
    const t = window.setInterval(refresh, 5000)
    return () => {
      live = false
      window.clearInterval(t)
    }
  }, [videosRev, participants.length, sharing])

  if (participants.length === 0) return null

  return (
    <div className="border-b border-rascal-line bg-rascal-panel/40 px-4 py-2">
      <div className="flex flex-wrap gap-1.5">
        {participants.map((p) => (
          <span
            key={p.peerId}
            title={`${p.name}${p.muted ? ' (muted)' : ''}${p.sharing ? ' (sharing screen)' : ''}`}
            className={`flex max-w-56 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
              p.speaking ? 'border-rascal-green bg-rascal-green/10' : 'border-rascal-line bg-black/20'
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.muted ? 'bg-red-400' : 'bg-rascal-green'}`} />
            <span className="truncate">{p.name}</span>
            {p.sharing && <ScreenShare size={12} className="shrink-0 text-rascal-accent" />}
            {p.muted && <span className="shrink-0 text-red-300">muted</span>}
          </span>
        ))}
      </div>
      {(videos.length > 0 || localScreen) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {localScreen && <VideoTile stream={localScreen} name="You" local />}
          {videos.map((v) => (
            <VideoTile key={v.peerId} stream={v.stream} name={v.name} />
          ))}
        </div>
      )}
    </div>
  )
}
