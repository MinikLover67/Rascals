// Update flow: poll latest.json, verify signature (handled inside the Tauri
// plugin against the baked-in pubkey), download + install on user approval.
// Silent auto-check runs at most once a day; manual checks always run.

import { useApp } from '../store/app'
import { isWeb } from './platform'

const STAMP_KEY = 'rascals.last-update-check'
const DAY_MS = 24 * 3600 * 1000

function stamp(): void {
  try {
    localStorage.setItem(STAMP_KEY, String(Date.now()))
  } catch {
    // storage unavailable — will just check again next launch
  }
}

/** Check for updates. Sets the update banner when one is found. Never throws. */
export async function checkForUpdates(manual: boolean): Promise<string> {
  // The static web build has no bundled updater: a refresh loads the newest
  // deployed files, and self-hosted copies update by re-running `npm run web`.
  if (isWeb()) {
    return manual
      ? 'Web version: reload the page to get the newest build.'
      : 'web build — no updater'
  }
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    if (!manual) {
      let last = 0
      try {
        last = Number(localStorage.getItem(STAMP_KEY) ?? 0)
      } catch {
        last = 0
      }
      if (Date.now() - last < DAY_MS) return 'checked recently'
    }
    const update = await check()
    stamp()
    if (!update) {
      useApp.getState().dismissUpdate()
      return 'You are up to date.'
    }
    useApp.getState().setAvailableUpdate({
      version: update.version,
      notes: typeof update.body === 'string' ? update.body : '',
    })
    return `Version ${update.version} available.`
  } catch (e) {
    return e instanceof Error ? `Update check failed: ${e.message}` : 'Update check failed.'
  }
}

/** Download + install the pending update, then restart. Never throws. */
export async function installUpdate(): Promise<string> {
  if (isWeb()) return 'Web version: reload the page to get the newest build.'
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) {
      useApp.getState().dismissUpdate()
      return 'Already up to date.'
    }
    await update.downloadAndInstall()
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
    return 'Restarting...'
  } catch (e) {
    return e instanceof Error ? `Install failed: ${e.message}` : 'Install failed.'
  }
}
