// Sound engine: synthesized default pack + per-event custom sounds.
// Custom sounds are audio files the user imports (stored in IndexedDB).
// Everything is best-effort and never throws into chat flows.

import { kvDel, kvGet, kvSet } from './idb'
import { useApp, type SoundEvent } from '../store/app'

let ctx: AudioContext | null = null
let ringTimer: number | null = null
const customCache = new Map<string, AudioBuffer>()

function ensureCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    if (!ctx) {
      const Ctx = window.AudioContext
      if (!Ctx) return null
      ctx = new Ctx()
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

// Browsers gate audio behind a gesture — unlock on the first one.
if (typeof window !== 'undefined') {
  const unlock = () => ensureCtx()
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}

interface Tone {
  freq: number
  ms: number
  gap?: number
  type?: OscillatorType
  vol?: number
}

const PATTERNS: Record<SoundEvent, Tone[]> = {
  message: [{ freq: 880, ms: 90 }],
  send: [{ freq: 660, ms: 60 }],
  request: [
    { freq: 660, ms: 90 },
    { freq: 880, ms: 120, gap: 110 },
  ],
  ring: [
    { freq: 440, ms: 180 },
    { freq: 480, ms: 180, gap: 200 },
  ],
  join: [{ freq: 520, ms: 80 }, { freq: 780, ms: 100, gap: 90 }],
  leave: [{ freq: 780, ms: 80 }, { freq: 520, ms: 100, gap: 90 }],
}

function playTones(c: AudioContext, tones: Tone[]): void {
  try {
    let t = c.currentTime + 0.01
    for (const tone of tones) {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain)
      gain.connect(c.destination)
      osc.type = tone.type ?? 'sine'
      osc.frequency.value = tone.freq
      const vol = tone.vol ?? 0.07
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.ms / 1000)
      osc.start(t)
      osc.stop(t + tone.ms / 1000 + 0.02)
      t += (tone.gap ?? tone.ms) / 1000 + 0.02
    }
  } catch {
    // ignore
  }
}

async function playCustom(c: AudioContext, fileId: string): Promise<boolean> {
  try {
    let buf = customCache.get(fileId)
    if (!buf) {
      const blob = await kvGet(`snd:${fileId}`)
      if (!blob) return false
      buf = await c.decodeAudioData(await blob.arrayBuffer())
      customCache.set(fileId, buf)
    }
    const src = c.createBufferSource()
    src.buffer = buf
    const gain = c.createGain()
    gain.gain.value = 0.5
    src.connect(gain)
    gain.connect(c.destination)
    src.start()
    return true
  } catch {
    return false
  }
}

function packEnabled(): boolean {
  return useApp.getState().settings.soundPack !== 'silent'
}

export function playSound(event: SoundEvent): void {
  try {
    if (!packEnabled()) return
    const c = ensureCtx()
    if (!c) return
    const custom = useApp.getState().settings.customSounds[event]
    if (custom) {
      void playCustom(c, custom).then((ok) => {
        if (!ok) playTones(c, PATTERNS[event])
      })
      return
    }
    playTones(c, PATTERNS[event])
  } catch {
    // never break chat for a blip
  }
}

export function startRingLoop(): void {
  stopRingLoop()
  playSound('ring')
  ringTimer = window.setInterval(() => playSound('ring'), 1400)
}

export function stopRingLoop(): void {
  if (ringTimer !== null) {
    clearInterval(ringTimer)
    ringTimer = null
  }
}

/** Import a custom sound file for an event. Returns the stored id. */
export async function importCustomSound(event: SoundEvent, blob: Blob): Promise<void> {
  if (blob.size > 2 * 1024 * 1024) throw new Error('Sound files are capped at 2 MB.')
  const id = crypto.randomUUID()
  await kvSet(`snd:${id}`, blob)
  customCache.delete(id)
  const prev = useApp.getState().settings.customSounds[event]
  useApp.getState().setSettings({ customSounds: { ...useApp.getState().settings.customSounds, [event]: id } })
  if (prev) {
    await kvDel(`snd:${prev}`)
    customCache.delete(prev)
  }
}

export async function clearCustomSound(event: SoundEvent): Promise<void> {
  const prev = useApp.getState().settings.customSounds[event]
  const next = { ...useApp.getState().settings.customSounds }
  delete next[event]
  useApp.getState().setSettings({ customSounds: next })
  if (prev) {
    await kvDel(`snd:${prev}`)
    customCache.delete(prev)
  }
}
