// Wallpapers must never rely on a fullscreen CSS blur filter. The desktop
// window is per-pixel transparent (acrylic needs it), and WebView2 inside a
// transparent window is flaky at compositing a giant `filter: blur()` layer
// — with an image wallpaper the whole UI could visually break (0.1.50-era
// reports that never fully died). So the blur is BAKED here: the stored
// 1280px jpeg is downscaled to a tiny bitmap, blurred on that small canvas
// (or left to natural smoothing when ctx.filter is missing), and handed
// back as a compact data URL the background layer can paint as-is.
//
// A module-level cache keyed by source-length + blur keeps re-bakes cheap
// while the user drags the Blur slider.

const cache = new Map<string, string>()

/** Display width of the baked bitmap. At ~8x downscale a CSS blur of
 *  `bgBlur` px on the full-size image corresponds to bgBlur/8 px here. */
const BAKE_W = 160

export async function bakeWallpaper(src: string, blurPx: number): Promise<string> {
  const key = `${src.length}:${Math.round(blurPx)}`
  const hit = cache.get(key)
  if (hit) return hit
  const baked = await new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('wallpaper decode failed'))
    img.onload = () => {
      try {
        const scale = Math.min(1, BAKE_W / Math.max(1, img.width))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        // Native canvas blur when available; at this size it is nearly free
        // and — critically — not a composited CSS filter on a fullscreen
        // layer, which is what broke the desktop UI.
        try {
          ctx.filter = `blur(${Math.max(1, blurPx / 8)}px)`
        } catch { /* older webviews: downscale alone still blurs */ }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }
    img.src = src
  })
  cache.set(key, baked)
  return baked
}

/** Drop cached bakes for a removed wallpaper. */
export function dropWallpaperCache(src: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${src.length}:`)) cache.delete(key)
  }
}
