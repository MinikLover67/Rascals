# Rascals — What Still Needs Doing

Living checklist of unfinished work. Checked items are done and proven.

## 1. Linux support (Arch first)

- [x] CI workflow builds signed AppImage + deb on version tags (`.github/workflows/release.yml`)
- [x] Square-icon fix for the AppImage bundler + `contents: write` for release uploads
- [x] `scripts/install-linux.sh` one-liner (pacman deps, AppImage to `~/Applications`, start-menu entry)
- [x] Desktop bundle targets fixed (`appimage`/`deb` in `tauri.conf.json` + deb deps) — was Windows-only
- [x] Interactive installer: prompts for start-menu entry, optional `~/Desktop` shortcut, launch-now (`--yes`/`--no-*` for pipes)
- [x] CI uploads updater artifacts (`*.AppImage.tar.gz*` + `latest-linux.json` fragment) and merges into `latest.json` via `release.ps1 -LinuxSignature`
- [ ] CI run green on latest main (dispatch in flight — verify at GitHub Actions)
- [ ] AppImage + deb attached to the GitHub release
- [ ] Fresh-machine test: `curl -fsSL https://raw.githubusercontent.com/MinikLover67/Rascals/main/scripts/install-linux.sh | bash` on Arch KDE, launch, add friend, send message
- [ ] Auto-update path on Linux (test updater picks up next release)
- [ ] Later: deb install path, other distros (Ubuntu/Fedora package names differ)

## 2. File sharing

Core is DONE (E2EE 32 KB chunks, 25 MB cap, resume, thumbnails, IndexedDB cache, save-to-disk, proven peer-to-peer by `scripts/e2e-files.mjs`). Remaining polish:

- [ ] Drag-and-drop files straight into the chat input
- [ ] Paste images from clipboard to send
- [ ] Better progress UI for large files (speed, ETA, cancel)
- [ ] Raise or remove the 25 MB cap (chunking already supports it — mostly UI + testing)
- [ ] File previews for common types (PDF, text, video thumbnail)
- [ ] Group/server file flow re-tested (per-file keys exist — needs a live multi-peer check)

## 3. Screenshare in call (Discord-style)

Core exists (`getDisplayMedia` in `src/lib/voice.ts`, tiles in `VoiceParticipants.tsx`, per-peer shares in group voice). Still missing vs Discord:

- [ ] Share WITH system audio (currently `audio: false` — viewers get silent video)
- [ ] Screen picker quality (resolution / frame-rate choice before sharing)
- [ ] Fullscreen / pop-out view of someone's share
- [ ] Share button inside 1:1 calls, not just voice channels (verify both paths live)
- [ ] Stop-sharing is clean for all viewers (no frozen tile)
- [ ] Live two-laptop test: share screen mid-call, confirm the other side sees it smoothly

## 5. Web app (Windows + Linux) — NEW, decided scope

Same React frontend as a static build (`npm run build:web` → `dist-web/`,
served by zero-dep `scripts/serve-web.mjs`). Full parity: identity, P2P,
files, voice, screenshare all run on browser APIs.

- [x] `src/lib/platform.ts` shim (`isTauri`/`isWeb`/`appVersion`, baked `__APP_VERSION__`)
- [x] TitleBar hides window controls on web + shows Web badge
- [x] Updater/autostart degrade with friendly web messages (no silent failures)
- [x] `npm run web` / `web:host` / `serve:web` scripts, `dist-web` git-ignored
- [x] CI `build-web` job attaches `rascals-web-*-static.zip` to tag releases
- [x] `install-linux.sh --web` mode (zip → `~/Applications/rascals-web` + launcher + menu/shortcut)
- [ ] Live two-browser test (Windows + Linux): add friend, message, file, call
- [ ] Later: hosted URL vs local-only decision, PWA manifest/icons

## 6. Everything else pending

- [ ] Rotate the GitHub token to minimal scopes (it currently has full scopes)
- [ ] Delete temp/proof PNGs + scratch scripts from repo root before next release push
- [ ] Commit + push: beta disclaimers in `install-linux.sh` / `README.md`, `upload-assets.ps1` helper
- [ ] Publish v0.1.8 Windows assets to the GitHub release, verify `latest.json` serves it
- [ ] SQLite storage migration (plan.md says SQLite; app still on localStorage/IndexedDB — data loss risk on reinstall)
- [ ] Offline relay via mutual friend (protocol notes it as "later")
- [ ] Mobile clients — still out of scope (web covers browsers for now)
