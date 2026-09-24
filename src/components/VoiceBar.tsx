import { useEffect, useState } from 'react'
import { Mic, MicOff, PhoneOff, ScreenShare, Volume2, VolumeX } from 'lucide-react'
import { getVoice } from '../lib/session'
import { useApp } from '../store/app'

function fmtElapsed(since: number, now: number): string {
  const s = Math.max(0, Math.floor((now - since) / 1000))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

// Persistent control bar while in a 1:1 call or a voice channel.
export default function VoiceBar() {
  const voice = useApp((s) => s.voice)
  const [now, setNow] = useState(() => Date.now())
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!voice.call && !voice.channel) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [voice.call, voice.channel])

  if (!voice.call && !voice.channel) return null
  const api = getVoice()
  const label = voice.call
    ? `${voice.call.peerName} - ${voice.call.state === 'ringing' ? (voice.call.outgoing ? 'ringing…' : 'connecting…') : fmtElapsed(voice.call.startedAt, now)}`
    : `${voice.channel?.title} - ${voice.participants.length} in voice`

  async function toggleShare() {
    setErr(null)
    if (!api) return
    if (voice.sharing) await api.stopShare().catch(() => {})
    else {
      const e = await api.startShare().catch((x: unknown) => (x instanceof Error ? x.message : 'Share failed.'))
      if (e) setErr(e)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-rascal-line bg-rascal-panel px-4 py-2">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rascal-green" />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{label}</span>
      {err && <span className="max-w-48 truncate text-[11px] text-red-300" title={err}>{err}</span>}
      <button
        onClick={() => api?.setMuted(!voice.muted)}
        title={voice.muted ? 'Unmute' : 'Mute'}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${voice.muted ? 'bg-red-400/20 text-red-300' : 'bg-white/5 hover:bg-white/10'}`}
      >
        {voice.muted ? <MicOff size={14} /> : <Mic size={14} />}
        {voice.muted ? 'Unmute' : 'Mute'}
      </button>
      <button
        onClick={() => api?.setDeafened(!voice.deafened)}
        title={voice.deafened ? 'Undeafen' : 'Deafen (silence everyone)'}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${voice.deafened ? 'bg-red-400/20 text-red-300' : 'bg-white/5 hover:bg-white/10'}`}
      >
        {voice.deafened ? <VolumeX size={14} /> : <Volume2 size={14} />}
        {voice.deafened ? 'Undeafen' : 'Deafen'}
      </button>
      <button
        onClick={() => void toggleShare()}
        title={voice.sharing ? 'Stop sharing' : 'Share your screen'}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${voice.sharing ? 'bg-rascal-accent text-white' : 'bg-white/5 hover:bg-white/10'}`}
      >
        <ScreenShare size={14} />
        {voice.sharing ? 'Sharing...' : 'Share'}
      </button>
      <button
        onClick={() => {
          if (voice.call) void api?.hangup().catch(() => {})
          else void api?.leaveChannel().catch(() => {})
        }}
        title="Leave"
        data-testid="leave-call"
        className="flex items-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
      >
        <PhoneOff size={14} />
        Leave
      </button>
    </div>
  )
}
