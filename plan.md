# Rascals — P2P Private Chat (Windows 11 Desktop)

Product name: **Rascals** · Binary `Rascals.exe` · Bundle id `com.rascals.chat`
Scope: Windows 11 desktop only. No CLI, no web app, no Android, no Linux.
Model: peer-to-peer, no central message server or database. Invisible plumbing only
(decentralized discovery + STUN, optional TURN later). Everything "just works" by default.

## Stack (locked)

- Shell: Tauri v2 (Windows-only), WebView2, custom undecorated window + tray + native notifications + updater (GitHub Releases `latest.json`, signed).
- Frontend: Vite + React 19 + TypeScript + Tailwind + Zustand + TanStack Router (added as needed).
- P2P MVP: Trystero (`@trystero-p2p/nostr` default, BitTorrent/MQTT fallback) over WebRTC DataChannel. Upgrade path to js-libp2p + gossipsub later.
- Crypto: libsodium — Ed25519 identity, X25519 + crypto_box sessions, secretbox messages. Invite code `rascal1:<pubkey>:<room>:<checksum>` (text + QR).
- Storage: SQLite (Tauri SQL plugin) for peers/chats/messages/attachments/outbox; `tauri-plugin-store` for prefs/drafts/theme/soundpack.
- Media later: Trystero streams + getDisplayMedia screenshare; TURN (Cloudflare/coturn) added in voice phase.

## Protocol sketch

- Identity: userId = base58(ed25519 pubkey), displayName, avatar blob.
- Friend add: share invite code → rendezvous room `rascals-friend:<hash>` → mutual signed hello → save peer.
- DM room: `rascals-dm:<sorted(pubA,pubB) hash>`. Envelope `{id, chatId, sender, ts, nonce, ciphertext, type}`; types: text|edit|delete|ack|typing|history-request|history-offer.
- History: SQLite is truth. Reconnect sends `history-request {since}` → peer replies paginated `history-offer`, dedupe by id.
- Offline: outbox table + exponential retry. Later: relay via mutual friend.

## Phases

- [x] Phase 0 — Scaffold: Vite+React+TS+Tailwind skeleton, Tauri v2 config (window/tray/updater), plan.md + progress.md. Rust toolchain still required for full desktop build.
- [x] Phase 1 — Identity + Friends: keypair gen/store, onboarding (name/avatar/my code+QR), add friend via code, presence, friend list.
- [x] Phase 2 — 1:1 DMs MVP complete: E2EE text, replies/edits/deletes, typing, unread, drafts, FTS search, reconnect + offline queue + backfill.
- [x] Phase 3 — Rich messaging: reactions, pins, mentions, images/files (chunked + sha256), voice messages, GIF pack, YouTube unfurl click-to-load.
- [x] Phase 4 — Groups + Servers: group DMs (sender-key rotation), Servers (channel collections + roles + invites).
- [x] Phase 5 — Voice: 1:1 calls → voice channels → screenshare, PTT/VAD/devices, TURN.
- [x] Phase 6 — Polish: themes, sound packs, notifications, auto-launch, hotkeys, updater UX, settings UI.

## Desktop requirements map

Custom window controls, tray, notifications, themes, sound packs, screenshare, auto-update — Phases 0/5/6.
Replies/reactions/edits/deletes/pins/mentions/markdown/images/GIFs/YouTube/files/voice-msgs/search/unread/typing/drafts — Phases 2–3.
E2EE/history/reconnect/offline sync — Phases 1–2.

## Prerequisite (Windows)

Full `Rascals.exe` build needs Rust + MSVC Build Tools (not yet installed here):
`winget install Rustlang.Rustup` then `rustup default stable-x86_64-pc-msvc`, plus
"Desktop development with C++" via Visual Studio Installer. Frontend `npm run dev` works without Rust.
