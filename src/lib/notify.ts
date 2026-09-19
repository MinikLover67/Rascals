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
