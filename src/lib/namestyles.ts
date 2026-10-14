import type { CSSProperties } from 'react'

// Display-name styles (Nitro-for-free): gradient/glow treatments rendered
// anywhere names show. Style travels as a tiny id string, so peers render
// your look without moving image bytes.
//
// Built-in styles ship as short ids. Custom styles (user-built in the
// customize modal) are encoded as `custom:<base64url>` payloads so they
// still travel as one string.

export interface NameStyle {
  id: string
  label: string
  preview: CSSProperties
}

export interface CustomNameStyleSpec {
  /** gradient start */
  from: string
  /** gradient end */
  to: string
  /** degrees */
  angle: number
  /** glow color (or '' for none) */
  glow: string
  /** glow blur px */
  glowSize: number
  /** letter spacing em */
  tracking: number
  /** font weight */
  weight: number
  /** animate? */
  animate: boolean
  /** font family key */
  font: 'default' | 'mono' | 'serif' | 'rounded'
}

const FONTS: Record<CustomNameStyleSpec['font'], string> = {
  default: 'inherit',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
}

const GRADIENT = (from: string, to: string, angle = 90): CSSProperties => ({
  backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
})

function withGlow(base: CSSProperties, glow: string, glowSize: number): CSSProperties {
  if (!glow) return base
  return { ...base, textShadow: `0 0 ${Math.max(2, glowSize / 2)}px ${glow}, 0 0 ${glowSize}px ${glow}` }
}

const p = (spec: Partial<CustomNameStyleSpec>): CustomNameStyleSpec => ({
  from: spec.from ?? '#7c6cff',
  to: spec.to ?? '#3ddcff',
  angle: spec.angle ?? 90,
  glow: spec.glow ?? '',
  glowSize: spec.glowSize ?? 12,
  tracking: spec.tracking ?? 0,
  weight: spec.weight ?? 700,
  animate: spec.animate ?? false,
  font: spec.font ?? 'default',
})

export const NAME_STYLES: NameStyle[] = [
  { id: 'default', label: 'Default', preview: {} },
  { id: 'sunset', label: 'Sunset', preview: GRADIENT('#ff9a3c', '#ff4d6d') },
  { id: 'ocean', label: 'Ocean', preview: GRADIENT('#3ddcff', '#7c6cff') },
  { id: 'forest', label: 'Forest', preview: GRADIENT('#3ddc84', '#b8f135') },
  { id: 'gold', label: 'Gold', preview: GRADIENT('#ffd76a', '#ff9a3c') },
  { id: 'rose', label: 'Rose', preview: GRADIENT('#ff7ab8', '#b388ff') },
  { id: 'neon', label: 'Neon', preview: withGlow({ color: '#fff' }, '#7c6cff', 18) },
  { id: 'ghost', label: 'Ghost', preview: { color: '#fff', opacity: 0.75, letterSpacing: '0.08em' } },
  { id: 'ember', label: 'Ember', preview: withGlow(GRADIENT('#ff4d2e', '#ff9a3c'), '#ff4d2e', 16) },
  { id: 'frost', label: 'Frost', preview: withGlow(GRADIENT('#a5f3fc', '#7c6cff'), '#a5f3fc', 14) },
  { id: 'plasma', label: 'Plasma', preview: withGlow(GRADIENT('#ff7ab8', '#7c6cff', 135), '#ff7ab8', 20) },
  { id: 'outline', label: 'Outline', preview: { color: 'transparent', WebkitTextStroke: '1.5px #7c6cff' } as CSSProperties },
]

function encodeCustom(spec: CustomNameStyleSpec): string {
  try {
    const compact = JSON.stringify({
      f: spec.from, t: spec.to, a: spec.angle, g: spec.glow, gs: spec.glowSize,
      tr: spec.tracking, w: spec.weight, an: spec.animate, fo: spec.font,
    })
    // base64url
    return 'custom:' + btoa(compact).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  } catch {
    return 'default'
  }
}

export function encodeCustomNameStyle(spec: Partial<CustomNameStyleSpec>): string {
  return encodeCustom(p(spec))
}

export function decodeCustomNameStyle(id: string): CustomNameStyleSpec | null {
  if (!id.startsWith('custom:')) return null
  try {
    let b64 = id.slice('custom:'.length).replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const raw = JSON.parse(atob(b64)) as Record<string, unknown>
    return p({
      from: typeof raw.f === 'string' ? raw.f : undefined,
      to: typeof raw.t === 'string' ? raw.t : undefined,
      angle: typeof raw.a === 'number' ? raw.a : undefined,
      glow: typeof raw.g === 'string' ? raw.g : undefined,
      glowSize: typeof raw.gs === 'number' ? raw.gs : undefined,
      tracking: typeof raw.tr === 'number' ? raw.tr : undefined,
      weight: typeof raw.w === 'number' ? raw.w : undefined,
      animate: typeof raw.an === 'boolean' ? raw.an : undefined,
      font: raw.fo === 'mono' || raw.fo === 'serif' || raw.fo === 'rounded' || raw.fo === 'default' ? raw.fo : undefined,
    })
  } catch {
    return null
  }
}

export function nameStyleProps(id: string | undefined): CSSProperties {
  if (!id) return {}
  if (id.startsWith('custom:')) {
    const spec = decodeCustomNameStyle(id)
    if (!spec) return {}
    const base = spec.from && spec.to
      ? (spec.from === spec.to
          ? { color: spec.from, fontWeight: spec.weight }
          : GRADIENT(spec.from, spec.to, spec.angle))
      : { color: spec.from, fontWeight: spec.weight }
    const out: CSSProperties = {
      ...withGlow(base, spec.glow, spec.glowSize),
      letterSpacing: `${spec.tracking}em`,
      fontWeight: spec.weight,
      fontFamily: FONTS[spec.font],
    }
    if (spec.animate) {
      out.animation = 'rascalNameShift 3s ease-in-out infinite alternate'
      out.backgroundSize = '200% 200%'
    }
    return out
  }
  return NAME_STYLES.find((s) => s.id === id)?.preview ?? {}
}

export const BANNER_PRESETS: Array<{ id: string; label: string; css: string }> = [
  { id: 'sunset', label: 'Sunset', css: 'linear-gradient(120deg, #ff9a3c, #ff4d6d)' },
  { id: 'ocean', label: 'Ocean', css: 'linear-gradient(120deg, #0ea5e9, #7c6cff)' },
  { id: 'grape', label: 'Grape', css: 'linear-gradient(120deg, #7c6cff, #e879f9)' },
  { id: 'forest', label: 'Forest', css: 'linear-gradient(120deg, #0d9b52, #b8f135)' },
  { id: 'ember', label: 'Ember', css: 'linear-gradient(120deg, #3a0d0d, #ff4d2e)' },
  { id: 'mono', label: 'Mono', css: 'linear-gradient(120deg, #26272f, #101014)' },
  { id: 'aurora', label: 'Aurora', css: 'linear-gradient(120deg, #3ddcff, #3ddc84, #7c6cff)' },
]

export function bannerPresetCss(id: string | undefined): string | null {
  return BANNER_PRESETS.find((p) => p.id === id)?.css ?? null
}