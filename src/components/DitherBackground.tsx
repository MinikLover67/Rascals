// Subtle ASCII-dither gradient background — the calm cousin of 21st.dev's
// background-ascii-dither. Slow-drifting pastel blobs get sampled on a coarse
// grid and rendered as an ASCII character ramp. Low alpha + coarse cells so it
// reads as paper texture, not a screensaver (the "no headaches" brief).
// Respects prefers-reduced-motion: renders one static frame instead.

import { useEffect, useRef } from 'react'

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

function field(x: number, y: number, w: number, h: number, t: number): number {
  // 0..1 brightness from drifting radial blobs
  let v = 0
  for (const b of BLOBS) {
    const cx = w * (0.5 + 0.34 * Math.sin(t * b.sp + b.ph))
    const cy = h * (0.5 + 0.34 * Math.cos(t * b.sp * 0.8 + b.ph))
    const d = Math.hypot(x - cx, y - cy) / (b.r * Math.min(w, h) * 1.6)
    v += Math.max(0, 1 - d) * (1 - d * 0.4)
  }
  return Math.min(1, v)
}

export default function DitherBackground({ className = '' }: { className?: string }) {
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
          const v = field(gx, gy, w, h, t)
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
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  )
}
