# Rascals

Private peer-to-peer chat for desktop. No accounts, no message server, no
database — friends connect directly over encrypted WebRTC, with decentralized
signaling. Text, images, files, voice messages, group chats, servers with
channels, 1:1 calls, voice channels, screensharing.

## Install on Windows

Download `Rascals_<version>_x64-setup.exe` from
[Releases](https://github.com/MinikLover67/Rascals/releases) and run it.
After the first install, updates arrive inside the app automatically.

## Install on Arch Linux (KDE Plasma and others) — one line

```bash
curl -fsSL https://raw.githubusercontent.com/MinikLover67/Rascals/main/scripts/install-linux.sh | bash
```

That installs the system pieces (WebKit webview, FUSE), downloads the newest
signed AppImage, puts it in `~/Applications`, and adds Rascals to the app
menu. The installer asks about a start-menu entry, an optional `~/Desktop`
shortcut, and launching right away. Updates then arrive inside the app like
on Windows. Re-run the same line any time to repair or jump releases.

Non-interactive / flags:

```bash
bash scripts/install-linux.sh --yes --no-shortcut   # defaults, no prompts
bash scripts/install-linux.sh --web                 # web app instead of desktop
bash scripts/install-linux.sh --help                # all options
```

> Linux support is young: the AppImage is built and smoke-checked in CI, but
> not yet battle-tested on real Arch/KDE hardware. Report issues on GitHub.

Requirements: Arch-based distro with `pacman` + `sudo`, 64-bit x86.

## Web app (Windows and Linux)

Prefer the browser? The same app ships as a static web build — full chat,
files, voice, and screensharing; identity and attachments stay in the
browser profile (localStorage/IndexedDB) on that machine.

```bash
npm install
npm run web        # builds dist-web and serves http://127.0.0.1:4173
npm run web:host   # same, reachable on the LAN (0.0.0.0)
```

On Linux the installer can do it for you (`--web`): it downloads the
`rascals-web-*.zip` from the newest release into `~/Applications/rascals-web`,
adds menu/shortcut entries, and opens the browser. No Node or desktop
runtime needed — just `python3` + `unzip`.

Differences from desktop: no window controls (use the browser's), no
auto-launch or in-app updater (reload the page / re-run for the newest
build), notifications use the browser permission prompt.

## How updates work

Every copy polls `latest.json` on this repo (daily + on demand in Settings),
verifies the minisign signature against a baked-in public key, then installs
and restarts. No accounts, no tracking — just one static file.

## Develop

```bash
npm install
npm run dev        # browser preview (separate storage per browser)
npm run tauri dev  # desktop app (needs Rust + platform webview deps)
npm run build      # frontend build (desktop dist/)
npm run build:web  # static web build (dist-web/)
npm run web        # build:web + serve locally
npm run lint       # oxlint, must be clean
```

Cut a release: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Version X.Y.Z -Notes "..."`
then publish `release/vX.Y.Z/*` as a GitHub release (see RELEASE.md).
Linux AppImage/deb builds run in CI on version tags.

## Security

See [SECURITY.md](SECURITY.md) for the threat model and the self-audit with
live proof-of-concept exploits. To report an issue, open a GitHub issue —
executable proof beats descriptions.
