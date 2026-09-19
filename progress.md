# Rascals — Progress Log

## 2026-09-18 — Project start
- Workspace `Rascals/` was empty; confirmed greenfield.
- Locked decisions: name **Rascals**, Win11 desktop only (no CLI/web/Android/Linux), keypair + invite-code identity, MVP slice first (friends + 1:1 DMs + E2EE + history), "just works" networking defaults.
- Toolchain check: Node v24.20.0 + npm 11.17.0 present. Rust/Cargo NOT installed → full Tauri build blocked until Rust + MSVC tools installed.
- Wrote `plan.md` + this `progress.md`.
- Next: scaffold Vite + React + TS + Tailwind frontend skeleton and Tauri v2 config files (Phase 0, no Rust build yet).

## How to run (once scaffolded)
- Frontend only (no Rust needed): `npm install` then `npm run dev`.
- Full desktop: `npm run tauri dev` / `npm run tauri build` (Rust 1.98.1 + VS2022 MSVC present).

## 2026-09-18 — First installer build (shareable) ✅- Fixed `trayIcon` config error (tray belongs in Rust, uses bundled app icon), fixed
  `tray-icon:default` → `core:tray:default` capability, fixed `Image::from_bytes` →
  `app.default_window_icon()`.
- `npx tauri build` succeeded. Artifacts:
  - `src-tauri\target\release\bundle\nsis\Rascals_0.1.0_x64-setup.exe` (4.2 MB) ← send this to friends
  - `src-tauri\target\release\bundle\msi\Rascals_0.1.0_x64_en-US.msi` (5.9 MB) ← alternative
- Smoke test: `rascals.exe` launches, window titled "Rascals", idles ~25 MB RAM.
- Notes: unsigned build → friends will see a SmartScreen "unknown publisher" prompt
  (More info → Run anyway). Updater artifacts disabled until a signing key is generated
  (`tauri signer generate`).
- No more installer builds until the final polished build (user request).

## 2026-09-18 — Phase 1 done: identity + P2P friends ✅
- P2P: Trystero v0.25 (Nostr discovery + WebRTC) — personal lobby room per user,
  signed friend-request knocks (`freq`), pairwise DM rooms with signed `hello`
  auth + join/leave presence. API used: `makeAction` object, `send(data,{target})`,
  assignable `onPeerJoin/onPeerLeave`.
- Crypto: Ed25519 hello signatures verified against claimed userId-as-pubkey;
  smoke-tested in node (valid verifies, tampered name rejected, DM room id
  symmetric both sides, invite code round-trips). Note: std libsodium has no
  SHA-256 → room ids use BLAKE2b `crypto_generichash(32,…,null)`.
- UI: invite code + QR + copy, add-via-code, incoming accept/decline, outgoing
  with knock-again/cancel, friends list with online dots, selection, persistence
  in localStorage. `npm run build` green.
- NOT yet live-tested peer-to-peer (needs two running peers). Manual test:
  `npm run tauri dev` (identity A) + open `http://localhost:1420` in a browser
  (identity B, separate storage) → exchange invite codes → both green.
- Next: Phase 2 (E2EE 1:1 DMs + history + typing/unread/drafts/search).

## 2026-09-18 — Phase 2 done: encrypted DMs ✅
- E2EE: X25519 ECDH from Ed25519 identity keys (curve25519 conversions),
  hashed into a secretbox key. Both sides derive it independently, no key
  exchange on the wire. Node-verified: symmetric keys, seal/open round-trip,
  tampered ciphertext rejected.
- Protocol in pairwise DM rooms: `msg` upserts (full state per id, rev-based
  last-writer-wins, so edits/deletes sync), `ack` delivery receipts (single/double
  ticks + queued hollow dot), `typing` ephemerals, `hreq`/`hoffer` history sync
  (up to 200 msgs) for offline catch-up. Outbox queue flushes on reconnect.
- UI: ChatPanel with bubbles, reply quotes, inline edit, delete-for-both
  (tombstones), day dividers, per-chat search with match count, unread badges,
  per-chat drafts, typing indicator. Markdown-lite: code/bold/italic/links/@mentions,
  HTML-escaped. History/friends/drafts/read-markers persist in localStorage.
- `npm run build` green. Note: keep new files ASCII-only — a corrupted UTF-8
  ellipsis in md.ts caused phantom TS1005 parse errors until rewritten.
- NOT yet live-tested peer-to-peer (needs two running peers). Manual test:
  `npm run tauri dev` (identity A) + open `http://localhost:1420` in a browser
  (identity B, separate storage) → exchange invite codes → chat.
