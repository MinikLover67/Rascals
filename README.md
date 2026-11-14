<p align="center">
  <img src="docs/branding/logo-mark.svg" alt="Rascals logo" width="128" />
</p>

<h1 align="center">Rascals</h1>

<p align="center">
  <strong>Private, serverless, peer-to-peer chat for desktop.</strong><br/>
  No accounts, no message server, no database — friends connect directly over encrypted WebRTC.
</p>

<p align="center">
  <em>Beta</em> — still testing, bugs to fix. Bug reports welcome, see
  <a href="SECURITY.md">SECURITY.md</a>.
</p>

<p align="center">
  <a href="https://github.com/MinikLover67/Rascals/releases"><img src="https://img.shields.io/github/v/release/MinikLover67/Rascals?include_prereleases" alt="Latest release"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"/></a>
  <a href="https://github.com/MinikLover67/Rascals/releases"><img src="https://img.shields.io/github/downloads/MinikLover67/Rascals/total" alt="Downloads"/></a>
  <img src="https://img.shields.io/badge/platform-Windows-blue" alt="platform: Windows"/>
</p>

<p align="center">
  <video src="docs/brag.mp4" width="640" poster="docs/branding/brag-poster.jpg" controls>
    <a href="docs/brag.mp4">Watch the 20-second demo (MP4)</a>
  </video>
</p>

---

## Why Rascals instead of Signal / Discord / Tox?

- **No accounts, no phone number.** You connect with invite codes, not signups.
- **No server in the message path.** Messages go peer-to-peer over WebRTC —
  there is no central database of your conversations to leak, sell or subpoena.
- **Decentralized signaling.** Invite codes work across the internet: different
  Wi-Fi, different cities — if you're both online, you connect.
- **Strict NAT?** Add a TURN server in Settings and media still stays
  end-to-end encrypted through it.
- **Signed updates, no tracking.** Every copy polls `latest.json` on this repo
  (daily + on demand in Settings), verifies the minisign signature against a
  baked-in public key, then installs and restarts. No accounts, no tracking —
  just one static file.

## Install on Windows

Download `Rascals_<version>_x64-setup.exe` from
[Releases](https://github.com/MinikLover67/Rascals/releases) and run it.
After the first install, updates arrive inside the app automatically.

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
then publish `release/vX.Y.Z/*` as a GitHub release (see [RELEASE.md](RELEASE.md)).

New contributors: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for the threat model and the self-audit with
live proof-of-concept exploits. To report an issue, open a GitHub issue —
executable proof beats descriptions.

## License

[MIT](LICENSE) — fork it, ship it, build on it.
