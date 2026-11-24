// Subtle ASCII-dither gradient background — the calm cousin of 21st.dev's
// background-ascii-dither (asciify.org/backgrounds vibes). Three variants:
// 'drift' — slow pastel blobs sampled on a coarse grid (the original),
// 'stars' — a twinkling character starfield,
// 'rain'  — gentle falling glyph columns.
// Low alpha + coarse cells so it reads as paper texture, not a screensaver
// (the "no headaches" brief). Respects prefers-reduced-motion: renders one
// static frame instead.

import { useEffect, useRef } from 'react'

export type AsciiStyle = 'drift' | 'stars' | 'rain'

const RAMP = ' .·:;=+*#%@' // light -> dense
const CELL = 16 // px per character cell
const FPS = 12 // intentionally slow
const ALPHA = 0.14 // character ink strength

type Blob = { hue: [number, number, number]; r: number; sp: number; ph: number }

// Pastel field: violet, lavender, lilac — matches the light-purple theme.
const BLOBS: Blob[] = [
  { hue: [167, 139, 250], r: 0.55, sp: 0.11, ph: 0.0 },
  { hue: [196, 181, 253], r: 0.48, sp: 0.09, ph: 2.1 },
  { hue: [226, 218, 255], r: 0.42, sp: 0.13, ph: 4.2 },
]

// Deterministic per-cell hash so stars/rain don't flicker chaotically.
function cellHash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function driftField(x: number, y: number, w: number, h: number, t: number): number {
  let v = 0
  for (const b of BLOBS) {
    const cx = w * (0.5 + 0.34 * Math.sin(t * b.sp + b.ph))
    const cy = h * (0.5 + 0.34 * Math.cos(t * b.sp * 0.8 + b.ph))
    const d = Math.hypot(x - cx, y - cy) / (b.r * Math.min(w, h) * 1.6)
    v += Math.max(0, 1 - d) * (1 - d * 0.4)
  }
  return Math.min(1, v)
}

function starField(x: number, y: number, t: number): number {
  const seed = cellHash(x, y)
  // Only some cells are stars; each twinkles on its own phase.
  if (seed < 0.72) return 0
  const tw = Math.sin(t * (0.6 + seed) * 2.2 + seed * 40)
  return Math.max(0, 0.25 + 0.75 * tw)
}

function rainField(x: number, y: number, h: number, t: number): number {
  const seed = cellHash(x, 0)
  const speed = 60 + seed * 90 // px/s downward
  const period = h + 4 * CELL
  const head = ((t * speed + seed * period * 7) % period) - 2 * CELL
  const trail = head - y // positive above the head, negative below
  if (trail < 0 || trail > 6 * CELL) return 0
  return (1 - trail / (6 * CELL)) * (0.35 + 0.65 * seed)
}

export default function DitherBackground({
  className = '',
  variant = 'drift',
}: {
  className?: string
  variant?: AsciiStyle
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = 0
    let w = 0
    let h = 0

    const draw = (t: number) => {
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = Math.max(1, w * dpr)
        canvas.height = Math.max(1, h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.font = '11px ui-monospace, monospace'
      ctx.textBaseline = 'middle'
      for (let gy = CELL / 2; gy < h; gy += CELL) {
        for (let gx = CELL / 2; gx < w; gx += CELL) {
          const v =
            variant === 'drift'
              ? driftField(gx, gy, w, h, t)
              : variant === 'stars'
                ? starField(gx, gy, t)
                : rainField(gx, gy, h, t)
          if (v < 0.08) continue
          const ch = RAMP[Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1)))]
          if (ch === ' ') continue
          // blend the blob hue toward the sample strength; keep ink faint
          const i = Math.min(2, Math.round(v * 3) - 1)
          const [r, g, b] = BLOBS[Math.max(0, i)].hue
          ctx.fillStyle = `rgba(${r},${g},${b},${(ALPHA * (0.4 + 0.6 * v)).toFixed(3)})`
          ctx.fillText(ch, gx, gy)
        }
      }
    }

    const loop = (now: number) => {
      if (now - last > 1000 / FPS) {
        last = now
        draw(now / 1000)
      }
      raf = requestAnimationFrame(loop)
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      w = r.width
      h = r.height
      if (reduced) draw(8) // one calm static frame
    })
    ro.observe(canvas)
    if (!reduced) raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [variant])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  )
}
