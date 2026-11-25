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
    version: '0.1.53',
    title: 'Icon fix',
    items: [
      { text: 'The desktop icon had white corners. Gone — the tile sits on transparency now.', tag: 'fix' },
    ],
  },
  {
    version: '0.1.52',
    title: 'New look, honest demo',
    items: [
      { text: 'New logo: two chat bubbles. No more Steam look-alike.', tag: 'new' },
      { text: 'The demo gif is the real app now — no more fake cards and floating icons.', tag: 'improve' },
    ],
  },
  {
    version: '0.1.51',
    title: 'Acrylic is see-through now',
    items: [
      { text: 'Acrylic now blurs your desktop behind the window. No fake blur, no dimming.', tag: 'new' },
      { text: 'Shorter, simpler words in settings.', tag: 'improve' },
    ],
  },
  {
    version: '0.1.50',
    title: 'Pairing messages that stay put, QRs from Rust',
    items: [
      { text: 'When no phone joins within 3 minutes, the "No phone joined within 3 minutes." message now stays on screen — it used to flash and vanish the instant pairing ended, leaving you staring at the old QR with no explanation; the same fix keeps "Done — account copied to your phone." visible after a successful transfer', tag: 'fix' },
      { text: 'QR codes are now drawn by the Rust engine inside the desktop app (decode round-trip verified) — the web beta keeps its JavaScript fallback', tag: 'improve' },
      { text: 'New automated UI check (scripts/ui-verify.mjs) walks the real app headless on every release: wallpaper layering, accent picker, pairing honesty, mobile layout at 375 px', tag: 'improve' },
    ],
  },
  {
    version: '0.1.49',
    title: 'Real server under the hood, honest repo face',
    items: [
      { text: 'The built-in phone server now runs on a real web framework (axum): proper request routing, correct headers, a clean 404 for stray paths, and tidy shutdown when the toggle goes off — the old hand-rolled responder ignored requests entirely', tag: 'improve' },
      { text: 'GitHub now shows what Rascals is actually made of: TypeScript for the app plus Rust for the shell — committed build artifacts are marked generated so they stop claiming 81% HTML', tag: 'improve' },
    ],
  },
  {
    version: '0.1.48',
    title: 'Pairing tells the truth: connecting before receiving',
    items: [
      { text: 'The phone no longer shows "Receiving 0%" while it is actually just looking for the computer — tapping "Receive from my computer" now shows a connecting state, and once the PC is found you see "Computer found — opening the data line…" before any percentage appears', tag: 'fix' },
      { text: 'Timeout messages now say what to do: keep the screen open and press "Pair my phone" on the computer again, then scan the fresh QR', tag: 'fix' },
      { text: 'Starting the phone server no longer flashes a Windows console window (the Tailscale IP check spawned tailscale.exe visibly)', tag: 'fix' },
    ],
  },
  {
    version: '0.1.47',
    title: 'Phone alpha: the desktop app hosts the phone itself',
    items: [
      { text: 'New "Start phone server" toggle in Settings → Connection (desktop app): Rascals runs a tiny built-in web server and the QR points straight at it over Tailscale or LAN — no manual hosting, no python, no tools', tag: 'new' },
      { text: 'The server prefers your Tailscale IP (100.x…, CLI including the Windows install path) and falls back to your LAN address automatically', tag: 'improve' },
      { text: 'Pairing QR uses the server URL, so the phone opens the app served from your PC and receives the account P2P as before; toggle off stops the server', tag: 'improve' },
    ],
  },
  {
    version: '0.1.46',
    title: 'Mobile polish: real moments instead of dead ends',
    items: [
      { text: 'Onboarding now celebrates the moment it was built for: after "Create my identity" your avatar pops with "You\'re in, {name}." before the app opens', tag: 'improve' },
      { text: 'Phone pairing ends with a greeting: once the account lands, the phone shows "You\'re all set, {name}." before rebooting into it', tag: 'improve' },
      { text: 'The friends empty state got a real card with the Rascals mark and two clear actions — "Show my invite code" (accent, thumb-friendly) and "Paste a friend\'s code"', tag: 'improve' },
    ],
  },
  {
    version: '0.1.45',
    title: 'Settings layout fixed, honest titlebar',
    items: [
      { text: 'Settings was rendering its navigation stacked on top of the content instead of side by side — the Discord-style two-pane layout is back, and on the phone the nav is now a horizontal chip row above the content', tag: 'fix' },
      { text: 'The decorative – □ × window buttons only show in the real desktop app now — in the browser they were dead controls that made people wonder which build they were on', tag: 'fix' },
    ],
  },
  {
    version: '0.1.44',
    title: 'Pairing pushes your account to the phone — no backup file',
    items: [
      { text: 'Real device pairing: press "Pair my phone" in Settings → Connection and the QR becomes a one-time pairing link — the phone receives your whole account (identity, friends, servers, chats) streamed directly from the PC over P2P, end to end encrypted, nothing through a server', tag: 'new' },
      { text: 'Fresh pairing screen on the phone: scan the QR, tap "Receive from my computer", watch the progress — the app then boots straight into your PC account', tag: 'improve' },
      { text: 'Pairing uses a fresh 96-bit key per transfer inside the QR hash; the stream travels in 32 KB chunks over the same verified Trystero channels as file transfers', tag: 'improve' },
    ],
  },
  {
    version: '0.1.43',
    title: 'Phone view, QR pairing, real color options',
    items: [
      { text: 'Discord-style phone view: single-pane layout with bottom nav (Chats / Profile / Settings), back button in every chat, full-screen settings — open the webapp on your phone and it just works', tag: 'new' },
      { text: 'QR pairing in Settings → Connection: the webapp shows a QR of its own address — scan with the phone camera, same app opens, sign in with a new account or restore a backup to carry this one over', tag: 'new' },
      { text: 'Accent color row now has a real "Custom" option chip (with color dot), and every color picker gained a "Pick from screen" eyedropper where the browser supports it', tag: 'improve' },
      { text: 'Profile avatar is now exactly centered on the banner boundary (was a few px off)', tag: 'fix' },
    ],
  },
  {
    version: '0.1.42',
    title: 'No more invisible text on white/pale themes',
    items: [
      { text: 'Fixed white-on-white: a white or pale profile-theme accent (where the bio sits) used to keep white ink and vanish — the contrast rule now flips to dark ink as soon as either gradient end is bright, in both directions', tag: 'fix' },
      { text: 'Lowered the readability threshold so pale accents (mint, ocean, amber, pink, pale yellow) also get dark ink on accent buttons and the profile card — classic dark/mid-tone accents (violet, rose) keep white ink as before', tag: 'improve' },
      { text: 'Color-picker pipette icon is now always visible on every picker (accent, banner, name-style gradient) instead of only on hover', tag: 'improve' },
    ],
  },
  {
    version: '0.1.41',
    title: 'Backgrounds that stick + live preview',
    items: [
      { text: 'Fixed: background choices could silently vanish across restarts — a storage-quota error aborted the whole settings save (wallpaper now lives in its own storage slot and every setting persists independently)', tag: 'fix' },
      { text: 'Live preview in Settings → Appearance: watch the background compose (image, blur, ASCII, glass panels) right inside the modal — no more closing it just to check', tag: 'new' },
      { text: 'Your wallpaper now also shows behind the ASCII animation instead of disappearing when you switch modes', tag: 'improve' },
      { text: 'Settings content column is narrower and centered, Discord-style vertical rhythm', tag: 'improve' },
      { text: 'Actually shipped v0.1.39/40: last release push had failed, so installed apps never got the message-delivery, presence and settings fixes', tag: 'fix' },
    ],
  },
  {
    version: '0.1.40',
    title: 'Customize profile goes vertical',
    items: [
      { text: 'Customize profile rebuilt around a vertical nav rail (Bio / Avatar / Banner / Theme / Name style) — same design as the settings modal, horizontal tab strip gone', tag: 'improve' },
      { text: 'Live profile preview now sits as a compact strip above the controls, always visible while you edit', tag: 'improve' },
      { text: 'Avatar crop hint moved into the Avatar section — less clutter on the main area', tag: 'improve' },
    ],
  },
  {
    version: '0.1.39',
    title: 'Messages you can trust + a real settings glow-up',
    items: [
      { text: 'No more vanishing messages: everything un-confirmed is retried automatically until the other side acknowledges it — dead connections, lost acks and mid-send dropouts all recover now', tag: 'fix' },
      { text: 'Online status is honest: stale presence replays from relays can no longer light up friends who went offline hours ago', tag: 'fix' },
      { text: 'Ghost "online" friends fall offline again — the old never-expire loophole for older app versions is gone', tag: 'fix' },
      { text: 'Your profile moved to the bottom of the icon rail where it belongs, like every chat app — no more floating mid-sidebar', tag: 'improve' },
      { text: 'Settings rebuilt: big window, grouped vertical sections, solid active highlight — no more cramped text soup', tag: 'improve' },
      { text: 'App backgrounds: frosted Acrylic blur (Explorer-style), your own image, or ASCII animations (Drift, Stars, Rain) — panels turn glass automatically', tag: 'new' },
      { text: 'Every color picker is now Rascals-styled: saturation pad, hue rail, hex field, curated swatches — the browser popup is gone', tag: 'improve' },
      { text: 'Name style custom builder cut from nine knobs to the three that matter: two colors + glow', tag: 'improve' },
      { text: 'Light theme contrast: muted text, scrollbars and selected chips keep readable contrast on white panels', tag: 'fix' },
      { text: 'Relays carry half the load: signaling uses 7 of 11 relays instead of all of them, discovery stays just as reliable', tag: 'improve' },
    ],
  },
  {
    version: '0.1.37',
    title: 'Profile cards get a bio and a proper layout',
    items: [
      { text: 'New About-you field: write a short bio in Customize profile → About, it shows under your name on your card and syncs to your friends', tag: 'new' },
      { text: 'Profile card redesigned after Discord: taller banner, bigger avatar with a clean ring, bio front and center, no more alpha note', tag: 'improve' },
      { text: 'Bright accents stay readable: text on profile cards and accent buttons flips dark automatically when you pick white or a pale color', tag: 'fix' },
      { text: 'Light theme: selected color swatches and the customize preview keep their contrast, the tab text is readable everywhere', tag: 'fix' },
      { text: 'Dropping a file now focuses the composer, so Enter sends the staged files instead of poking the last button you touched', tag: 'fix' },
      { text: 'Message actions (reply, react, copy, pin, edit, delete) fade in smoothly on hover instead of popping instantly', tag: 'improve' },
      { text: 'GIF avatars up to 4 MB and GIF banners up to 8 MB, static images keep auto-resizing without any notice', tag: 'improve' },
      { text: 'The empty chat screen says less and helps more, minus the purple prose', tag: 'improve' },
    ],
  },
  {
    version: '0.1.36',
    title: 'Top bar and side rail follow your color',
    items: [
      { text: 'Light theme: the top bar and side navigation rail now use a deepened version of your accent color instead of fixed lilac — recolors live with the Accent picker, white text stays readable on every preset', tag: 'improve' },
      { text: 'Appearance theme preview card updated to match the new accent rail', tag: 'improve' },
    ],
  },
  {
    version: '0.1.35',
    title: 'The logo follows your colors',
    items: [
      { text: 'Light theme: the logo no longer shows a black tile — top-left and welcome mark now use an accent-colored tile that fits the light surfaces', tag: 'fix' },
      { text: 'Your accent color (Settings → Appearance → Accent color) now recolors the in-app logo live, not just buttons and highlights', tag: 'improve' },
    ],
  },
  {
    version: '0.1.34',
    title: 'Camera calls, app lock and full backups',
    items: [
      { text: 'Webcam calls — turn on your camera in any call or voice channel; remotes see a live tile, you get a local preview', tag: 'new' },
      { text: 'App lock — optional PIN required on every start (Settings → Security), salted hash stored locally only', tag: 'new' },
      { text: 'Full backup — Profile → "Full backup" exports identity, contacts, servers, keys and chats as one file; Restore imports it', tag: 'new' },
      { text: 'Built-in TURN fallback — calls now connect on strict NAT/firewalls with zero setup, and "Hide my IP" works without a self-hosted relay', tag: 'improve' },
      { text: 'New unified logo and app icons everywhere (installer, desktop shortcut, tray, in-app)', tag: 'improve' },
      { text: 'README now documents honest limitations vs roadmap', tag: 'improve' },
    ],
  },
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