- Next: Phase 3 (reactions, pins, images/files, voice messages, GIFs, YouTube).

## 2026-09-18 — Phase 3 done: rich messaging ✅
- Reactions: per-user emoji on any message, quick picker, toggle-off, synced live
  (`react` action) + included in history offers. Pins: shared pin set (`pin`
  action, union-merge), pins strip with jump-to-message.
- Files/images: E2EE 32 KB sealed chunks (`fchunk`), `fget` requests with resume
  offset, thumbnails inside the encrypted envelope, IndexedDB blob store (200 MB
  LRU), progress bars, retry, save-to-disk. Cap 25 MB. Voice messages: mic
  recorder (opus/webm) rendered as audio players. GIFs: Tenor search with
  user-provided key (bytes re-sent E2EE, never hotlinked). YouTube: ID detection
  + click-to-load nocookie embeds (zero Google traffic until play).
- Verified: `npm run build` green; node smoke test on the real modules —
  8-emoji set, markdown XSS escaping, all YouTube URL forms, 100 KB file through
  sealed chunks reassembled byte-perfect.
- Toolchain lesson: authored sources must stay pure ASCII. Literal non-ASCII and
  backslash-u escapes get mangled to U+FFFD/control chars by the file pipeline
  (caught via byte audit). Emoji come from String.fromCodePoint; icons are SVG/CSS.
- Next: Phase 4 (group DMs, then servers/channels).

## 2026-09-18 — Phase 4a done: encrypted group DMs ✅
- Protocol: shared group rooms (`rascals-group:<id>`), per-sender ratcheting
  chain keys (forward secrecy), sealed chain distribution per member,
  identity-signed envelopes verified against the member list, admin-signed
  add/remove with epochs, random per-file content keys wrapped per member.
  Removes rotate chains (backward secrecy). Offline catch-up via verbatim
  history offers + control log + gkey rebroadcast on every history request.
- Invites travel over pairwise-encrypted DM control messages, auto-accepted,
  retried whenever the friend comes online.
- Reuses all DM machinery (chat keys `g:<id>`): replies/edits/deletes,
  reactions, pins, typing, files/voice, search, drafts, unread.
- UI: groups section + new-group modal (name + friend picker), member list
  with admin add/remove, leave, sender names, per-group online state.
- Verified: build green; node smoke on real modules — signatures accept/reject
  correctly, ratchet decrypts in-order + across gaps and rejects replays,
  sealed keys open for the recipient only, `g:` keys cannot collide with userIds.
- Next: Phase 4b servers (channel collections, roles, invites), then Phase 5 voice.

## 2026-09-18 — Phase 4b done: servers ✅
- Model: server = signed descriptor (members, roles, channels, epoch) synced over
  a dedicated server room; every channel is a full group chat reusing the
  sender-key protocol, membership mirrored from the descriptor.
- Roles owner/admin/member; owner-only role changes + server delete; owner/admin
  manage members/channels/renames. Signed ops (epoch-chained), first-seen-wins
  on forks, full-descriptor healing on every sync. Invites over pairwise DMs,
  retried when friends come online; invitee role verified in the descriptor.
- Removing a server member rotates every channel's chains (backward secrecy);
  channel adds share keys with newcomers; dropped channels leave rooms/keys but
  keep local history.
- UI: server rail, channels column with unread badges, create modal, settings
  (general/members/channels tabs, invites, roles, delete/leave), channel member
  lists marked server-managed.
- Verified: build green; headless integration test on the real modules (fake
  transport): 18/18 — create/channels/invite/roles/apply, forged-op and
  bad-sig rejection, rotation on remove, full delete.
- Next: Phase 5 voice (1:1 + group calls, voice channels, screenshare, TURN),
  then Phase 6 desktop polish + final installer build.

## 2026-09-18 — Phase 5 done: voice calls, channels, screenshare ✅
- 1:1 calls: ring/accept/decline/hangup signaling over the DM room, media in a
  dedicated call room, 45 s no-answer timeout, busy auto-decline, call history
  as local system notes. Group/channel voice: persistent rooms, join/leave,
  participant list with speaking rings, mute/deafen, per-peer screenshare tiles.
- Media: echo cancellation + noise suppression, mic/speaker selection,
  optional TURN relay in settings (media stays E2EE through it), WebAudio
  ringer until sound packs land.
- Verified: build green; headless test of the real voice module — 18/18 on the
  signaling state machine (ring/busy/accept/decline/hangup/missed/stray,
  offline guards, mic-error paths, sys notes, teardown). Live mic/screenshare
  still needs a two-machine manual test (needs mic permission + Nostr + WebRTC).
