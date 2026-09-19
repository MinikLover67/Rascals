// Voice sessions: 1:1 calls and group/channel voice rooms over Trystero.
// Signaling for 1:1 calls rides the DM 'call' action; media lives in a
// dedicated call room. Voice channels are persistent rooms keyed by chat:
// joining = entering, leaving = exiting, presence = participants.
// TURN (when configured in settings) applies to these media rooms.

import { joinRoom } from 'trystero'
import { roomOpts } from './relays'
import { alertCallMissed } from './alerts'
import { notifyUser } from './notify'
import { startRingLoop, stopRingLoop } from './sound'
import { useApp, type VoiceParticipant } from '../store/app'
import type { Identity } from './identity'

const RING_SECONDS = 45

export interface VoiceDeps {
  identity: () => Identity | null
  displayNameOf: (userId: string) => string
  sendCall: (friendId: string, kind: 'offer' | 'accept' | 'decline' | 'hangup', callId: string) => Promise<boolean>
  peerOnline: (friendId: string) => boolean
  postSys: (chatKey: string, text: string, mine: boolean) => void
}

interface VHello {
  userId: string
  name: string
  [key: string]: string | number | boolean
}

interface VState {
  userId: string
  muted: boolean
  sharing: boolean
  [key: string]: string | number | boolean
}

type Room = ReturnType<typeof joinRoom>

export interface RemoteVideo {
  peerId: string
  userId: string
  name: string
  stream: MediaStream
}

// Room config (relays + TURN) is shared with the text stack — see relays.ts.

// Ringing is handled by the sound engine (startRingLoop/stopRingLoop) so
// custom sound packs cover calls too.

