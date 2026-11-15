# Rascals — What Still Needs Doing

Living checklist of unfinished work. Checked items are done and proven.

Linux support was dropped: Windows-only. (The Arch installer, CI AppImage/deb
builds, and updater fragments were removed — history kept, no revival planned.)

## 1. File sharing

Core is DONE (E2EE 32 KB chunks, 25 MB cap, resume, thumbnails, IndexedDB cache, save-to-disk, proven peer-to-peer by `scripts/e2e-files.mjs`). Remaining polish:

- [x] Drag-and-drop files anywhere on screen (whole-window drop zone, routed to the open chat)
  - Fixed: Tauri's native layer eats OS file drops before the webview — `dragDropEnabled: false` so HTML5 drops reach the app (desktop-only bug, browsers unaffected)
- [ ] Paste images from clipboard to send
- [ ] Better progress UI for large files (speed, ETA, cancel)
- [ ] Raise or remove the 25 MB cap (chunking already supports it — mostly UI + testing)
- [ ] File previews for common types (PDF, text, video thumbnail)
- [ ] Group/server file flow re-tested (per-file keys exist — needs a live multi-peer check)

## 2. Screenshare in call (Discord-style)

Core exists (`getDisplayMedia` in `src/lib/voice.ts`, tiles in `VoiceParticipants.tsx`, per-peer shares in group voice). Still missing vs Discord:

- [ ] Share WITH system audio (currently `audio: false` — viewers get silent video)
- [ ] Screen picker quality (resolution / frame-rate choice before sharing)
- [ ] Fullscreen / pop-out view of someone's share
- [ ] Share button inside 1:1 calls, not just voice channels (verify both paths live)
- [ ] Stop-sharing is clean for all viewers (no frozen tile)
- [ ] Live two-laptop test: share screen mid-call, confirm the other side sees it smoothly

## 3. Everything else pending

- [ ] Rotate the GitHub token to minimal scopes (it currently has full scopes)
- [ ] Delete temp/proof PNGs + scratch scripts from repo root before next release push
- [x] Commit + push: beta disclaimers in `install-linux.sh` / `README.md`, `upload-assets.ps1` helper
- [ ] Publish v0.1.8 Windows assets to the GitHub release, verify `latest.json` serves it
- [ ] SQLite storage migration (plan.md says SQLite; app still on localStorage/IndexedDB — data loss risk on reinstall)
- [ ] Offline relay via mutual friend (protocol notes it as "later")
- [ ] Mobile / web clients — explicitly out of scope (web app removed: laggy, redundant with desktop)
