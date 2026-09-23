// Native notifications: Tauri plugin on desktop, Web API in browsers.
// Quietly no-ops wherever unsupported. Never throws.

import { useApp } from '../store/app'

export async function notifyUser(title: string, body: string): Promise<void> {
  try {
    if (!useApp.getState().settings.notifications) return
    // Tauri desktop first.
    try {
      const plugin = await import('@tauri-apps/plugin-notification')
      if (await plugin.isPermissionGranted()) {
        plugin.sendNotification({ title, body })
        return
      }
      const perm = await plugin.requestPermission()
      if (perm === 'granted') {
        plugin.sendNotification({ title, body })
        return
      }
    } catch {
      // not running under Tauri — fall through to Web API
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission().catch(() => 'denied' as const)
        if (perm === 'granted') new Notification(title, { body })
      }
    }
  } catch {
    // notifications are garnish, never errors
  }
}

/** Ask the OS for notification permission up front (desktop). Lazy asking
 * at first-message time can fail silently outside a user gesture. */
export async function ensureNotifyPermission(): Promise<void> {
  try {
    if (!useApp.getState().settings.notifications) return
    const plugin = await import('@tauri-apps/plugin-notification')
    if (!(await plugin.isPermissionGranted())) {
      await plugin.requestPermission().catch(() => {})
    }
  } catch {
    // browsers ask on first notify instead
  }
}

/** Flash the taskbar/dock when a message lands while hidden. Best effort. */
export async function flashTaskbar(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().requestUserAttention(null)
  } catch {
    // browser preview or denied capability — ignore
  }
}

/** True when the window is hidden (tray/background tab). */
export function isHidden(): boolean {
  try {
    return typeof document !== 'undefined' && document.hidden
  } catch {
    return false
  }
}
