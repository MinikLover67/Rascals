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
  <video src="docs/brag.mp4" controls loop muted autoplay width="640" alt="Rascals 20-second demo"></video>
</p>

<p align="center">
  <em>20-second demo</em> · <a href="docs/brag.mp4">HD MP4 with sound</a>
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

## Support & feedback (beta preview)

Something not working — a friend add that never lands, messages stuck, calls
with no audio? Don't guess: run the built-in **Connection doctor** (Friends
panel, next to "Add friend") for live findings, then use one of these:

- **Self-help page** — [Support (beta)](https://miniklover67.github.io/Rascals/support/):
  pick what's wrong and get targeted fixes, then send structured feedback in
  one click. Also served from [docs/support](docs/support/index.html).
- **[File a bug](https://github.com/MinikLover67/Rascals/issues/new?template=bug_report.yml)** —
  the form asks you to pick what's broken and paste your Connection doctor
  report (no messages, no keys). Ideas go to the
  [feature form](https://github.com/MinikLover67/Rascals/issues/new?template=feature_request.yml).
- **AI-assisted debugging** — register [mcp/rascals-mcp.mjs](mcp/README.md) in any
  MCP-capable assistant, paste your copied report, and get a verdict with fix
  steps (`analyze_rascals_connection`).

Beta feedback is labeled `beta-feedback` — rough reports are welcome.

## Security

See [SECURITY.md](SECURITY.md) for the threat model and the self-audit with
live proof-of-concept exploits. To report an issue, open a GitHub issue —
executable proof beats descriptions. Optional third-party check: services like
[SetRepo](https://setrepo.com) can scan this repo for secrets/dependency CVEs
(not affiliated — untested by us; the built-in self-audit is authoritative).

## License

[MIT](LICENSE) — fork it, ship it, build on it.
