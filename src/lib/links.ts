// External links: open http(s) URLs in the OS default browser.
// Desktop uses the Tauri opener plugin (webview blocks new windows);
// plain browsers fall back to window.open. Never throws.

import type { MouseEvent as ReactMouseEvent } from 'react'

/** True for safe-to-open web URLs. Everything else is ignored. */
export function isOpenableUrl(href: string): boolean {
  try {
    const u = new URL(href)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function openExternal(href: string): Promise<void> {
  if (!isOpenableUrl(href)) return
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(href)
    return
  } catch {
    // not running under Tauri — fall through to window.open
  }
  try {
    window.open(href, '_blank', 'noopener,noreferrer')
  } catch {
    // popups blocked — nothing more we can do
  }
}

/**
 * Click handler for rendered message HTML: intercepts anchor clicks so
 * links open outside the app instead of dying inside the webview.
 * Attach as onClickCapture on the container holding message HTML.
 */
export function onMessageLinkClick(e: ReactMouseEvent<HTMLElement>): void {
  try {
    const anchor = (e.target as HTMLElement | null)?.closest?.('a')
    const href = anchor?.getAttribute('href')
    if (!href) return
    e.preventDefault()
    e.stopPropagation()
    void openExternal(href)
  } catch {
    // malformed event — let it be
  }
}
