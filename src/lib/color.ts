// Readable ink on colored surfaces: pick near-black or near-white text
// for a given background so light accents (e.g. #ffffff) never swallow text.
export function inkOn(bg: string, alpha = 1): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(bg.trim())
  if (!m) return alpha >= 1 ? '#ffffff' : `rgba(255, 255, 255, ${alpha})`
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  // Rec. 709 luma. 0.6 is the readability floor: pure white (1.0), pastels
  // and pale tints (pale yellow ~0.8, pale pink ~0.7) all flip to dark ink,
  // while classic mid-tone accents (violet ~0.22, ocean ~0.45) keep white.
  // Before, 0.78 let pale themes through and produced invisible white-on-white.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const dark = lum > 0.6
  const [rr, gg, bb] = dark ? [17, 16, 20] : [255, 255, 255]
  return alpha >= 1 ? `rgb(${rr}, ${gg}, ${bb})` : `rgba(${rr}, ${gg}, ${bb}, ${alpha})`
}

/** Whether a color is bright enough that dark ink reads better on it. */
export function isBrightFill(bg: string): boolean {
  return inkOn(bg) !== 'rgb(255, 255, 255)'
}

/** Ink for a gradient running from a to b. Dark ink as soon as EITHER end is
 *  bright — the bio sits on the accent (bottom) end, the name on the primary
 *  (top) end, and a single shared ink color must stay readable on both. The
 *  old "both ends bright" rule let a white accent paired with a dark primary
 *  pick white ink, hiding the bio on the white end. */
export function inkOnGradient(a: string, b: string, alpha = 1): string {
  const dark = isBrightFill(a) || isBrightFill(b)
  const [rr, gg, bb] = dark ? [17, 16, 20] : [255, 255, 255]
  return alpha >= 1 ? `rgb(${rr}, ${gg}, ${bb})` : `rgba(${rr}, ${gg}, ${bb}, ${alpha})`
}
