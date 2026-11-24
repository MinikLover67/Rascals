import { useEffect, useRef, useState } from 'react'
import { Pipette, X } from 'lucide-react'

// Rascals-native color picker: SV area + hue rail + hex field + curated
// swatches, styled like every other Rascals surface. Replaces the raw
// browser <input type="color"> popup everywhere (it broke the look — a
// native widget floating over a themed modal reads as unfinished).

interface Hsv {
  h: number
  s: number
  v: number
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function hexToHsv(hex: string): Hsv {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return { h: 258, s: 0.76, v: 1 }
  const int = parseInt(m[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

const SWATCHES = [
  '#7c6cff', '#4cc4ff', '#3ddc84', '#ffb224',
  '#ff5d5d', '#ff7ad9', '#a78bfa', '#f0abfc',
  '#38bdf8', '#34d399', '#fbbf24', '#f87171',
  '#111114', '#3f3f46', '#a1a1aa', '#ffffff',
]

export default function ColorPicker({
  value,
  onChange,
  label = 'Pick a color',
  compact = false,
  labeled = false,
}: {
  value: string
  onChange: (hex: string) => void
  label?: string
  compact?: boolean
  /** Render as a labeled "Custom" chip instead of a bare swatch — makes the
   *  picker readable as an option next to preset swatches. */
  labeled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const popRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  // Viewport-anchored popover coordinates: the picker must escape the
  // modal's overflow containers (absolute would get clipped by them).
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const POKE_W = 256 + 16
    const POKE_H = 330
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POKE_W))
    const below = rect.bottom + 8
    const top =
      below + POKE_H > window.innerHeight && rect.top - POKE_H > 8
        ? rect.top - POKE_H
        : below
    setPos({ left, top })
  }, [open])

  // Track outside edits of `value` (e.g. a preset elsewhere changed it).
  useEffect(() => {
    if (!open) setHsv(hexToHsv(value))
  }, [value, open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function apply(next: Hsv) {
    setHsv(next)
    onChange(hsvToHex(next))
  }

  const svRef = useRef<HTMLDivElement>(null)

  function svPointer(e: React.PointerEvent) {
    const el = svRef.current
    if (!el || (e.type === 'pointerdown' && e.button !== 0)) return
    const rect = el.getBoundingClientRect()
    const s = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    const v = 1 - clamp((e.clientY - rect.top) / rect.height, 0, 1)
    apply({ ...hsv, s, v })
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={label}
        aria-label={label}
        aria-expanded={open}
        data-testid="color-picker-button"
        className={`group relative flex items-center justify-center overflow-hidden rounded-xl border border-rascal-line transition-transform duration-150 ease-smooth hover:scale-105 ${
          labeled
            ? 'h-7 gap-1.5 px-2.5'
            : compact
              ? 'h-7 w-7'
              : 'h-9 w-9'
        }`}
        style={labeled ? { borderColor: value } : { backgroundColor: value }}
      >
        {!labeled && (
          <span
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
            style={{
              background:
                'conic-gradient(from 0deg, #ff5d5d, #ffb224, #3ddc84, #4cc4ff, #7c6cff, #ff7ad9, #ff5d5d)',
              maskImage:
                'radial-gradient(circle, transparent 0 55%, black 56% 100%)',
              WebkitMaskImage:
                'radial-gradient(circle, transparent 0 55%, black 56% 100%)',
            }}
          />
        )}
        {labeled ? (
          <>
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/25"
              style={{ backgroundColor: value }}
            />
            <span className="text-xs font-semibold">Custom</span>
          </>
        ) : (
          <Pipette
            size={compact ? 12 : 14}
            // Always visible: a plain color square next to the accent presets
            // read as "yet another preset" instead of "pick any color".
            className="relative opacity-90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)] transition-opacity group-hover:opacity-100"
            style={{ color: hsvToHex({ ...hsv, v: 1 - hsv.v, s: hsv.v > 0.6 ? hsv.s : 0 }) }}
          />
        )}
      </button>

      {open && pos && (
        <div
          ref={popRef}
          data-testid="color-picker-pop"
          className="fixed z-[60] w-64 rounded-xl border border-rascal-line bg-rascal-panel p-3 shadow-raised card-pop"
          style={{ left: pos.left, top: pos.top }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Saturation × value pad */}
          <div
            ref={svRef}
            onPointerDown={(e) => {
              ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
              svPointer(e)
            }}
            onPointerMove={(e) => {
              if (e.buttons & 1) svPointer(e)
            }}
            className="relative h-36 w-full cursor-crosshair touch-none rounded-lg border border-rascal-line"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
            }}
          >
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                backgroundColor: hsvToHex(hsv),
              }}
            />
          </div>
          {/* Hue rail */}
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={Math.round(hsv.h)}
            onChange={(e) => apply({ ...hsv, h: Number(e.target.value) })}
            aria-label="Hue"
            className="mt-3 h-3 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-md"
            style={{
              background:
                'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            }}
          />
          <div className="mt-3 flex items-center gap-2">
            <span
              className="h-8 w-8 shrink-0 rounded-lg border border-rascal-line"
              style={{ backgroundColor: value }}
            />
            <input
              value={value}
              onChange={(e) => {
                const hex = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
                if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                  setHsv(hexToHsv(hex))
                  onChange(hex)
                }
              }}
              spellCheck={false}
              aria-label="Hex color"
              className="w-24 rounded-lg border border-rascal-line bg-rascal-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-rascal-accent"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto rounded-lg p-1.5 text-rascal-dim hover:bg-white/5 hover:text-rascal-text"
              aria-label="Close color picker"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-8 gap-1.5">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => {
                  setHsv(hexToHsv(hex))
                  onChange(hex)
                }}
                title={hex}
                aria-label={`Use ${hex}`}
                className="h-5 w-5 rounded-md border transition-transform hover:scale-110"
                style={{
                  backgroundColor: hex,
                  borderColor: value.toLowerCase() === hex.toLowerCase() ? 'var(--color-rascal-text)' : 'rgb(255 255 255 / 0.15)',
                }}
              />
            ))}
          </div>
          {/* Screen eyedropper (Chromium desktop): sample any pixel on screen. */}
          {'EyeDropper' in window && (
            <button
              type="button"
              data-testid="eyedropper-button"
              onClick={async () => {
                try {
                  // @ts-expect-error — EyeDropper is still non-standard TS-wise
                  const res = await new window.EyeDropper().open()
                  if (res?.sRGBHex) {
                    setHsv(hexToHsv(res.sRGBHex))
                    onChange(res.sRGBHex)
                  }
                } catch {
                  // user cancelled the eyedropper — keep the current color
                }
              }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-rascal-line py-1.5 text-xs font-semibold text-rascal-dim transition-colors hover:border-rascal-accent/60 hover:text-rascal-text"
            >
              <Pipette size={13} />
              Pick from screen
            </button>
          )}
        </div>
      )}
    </div>
  )
}