export function bindVoice(deps: VoiceDeps) {
  let room: Room | null = null
  let roomKind: 'call' | 'channel' | null = null
  let localStream: MediaStream | null = null
  let screenStream: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  const analysers = new Map<string, { analyser: AnalyserNode; data: Uint8Array }>()
  const remoteAudio = new Map<string, HTMLAudioElement>()
  const remoteVideos = new Map<string, { userId: string; name: string; stream: MediaStream }>()
  let videoTick = 0
  let speakTimer: number | null = null
  let ringTimer: number | null = null
  const peerNames = new Map<string, { userId: string; name: string }>()

  function bumpVideos(): void {
    videoTick += 1
    void videoTick
  }

  function myId(): string {
    return deps.identity()?.userId ?? ''
  }

  function myName(): string {
    return deps.identity()?.name ?? 'Someone'
  }

  function setParts(parts: VoiceParticipant[]): void {
    useApp.getState().setParticipants(parts)
  }

  function getParts(): VoiceParticipant[] {
    return useApp.getState().voice.participants
  }

  function upsertSelf(): void {
    const parts = getParts().filter((p) => !p.self)
    const v = useApp.getState().voice
    parts.unshift({
      peerId: 'self',
      userId: myId(),
      name: `${myName()} (you)`,
      muted: v.muted,
      sharing: v.sharing,
      speaking: false,
      self: true,
    })
    setParts(parts)
  }

  function ensureAudio(): AudioContext | null {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext
        if (!Ctx) return null
        audioCtx = new Ctx()
      }
      if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {})
      return audioCtx
    } catch {
      return null
    }
  }

  function watchStream(key: string, stream: MediaStream): void {
    try {
      const ctx = ensureAudio()
      if (!ctx) return
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      analysers.set(key, { analyser, data: new Uint8Array(analyser.frequencyBinCount) })
    } catch {
      // speaking detection is best-effort
    }
  }

  function startSpeakingPoll(): void {
    stopSpeakingPoll()
    speakTimer = setInterval(() => {
      let changed = false
      const next = getParts().map((p) => {
        const key = p.self ? 'self' : p.peerId
        const w = analysers.get(key)
        if (!w) return p
        w.analyser.getByteTimeDomainData(w.data as Uint8Array<ArrayBuffer>)
        let sum = 0
        for (let i = 0; i < w.data.length; i++) {
          const v = (w.data[i] - 128) / 128
          sum += v * v
        }
        const speaking = Math.sqrt(sum / w.data.length) > 0.06
        if (speaking !== p.speaking) {
          changed = true
          return { ...p, speaking }
        }
        return p
      })
      if (changed) setParts(next)
    }, 250)
  }

  function stopSpeakingPoll(): void {
    if (speakTimer !== null) {
      clearInterval(speakTimer)
      speakTimer = null
    }
  }

  async function micStream(): Promise<MediaStream> {
    const micId = useApp.getState().settings.micId
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: micId ? { exact: micId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
  }

  function applyMute(): void {
    const muted = useApp.getState().voice.muted
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted
    })
  }

  async function broadcastState(): Promise<void> {
    if (!room) return
    const v = useApp.getState().voice
    const act = room.makeAction<VState>('vstate')
    await act.send({ userId: myId(), muted: v.muted, sharing: v.sharing }).catch(() => {})
  }

  async function broadcastHello(target?: string): Promise<void> {
    if (!room) return
    const act = room.makeAction<VHello>('vhello')
    const payload = { userId: myId(), name: myName() }
    if (target) await act.send(payload, { target }).catch(() => {})
    else await act.send(payload).catch(() => {})
  }

  function attachRemoteAudio(peerId: string, stream: MediaStream): void {
    try {
      let el = remoteAudio.get(peerId)
      if (!el) {
        el = document.createElement('audio')
        el.autoplay = true
        document.body.appendChild(el)
        remoteAudio.set(peerId, el)
      }
      el.srcObject = stream
      const speakerId = useApp.getState().settings.speakerId
      const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
      if (speakerId && typeof withSink.setSinkId === 'function') {
        withSink.setSinkId(speakerId).catch(() => {})
      }
      el.muted = useApp.getState().voice.deafened
    } catch {
      // audio playback unavailable
    }
  }

  function detachRemote(peerId: string): void {
    const el = remoteAudio.get(peerId)
    if (el) {
      el.srcObject = null
      el.remove()
      remoteAudio.delete(peerId)
    }
    analysers.delete(peerId)
    if (remoteVideos.delete(peerId)) bumpVideos()
  }

  function notePeer(peerId: string, userId: string, name: string): void {
    peerNames.set(peerId, { userId, name })
    const parts = getParts()
    if (parts.some((p) => p.peerId === peerId)) return
    setParts([
      ...parts,
      { peerId, userId, name, muted: false, sharing: false, speaking: false, self: false },
    ])
  }

  async function joinRoomCommon(id: string, kind: 'call' | 'channel'): Promise<string | null> {
    try {
      leaveRoomOnly()
      const r = joinRoom(roomOpts(), id)
      room = r
      roomKind = kind
      const hello = r.makeAction<VHello>('vhello')
      const state = r.makeAction<VState>('vstate')
      hello.onMessage = (data, context) => {
        if (!data || typeof data.userId !== 'string') return
        notePeer(context.peerId, data.userId, typeof data.name === 'string' ? data.name : 'Someone')
      }
      state.onMessage = (data, context) => {
        if (!data || typeof data.userId !== 'string') return
        void context
        const parts = getParts().map((p) =>
          !p.self && p.userId === data.userId
            ? { ...p, muted: data.muted === true, sharing: data.sharing === true }
            : p,
        )
        setParts(parts)
      }
      r.onPeerJoin = (peerId: string) => {
        void broadcastHello(peerId)
      }
      r.onPeerLeave = (peerId: string) => {
        peerNames.delete(peerId)
        detachRemote(peerId)
        setParts(getParts().filter((p) => p.peerId !== peerId))
        // 1:1 call: the room emptying means the other side hung up.
        if (roomKind === 'call' && useApp.getState().voice.call) {
          void endCall('ended', false).catch(() => {})
        }
      }
      r.onPeerStream = (stream: MediaStream, peerId: string) => {
        attachRemoteAudio(peerId, stream)
        watchStream(peerId, stream)
        const known = peerNames.get(peerId)
        if (known) notePeer(peerId, known.userId, known.name)
        else notePeer(peerId, peerId, 'Connecting...')
      }
      r.onPeerTrack = (track: MediaStreamTrack, stream: MediaStream, peerId: string) => {
        if (track.kind !== 'video') return
        const known = peerNames.get(peerId)
        remoteVideos.set(peerId, {
          userId: known?.userId ?? peerId,
          name: known?.name ?? 'Someone',
          stream,
        })
        bumpVideos()
        const parts = getParts().map((p) =>
          p.peerId === peerId ? { ...p, sharing: true } : p,
        )
        setParts(parts)
      }
      return null
    } catch (e) {
      leaveRoomOnly()
      return e instanceof Error ? e.message : 'Could not join voice.'
    }
  }

  function leaveRoomOnly(): void {
    if (room) {
      try {
        void room.leave()
      } catch {
        // ignore
      }
    }
    room = null
    roomKind = null
  }

  function stopTracks(): void {
    localStream?.getTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        // ignore
      }
    })
    localStream = null
    if (screenStream) {
      screenStream.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          // ignore
        }
      })
      screenStream = null
    }
    for (const peerId of [...remoteAudio.keys()]) detachRemote(peerId)
    analysers.clear()
    remoteVideos.clear()
    peerNames.clear()
    stopSpeakingPoll()
    if (audioCtx) {
      void audioCtx.close().catch(() => {})
      audioCtx = null
    }
  }

  function clearRingTimer(): void {
    if (ringTimer !== null) {
      clearTimeout(ringTimer)
      ringTimer = null
    }
    stopRingLoop()
  }

  function fmtDur(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000))
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  async function endCall(reason: 'ended' | 'declined' | 'missed' | 'no-answer' | 'cancelled', announce: boolean): Promise<void> {
    const v = useApp.getState().voice
    const call = v.call
    clearRingTimer()
    leaveRoomOnly()
    stopTracks()
    useApp.getState().resetVoice()
    if (call && announce) {
      const label =
        reason === 'missed'
          ? 'Missed voice call'
          : reason === 'no-answer'
            ? 'Call not answered'
            : reason === 'declined'
              ? 'Call declined'
              : reason === 'cancelled'
                ? 'Call cancelled'
                : `Call ended - ${fmtDur(Date.now() - call.startedAt)}`
      deps.postSys(call.peerId, label, !call.outgoing && reason === 'missed' ? false : call.outgoing)
      if (reason === 'missed' && typeof document !== 'undefined' && document.hidden) {
        alertCallMissed(call.peerName)
      }
    }
  }

  // ---- public API ----

  async function startCall(friendId: string): Promise<string | null> {
    const v = useApp.getState().voice
    if (v.call || v.channel) return 'Already in a call.'
    if (!deps.peerOnline(friendId)) return 'They are offline.'
    const callId = crypto.randomUUID()
    let stream: MediaStream
    try {
      stream = await micStream()
    } catch {
      return 'Microphone unavailable - check browser permissions.'
    }
    const err = await joinRoomCommon(`rascals-call:${callId}`, 'call')
    if (err) {
      stream.getTracks().forEach((t) => t.stop())
      return err
    }
    localStream = stream
    try {
      const proms = room?.addStream(stream)
      if (proms) await Promise.all(proms.map((p) => p.catch(() => {})))
    } catch {
      // continue — peer may not be there yet
    }
    watchStream('self', stream)
    startSpeakingPoll()
    useApp.getState().setVoice({
      call: { callId, peerId: friendId, peerName: deps.displayNameOf(friendId), outgoing: true, state: 'ringing', startedAt: Date.now() },
      muted: false,
      deafened: false,
      sharing: false,
      participants: [],
    })
    upsertSelf()
    await broadcastHello().catch(() => {})
    await deps.sendCall(friendId, 'offer', callId)
    clearRingTimer()
    ringTimer = setTimeout(() => {
      const cur = useApp.getState().voice.call
      if (cur && cur.callId === callId && cur.state === 'ringing') {
        void deps.sendCall(friendId, 'hangup', callId).catch(() => {})
        void endCall('no-answer', true)
      }
    }, RING_SECONDS * 1000)
    return null
  }

  async function acceptCall(): Promise<string | null> {
    const call = useApp.getState().voice.call
    if (!call || call.outgoing || call.state !== 'ringing') return 'No incoming call.'
    let stream: MediaStream
    try {
      stream = await micStream()
    } catch {
      return 'Microphone unavailable - check browser permissions.'
    }
    clearRingTimer()
    const err = await joinRoomCommon(`rascals-call:${call.callId}`, 'call')
    if (err) {
      stream.getTracks().forEach((t) => t.stop())
      return err
    }
    localStream = stream
    try {
      const proms = room?.addStream(stream)
      if (proms) await Promise.all(proms.map((p) => p.catch(() => {})))
    } catch {
      // continue
    }
    watchStream('self', stream)
    startSpeakingPoll()
    useApp.getState().setVoice({
      call: { ...call, state: 'active' },
      participants: [],
    })
    upsertSelf()
    await broadcastHello().catch(() => {})
    await deps.sendCall(call.peerId, 'accept', call.callId)
    return null
  }

  async function declineCall(): Promise<void> {
    const call = useApp.getState().voice.call
    if (!call || call.outgoing) return
    await deps.sendCall(call.peerId, 'decline', call.callId).catch(() => {})
    await endCall('declined', true)
  }

  async function hangup(): Promise<void> {
    const call = useApp.getState().voice.call
    if (!call) return
    const wasRingingOutgoing = call.outgoing && call.state === 'ringing'
    await deps.sendCall(call.peerId, 'hangup', call.callId).catch(() => {})
    await endCall(wasRingingOutgoing ? 'cancelled' : 'ended', true)
  }

  async function joinChannel(chatKey: string, title: string): Promise<string | null> {
    const v = useApp.getState().voice
    if (v.call) return 'Finish your call first.'
    if (v.channel && v.channel.chatKey === chatKey) return null
    if (v.channel) await leaveChannel()
    let stream: MediaStream
    try {
      stream = await micStream()
    } catch {
      return 'Microphone unavailable - check browser permissions.'
    }
    const err = await joinRoomCommon(`rascals-voice:${chatKey}`, 'channel')
    if (err) {
      stream.getTracks().forEach((t) => t.stop())
      return err
    }
    localStream = stream
    try {
      const proms = room?.addStream(stream)
      if (proms) await Promise.all(proms.map((p) => p.catch(() => {})))
    } catch {
      // continue
    }
    watchStream('self', stream)
    startSpeakingPoll()
    useApp.getState().setVoice({
      channel: { chatKey, title },
      muted: false,
      deafened: false,
      sharing: false,
      participants: [],
    })
    upsertSelf()
    await broadcastHello().catch(() => {})
    await broadcastState().catch(() => {})
    return null
  }

  async function leaveChannel(): Promise<void> {
    const v = useApp.getState().voice
    if (!v.channel) return
    if (v.sharing) await stopShare()
    leaveRoomOnly()
    stopTracks()
    useApp.getState().resetVoice()
  }

  function setMuted(m: boolean): void {
    useApp.getState().setVoice({ muted: m })
    applyMute()
    void broadcastState()
  }

  function setDeafened(d: boolean): void {
    useApp.getState().setVoice({ deafened: d })
    for (const el of remoteAudio.values()) el.muted = d
  }

  function setSpeaker(id: string): void {
    for (const el of remoteAudio.values()) {
      const withSink = el as HTMLAudioElement & { setSinkId?: (x: string) => Promise<void> }
      if (typeof withSink.setSinkId === 'function' && id) {
        withSink.setSinkId(id).catch(() => {})
      }
    }
  }

  async function startShare(): Promise<string | null> {
    if (!room) return 'Join voice first.'
    if (screenStream) return null
    let stream: MediaStream
    try {
      const dm = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (opts?: DisplayMediaStreamOptions) => Promise<MediaStream>
      }
      if (!dm.getDisplayMedia) return 'Screen sharing is not supported here.'
      stream = await dm.getDisplayMedia({ video: true, audio: false })
    } catch {
      return 'Screen share was cancelled or unavailable.'
    }
    const track = stream.getVideoTracks()[0]
    if (!track) {
      stream.getTracks().forEach((t) => t.stop())
      return 'No video track.'
    }
    try {
      const proms = room.addTrack(track, stream)
      await Promise.all(proms.map((p) => p.catch(() => {})))
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      return e instanceof Error ? e.message : 'Could not share.'
    }
    screenStream = stream
    track.onended = () => {
      void stopShare()
    }
    useApp.getState().setVoice({ sharing: true })
    await broadcastState()
    return null
  }

  async function stopShare(): Promise<void> {
    if (!room || !screenStream) {
      useApp.getState().setVoice({ sharing: false })
      return
    }
    const track = screenStream.getVideoTracks()[0]
    if (track) {
      try {
        room.removeTrack(track)
      } catch {
        // ignore
      }
    }
    screenStream.getTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        // ignore
      }
    })
    screenStream = null
    useApp.getState().setVoice({ sharing: false })
    await broadcastState()
  }

  function handleSignal(
    from: string,
    kind: 'offer' | 'accept' | 'decline' | 'hangup',
    callId: string,
  ): void {
    const v = useApp.getState().voice
    if (kind === 'offer') {
      if (v.call || v.channel) {
        // Busy: auto-decline so the caller is not left ringing.
        void deps.sendCall(from, 'decline', callId).catch(() => {})
        deps.postSys(from, 'Missed voice call (you were busy)', false)
        return
      }
      useApp.getState().setVoice({
        call: {
          callId,
          peerId: from,
          peerName: deps.displayNameOf(from),
          outgoing: false,
          state: 'ringing',
          startedAt: Date.now(),
        },
      })
      startRingLoop()
      if (typeof document !== 'undefined' && document.hidden) {
        void notifyUser('Incoming voice call', `${deps.displayNameOf(from)} is calling...`)
      }
      ringTimer = setTimeout(() => {
        const cur = useApp.getState().voice.call
        if (cur && cur.callId === callId && cur.state === 'ringing' && !cur.outgoing) {
          void endCall('missed', true)
        }
      }, RING_SECONDS * 1000)
      return
    }
    const call = v.call
    if (!call || call.callId !== callId) return
    if (kind === 'accept' && call.outgoing && call.state === 'ringing') {
      clearRingTimer()
      useApp.getState().setVoice({ call: { ...call, state: 'active' } })
    } else if (kind === 'decline' && call.outgoing) {
      void endCall('declined', true)
    } else if (kind === 'hangup') {
      void endCall(call.state === 'active' ? 'ended' : call.outgoing ? 'cancelled' : 'missed', true)
    }
  }

  function getRemoteVideos(): RemoteVideo[] {
    const out: RemoteVideo[] = []
    for (const [peerId, v] of remoteVideos) {
      out.push({ peerId, userId: v.userId, name: v.name, stream: v.stream })
    }
    return out
  }

  function teardown(): void {
    clearRingTimer()
    leaveRoomOnly()
    stopTracks()
    useApp.getState().resetVoice()
  }

  return {
    startCall,
    acceptCall,
    declineCall,
    hangup,
    joinChannel,
    leaveChannel,
    setMuted,
    setDeafened,
    setSpeaker,
    startShare,
    stopShare,
    handleSignal,
    getRemoteVideos,
    teardown,
  }
}

export type VoiceApi = ReturnType<typeof bindVoice>
