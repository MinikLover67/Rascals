// What's-new data + the "show once per version" gate.
//
// The modal pops on the first startup after an update — never on every
// restart: we remember the last version the user has *seen* changelog for
// and only open again when the running version is newer than that.

export interface ChangelogEntry {
  version: string
  title: string
  items: Array<{ text: string; tag: 'fix' | 'new' | 'improve' }>
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.33',
    title: 'Screen sharing: smoother and finally allowed',
    items: [
      { text: 'Desktop app now auto-grants mic, camera and screen-capture permissions — screen share no longer silently fails in the installed build', tag: 'fix' },
      { text: 'Screen share encodes for motion instead of sharpness (contentHint) — cursor movement and video playback no longer stutter', tag: 'improve' },
      { text: 'Capture requests 30 fps (up to 60) at your display resolution for a smoother stream', tag: 'improve' },
    ],
  },
  {
    version: '0.1.32',
    title: 'Friends actually show each other online',
    items: [
      { text: 'Persistent Nostr channel for presence + friend requests — independent of peer discovery, so two devices on different networks now see each other online (the "both offline" bug)', tag: 'fix' },
      { text: 'Friend requests land even when the recipient is offline at send time; fetched on next connect', tag: 'new' },
      { text: 'Changelog now shows only the current version; older release notes link to GitHub', tag: 'improve' },
    ],
  },
  {
    version: '0.1.31',
    title: 'Friend requests reach offline peers',
    items: [
      { text: 'New-update changelog — this window — shown once after an update, never again until the next one', tag: 'new' },
      { text: 'Light/dark theme toggle with live preview in Settings → Appearance', tag: 'new' },
      { text: 'Settings header shows the active section; clearer theme cards', tag: 'improve' },
      { text: 'Mutual friend-add no longer needs an app restart', tag: 'fix' },
    ],
  },
  {
    version: '0.1.30',
    title: 'Light theme + connection fixes',
    items: [
      { text: 'Light theme with pale lilac rail, white panels and dither background', tag: 'new' },
      { text: 'Persistent lobby for pending friend requests — knocks land while the peer is online', tag: 'fix' },
      { text: 'Startup knock + 30s retry for outgoing friend requests', tag: 'fix' },
      { text: 'Flat logo mark and neutral beta pill in the rail', tag: 'improve' },
    ],
  },
  {
    version: '0.1.29',
    title: 'Stability pass',
    items: [
      { text: 'Mutual simultaneous friend-add race fixed', tag: 'fix' },
      { text: 'Connection doctor + debug server for relay diagnostics', tag: 'new' },
      { text: 'Rail chips and window controls readable in both themes', tag: 'fix' },
    ],
  },
]

const SEEN_KEY = 'rascals.changelog-seen.v1'

/** True when the running version is newer than the last one the user saw. */
export function shouldShowChangelog(appVersion: string): boolean {
  if (!appVersion) return false
  const seen = localStorage.getItem(SEEN_KEY)
  if (!seen) return true // first ever run with the changelog feature
  return appVersion !== seen
}

/** Call when the user closes the modal: remember this version as seen. */
export function markChangelogSeen(appVersion: string): void {
  if (!appVersion) return
  localStorage.setItem(SEEN_KEY, appVersion)
}
