import { useEffect, useRef, useState } from 'react'
import { getVoice } from '../lib/session'
import { useApp } from '../store/app'

function VideoTile({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return (
    <div className="overflow-hidden rounded-xl border border-rascal-line">
      <video ref={ref} autoPlay playsInline muted={false} className="aspect-video w-full bg-black" />
      <div className="bg-rascal-panel px-2 py-1 text-[11px] text-rascal-dim">{name} - screen</div>
    </div>
  )
}

// Who is in voice right now + their screenshares. Shown inside the active chat.
export default function VoiceParticipants() {
  const participants = useApp((s) => s.voice.participants)
  const [videos, setVideos] = useState<Array<{ peerId: string; name: string; stream: MediaStream }>>([])

  useEffect(() => {
    let live = true
    const refresh = () => {
      if (live) setVideos(getVoice()?.getRemoteVideos() ?? [])
    }
    refresh()
    const t = window.setInterval(refresh, 1500)
    return () => {
      live = false
      window.clearInterval(t)
    }
  }, [participants.length])

  if (participants.length === 0) return null

  return (
    <div className="border-b border-rascal-line bg-rascal-panel/40 px-4 py-2">
      <div className="flex flex-wrap gap-1.5">
        {participants.map((p) => (
          <span
            key={p.peerId}
            title={`${p.name}${p.muted ? ' (muted)' : ''}${p.sharing ? ' (sharing)' : ''}`}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
              p.speaking ? 'border-rascal-green bg-rascal-green/10' : 'border-rascal-line bg-black/20'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${p.muted ? 'bg-red-400' : 'bg-rascal-green'}`} />
            {p.name}
            {p.muted && <span className="text-red-300">muted</span>}
          </span>
        ))}
      </div>
      {videos.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {videos.map((v) => (
            <VideoTile key={v.peerId} stream={v.stream} name={v.name} />
          ))}
        </div>
      )}
    </div>
  )
}