- Next: Phase 6 desktop polish (themes, sound packs, notifications, tray,
  auto-launch, updater UX) + final installer build for friends.

## 2026-09-18 — Phase 6 done + FINAL BUILD shipped ✅
- Themes: dark + light via CSS token overrides, switch in Settings, applied live.
- Sound packs: synthesized default pack (message/request/ring/join/leave/send),
  Silent mode, per-event custom sound import (2 MB cap, IndexedDB) with preview
  and reset. Ringing, message blips, voice join/leave all routed through it.
- Notifications: native via Tauri plugin (fallback Web API), for DMs/groups when
  the chat is closed or the window hidden, friend requests, missed calls.
  Toggleable. Tray: Show/Quit menu, click-to-restore, minimize-to-tray.
- Auto-launch toggle (autostart plugin), Ctrl+M mute hotkey, update checker +
  version in Settings backed by a real minisign keypair (private key in
  ~/.tauri, NEVER in the repo).
- Verified: frontend + desktop builds green; byte audit clean.
- FINAL ARTIFACTS (signed updater fakery included):
  - src-tauri/target/release/bundle/nsis/Rascals_0.1.0_x64-setup.exe (4.3 MB) + .sig
  - src-tauri/target/release/bundle/msi/Rascals_0.1.0_x64_en-US.msi (6.0 MB) + .sig
  - Smoke-tested: launches as "Rascals", ~27 MB idle.
- Shipping notes: unsigned code (SmartScreen "unknown publisher" expected);
  auto-update activates once artifacts + latest.json are published to GitHub
  releases (endpoints already point at MinikLover67/Rascals).

## 2026-09-19 — Friend-adding connectivity fix ✅
- Symptom: invites sent with both PCs online on the same LAN never arrived.
- Root causes: (1) signaling used Trystero's 28-relay default pool with
  redundancy 5 — dead/slow relays could strand both peers with no overlap and
  zero visible errors; (2) TURN was voice-only, so strict NATs failed silently
  on text rooms; (3) outgoing requests knocked once (45 s lobby visit) with no
  retry; (4) `tauri build` never rebuilt the frontend (missing
  beforeBuildCommand), so installers could ship stale UI — fixed in tauri.conf.
- Fixes: curated 8-relay signaling set with full redundancy shared by every
  room (text + voice), TURN plumbed into all rooms, outgoing requests re-knock
  every 60 s while pending, Connection diagnostics in Settings (per-relay
  states, peer counts, copy-diagnostics), retry hint in the requests UI.
- Verified: tsc + vite build green, headless config tests 7/7, fresh signed
  installer rebuilt WITH the fix (beforeBuildCommand now runs) and
  smoke-tested (launches as "Rascals").
- Follow-up find: Settings was unreachable on fresh installs (only inside an
  open chat) — added sidebar Settings button + always-visible version, re-cut
  v0.1.1, re-uploaded zip, reinstalled here.
- Follow-up find #2 (from laptop2 diagnostics): the Connection panel LIED —
  getRelaySockets() returns raw WebSockets but the code read `.socket`,
  so every relay showed "closed" even when connected. Fixed the mapping, added
  identity + per-launch session nonce to diagnostics, and a live red/green
  connection dot in the sidebar footer. Re-cut v0.1.1 again, re-uploaded,
  reinstalled here. Open question: identical selfId on both captures —
  needs fresh captures after restart to interpret.
- Definitive test rig (scripts/e2e-friends.mjs): two real Chromium instances
  run the real app over the real relay network — invite, accept, presence both
  ways PASS in ~3 s. Protocol code proven correct; remaining failures are
  environmental (app closed, old build, blocked network).
- LIVE CROSS-MACHINE PROOF: DebugBot peer from this PC sent a real request to
  laptop 2 (Test2) — arrived, accepted, DM room connected both ways (~17 s).
  scripts/send-request.mjs kept for future live tests.
- FULL CIRCLE: permanent DebugBot (scripts/bot-inbox.mjs, identity in
  .bot-profile) received live messages from Test2 ("hi", "hello") with
  presence online both ways. Laptop-to-laptop E2EE chat proven in both
  directions.
