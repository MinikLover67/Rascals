// Web auto-login ("weblink"): the desktop app publishes its own identity
// backup to its private app-data dir; the local static server exposes it at
// /rascals-account.json (localhost only); a browser with no identity of its
// own fetches it on boot and signs in with zero clicks. Same-machine only —
// the file never leaves the PC, and the browser's own identity always wins.

import { exportIdentity, importIdentity, type Identity } from './identity'
import { isTauri } from './platform'

export const WEBLINK_URL = '/rascals-account.json'

/** Desktop only: publish the local backup for the web server. Throws with a message. */
export async function publishWeblink(): Promise<void> {
  if (!isTauri()) return
  const text = await exportIdentity()
  if (!text) throw new Error('No identity to share yet.')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_weblink', { contents: text })
}

/** Desktop only: remove the published login. Never throws. */
export async function unpublishWeblink(): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('clear_weblink')
  } catch {
    // already gone or desktop too old — nothing to do
  }
}

/** Web only: fetch the desktop-published login, if the local server has one. */
export async function fetchWeblinkIdentity(): Promise<Identity | null> {
  try {
    const res = await fetch(WEBLINK_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const text = (await res.text()).slice(0, 16 * 1024)
    return await importIdentity(text).catch(() => null)
  } catch {
    return null
  }
}
