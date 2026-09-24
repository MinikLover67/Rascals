import type { CSSProperties } from 'react'

// Display-name styles (Nitro-for-free): gradient/glow treatments rendered
// anywhere names show. Style travels as a tiny id string, so peers render
// your look without moving image bytes.

export interface NameStyle {
  id: string
  label: string
  preview: CSSProperties
}

const GRADIENT = (from: string, to: string): CSSProperties => ({
  backgroundImage: `linear-gradient(90deg, ${from}, ${to})`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
})

export const NAME_STYLES: NameStyle[] = [
  { id: 'default', label: 'Default', preview: {} },
  { id: 'sunset', label: 'Sunset', preview: GRADIENT('#ff9a3c', '#ff4d6d') },
  { id: 'ocean', label: 'Ocean', preview: GRADIENT('#3ddcff', '#7c6cff') },
  { id: 'forest', label: 'Forest', preview: GRADIENT('#3ddc84', '#b8f135') },
  { id: 'gold', label: 'Gold', preview: GRADIENT('#ffd76a', '#ff9a3c') },
  { id: 'rose', label: 'Rose', preview: GRADIENT('#ff7ab8', '#b388ff') },
  {
    id: 'neon',
    label: 'Neon',
    preview: { color: '#fff', textShadow: '0 0 8px #7c6cff, 0 0 18px #7c6cff' },
  },
  {
    id: 'ghost',
    label: 'Ghost',
    preview: { color: '#fff', opacity: 0.75, letterSpacing: '0.08em' },
  },
]

export function nameStyleProps(id: string | undefined): CSSProperties {
  return NAME_STYLES.find((s) => s.id === id)?.preview ?? {}
}

/** Gradient banner presets for profile headers without an image. */
export const BANNER_PRESETS: Array<{ id: string; label: string; css: string }> = [
  { id: 'sunset', label: 'Sunset', css: 'linear-gradient(120deg, #ff9a3c, #ff4d6d)' },
  { id: 'ocean', label: 'Ocean', css: 'linear-gradient(120deg, #0ea5e9, #7c6cff)' },
  { id: 'grape', label: 'Grape', css: 'linear-gradient(120deg, #7c6cff, #e879f9)' },
  { id: 'forest', label: 'Forest', css: 'linear-gradient(120deg, #0d9b52, #b8f135)' },
  { id: 'ember', label: 'Ember', css: 'linear-gradient(120deg, #3a0d0d, #ff4d2e)' },
  { id: 'mono', label: 'Mono', css: 'linear-gradient(120deg, #26272f, #101014)' },
]

export function bannerPresetCss(id: string | undefined): string | null {
  return BANNER_PRESETS.find((p) => p.id === id)?.css ?? null
}
