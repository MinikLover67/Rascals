// Full-app background layer for the non-standard looks. Sits behind every
// panel; combined with the [data-bg-glass] CSS in index.css (panels turn
// translucent + backdrop-blurred), this produces the acrylic / image /
// ASCII looks chosen in Settings → Appearance → App background.

import { useApp } from '../store/app'
import DitherBackground, { type AsciiStyle } from './DitherBackground'

// True acrylic (desktop app) is drawn by Windows behind a transparent
// window — this layer must stay empty there. Browser builds have no OS
// blur, so they fall back to the CSS blobs below.
const isDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export default function AppBackground() {
  const bgMode = useApp((s) => s.settings.bgMode)
  const bgImage = useApp((s) => s.settings.bgImage)
  const bgBlur = useApp((s) => s.settings.bgBlur)
  const bgAscii = useApp((s) => s.settings.bgAscii)

  if (bgMode === 'standard') return null

  // The user's picture shows in image mode AND behind the ASCII field, so
  // picking an animation doesn't throw the wallpaper away.
  const showImage = !!bgImage && (bgMode === 'image' || bgMode === 'ascii')

  if (bgMode === 'ascii') {
    return (
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        {bgImage && (
          <div
            className="absolute inset-[-48px] bg-cover bg-center"
            style={{
              backgroundImage: `url("${bgImage}")`,
              filter: `blur(${bgBlur}px)`,
            }}
          />
        )}
        <DitherBackground variant={bgAscii as AsciiStyle} />
        {/* Characters must stay readable over the picture. */}
        {bgImage && <div className="absolute inset-0 bg-rascal-bg/35" />}
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Acrylic: soft drifting color blobs under a heavy blur. Only the
          browser fallback — the desktop app shows the real desktop instead. */}
      {bgMode === 'acrylic' &&
        !isDesktopApp && (
          <div
            className="absolute inset-[-40px]"
            style={{
              background:
                'radial-gradient(42rem 42rem at 18% 12%, rgb(124 108 255 / 0.35), transparent 60%),' +
                'radial-gradient(38rem 38rem at 82% 24%, rgb(76 196 255 / 0.28), transparent 62%),' +
                'radial-gradient(46rem 46rem at 62% 88%, rgb(167 139 250 / 0.3), transparent 58%),' +
                'radial-gradient(30rem 30rem at 10% 82%, rgb(255 122 217 / 0.22), transparent 60%)',
              filter: `blur(${Math.max(10, bgBlur)}px) saturate(1.15)`,
            }}
          />
        )}
      {/* Image mode: the user's own picture, blurred + dimmed for legibility. */}
      {showImage && (
        <div
          className="absolute inset-[-48px] bg-cover bg-center"
          style={{
            backgroundImage: `url("${bgImage}")`,
            filter: `blur(${bgBlur}px)`,
          }}
        />
      )}
      {/* Readability veil: image/ascii paint over a real picture. Acrylic
          never gets one — the whole point is seeing through, and the glass
          panels carry contrast themselves. */}
      {bgMode !== 'acrylic' && <div className="absolute inset-0 bg-rascal-bg/55" />}
    </div>
  )
}
