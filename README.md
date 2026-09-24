# Rascals — Beta (still testing, bugs to fix)

Private peer-to-peer chat for desktop. No accounts, no message server, no
database — friends connect directly over encrypted WebRTC, with decentralized
signaling. Text, images, files, voice messages, group chats, servers with
channels, 1:1 calls, voice channels, screensharing.

Invite codes work across the internet: different Wi-Fi, different cities —
if you're both online, you connect. Strict NAT? Add a TURN server in
Settings and media still stays end-to-end encrypted through it.

## Install on Windows

Download `Rascals_<version>_x64-setup.exe` from
[Releases](https://github.com/MinikLover67/Rascals/releases) and run it.
After the first install, updates arrive inside the app automatically.

## How updates work

Every copy polls `latest.json` on this repo (daily + on demand in Settings),
verifies the minisign signature against a baked-in public key, then installs
and restarts. No accounts, no tracking — just one static file.

## Develop

```bash
npm install
npm run dev        # browser preview (separate storage per browser)
npm run tauri dev  # desktop app (needs Rust + platform webview deps)
npm run build      # frontend build
npm run test       # vitest unit tests (pure protocol/display logic)
npm run lint       # oxlint, must be clean
```

Cut a release: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Version X.Y.Z -Notes "..."`
then publish `release/vX.Y.Z/*` as a GitHub release (see RELEASE.md).

## Security

See [SECURITY.md](SECURITY.md) for the threat model and the self-audit with
live proof-of-concept exploits. To report an issue, open a GitHub issue —
executable proof beats descriptions.
