// Platform detection: Tauri desktop vs plain browser (web app).
// The web build is the same React frontend served statically — identity,
// P2P (Trystero/WebRTC), files (IndexedDB), voice and screensharing all run
// on browser APIs. Only Tauri-native pieces (window controls, autostart,
// in-app updater, native notifications) degrade gracefully.

declare global {
  interface Window {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
  }
}

declare const __APP_VERSION__: string | undefined

/** True when running inside the Tauri webview (desktop app). */
export function isTauri(): boolean {
  try {
    if (typeof window === 'undefined') return false
    return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
  } catch {
    return false
  }
}

/** True when running as the static web build in a regular browser. */
export function isWeb(): boolean {
  return !isTauri()
}

/** App version: Tauri bundle version on desktop, package version baked at web build time. */
export async function appVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      return await getVersion()
    } catch {
      // fall through to baked version
    }
  }
  try {
    if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__) return __APP_VERSION__
  } catch {
    // define not present (dev) — ignore
  }
  return 'web'
}