- CRASH FOUND + FIXED (scripts/repro-select.mjs): pressing a friend row froze
  the whole app. Root cause: three zustand selectors returned a fresh `[]`
  every snapshot (`s.messages[k] ?? []`, `s.pins[k] ?? []`) — React's
  useSyncExternalStore looped into "Maximum update depth exceeded". Fixed with
  stable shared empties (EMPTY_MESSAGES/EMPTY_PINS); full audit, no other
  instances. Repro re-passes with zero errors. Re-cut, re-uploaded
  (https://files.catbox.moe/kbi37j.zip), reinstalled here.
- Relay hardening: probe script publishes real signed events
  (scripts/probe-relays.mjs) — 9/12 writable. Dropped nostr.wine (account
  wall), noswhere (muted), nostr.band (dead); added yabu.me, chorus.pjv.me,
  nostr.data.haus. E2E re-passes with zero relay warnings. Re-cut, re-uploaded
  (https://files.catbox.moe/gkrj8z.zip), reinstalled here.

## 2026-09-19 — Release pipeline (ship versions across devices) ✅
- `scripts/release.ps1 -Version X.Y.Z -Notes "..."`: bumps the version in all
  three places, runs the signed Tauri build, assembles `release/vX.Y.Z/`
  (setup exe + .sig, msi, latest.json manifest). Proven by cutting v0.1.1.
- Friends update over the air: installed apps poll
  `.../releases/latest/download/latest.json`, verify the minisign signature
  against the baked-in pubkey, download, install, restart. First install is
  still the setup exe; everything after is automatic. See RELEASE.md.
- To activate: publish `release/v0.1.1/*` as GitHub release v0.1.1 on
  MinikLover67/Rascals (browser upload, latest.json MUST be an asset). Signing keys
  live only in %USERPROFILE%/.tauri — back them up.
- Proven: shipped v0.1.1 installer signature cryptographically verified with
  libsodium (prehashed ed25519) against the baked-in pubkey. Auto-check on
  launch (daily) + update banner added; v0.1.1 re-cut with it.

## 2026-09-19 — Single instance (one tray, always) ✅
- Second launch no longer spawns a duplicate app/tray icon: single-instance
  plugin focuses the open window instead. Verified: two launches, one process.
- v0.1.1 release folder refreshed with this build — publish
  `release/v0.1.1/*` (4 files, latest.json included) as GitHub release v0.1.1
  and both laptops update themselves over the air.
- This device updated: v0.1.1 installed to %LOCALAPPDATA%/Rascals (FileVersion
  0.1.1 verified), Desktop shortcut repointed at the installed copy,
  launch-tested clean.

## Repo moved to MinikLover67/Rascals
- Ripped out every Clypus/P2PChat reference (tauri.conf updater endpoint,
  release script default + messages, RELEASE.md, progress.md). Updater now
  polls github.com/MinikLover67/Rascals. Rebuilt, re-uploaded
  (https://files.catbox.moe/qn7d2p.zip), reinstalled here.
- Still needed from the user: create the MinikLover67/Rascals repo on GitHub
  and publish release/v0.1.1/* as release v0.1.1 to activate auto-update.

## 2026-09-19 - v0.1.2 shipped: the update loop proven live
- Payload: replaced flaky relay.damus.io (503s in the wild) with
  probe-verified relay.artio.inf.unibe.ch. E2E re-passes in ~5 s, zero warnings.
- Fixed release.ps1 version bump (Cargo.toml regex missed; all three version
  sources now agree) and made e2e-friends.mjs self-manage vite.
- Published as GitHub release v0.1.2 (4 assets). latest.json serves 0.1.2
  anonymously — both laptops on 0.1.1 get the banner on next check.
  Direct zip too: https://files.catbox.moe/my96n1.zip
- This PC updated to 0.1.2 and smoke-tested.

## 2026-09-19 - oxlint gate clean
- Installed oxlint (was referenced but never installed) + `npm run lint`,
  per current oxc.rs docs (correctness by default, react/typescript/oxc plugins).
- Fixed for real: dead live-message/send-message scripts deleted, unused import,
  shared helpers moved to src/lib/format.ts (only-export-components), ChatPanel
  day dividers precomputed via useMemo (immutability), ChatPanel remounts per
  chat instead of a reset effect. Three justified line-level disables with
  reasons (IndexedDB load, mark-read sync, typing freshness).
- Verified: `npm run lint` zero warnings, tsc clean, repro-select E2E still
  green. Committed + pushed to MinikLover67/Rascals.

## 2026-09-19 - GitHub live: MinikLover67/Rascals published
- Repo created public (was private - updater needs anonymous downloads),
  full source pushed to main, release v0.1.1 published with all 4 assets
  (setup exe + .sig, msi, latest.json).
- Verified live + anonymous: latest.json serves v0.1.1 with signature,
  installer downloads whole (4,528,218 bytes). Auto-update is ACTIVE.
- Housekeeping: junk files deleted before commit (never pushed), token
  stripped from git remote. Token used had full scopes - rotate it to minimal
  scopes in GitHub settings when convenient.
