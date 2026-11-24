# Rascals security review (self-audit v1) — 2026-09-20

This is a white-box self-assessment of Rascals v0.1.5, done by its own author
with the explicit goal of breaking it. Method: code audit of every trust
boundary, plus live proof-of-concept exploits run against two real app
instances (Chromium + real relay network), not staged unit tests. Everything
marked FIXED below ships in v0.1.6, verified with the same PoCs re-run.

## Threat model

- **Attacker: a malicious "friend".** Anyone you add (or who tricks you into
  adding them) can send you messages, files, reactions, calls. This is the
  primary threat: all rendering, crypto, and protocol code must treat peer
  input as hostile.
- **Attacker: network observer / hostile relay.** Sees WebRTC handshakes and
  Nostr signaling traffic. Must learn nothing about message content or
  identities beyond ephemeral peer IDs.
- **Attacker: malicious update publisher.** Must be stopped by signature
  verification even with full control of the release hosting.
- **Not in scope:** a compromised operating system (malware with user
  privileges can read local app data — no chat app survives that), physical
  device theft (same reason), relay operators learning connection metadata
  (inherent to peer discovery; see S4).

## Findings

### S1 — Stored XSS via quote breakout in markdown links [CRITICAL — FIXED]

Markdown links interpolated URLs into double-quoted `href="..."` while the
escaper only handled `&<>`. A "friend" sending

    https://e.com/"onmouseover="alert(1);

produced `<a href="https://e.com/" onmouseover="alert(1);" ...>`. Proven live:
`alert(1)` executed in the victim's context on hover. Impact: full JS
execution — read the identity secret from localStorage, call Tauri IPC,
exfiltrate IndexedDB blobs.

Fix (v0.1.6): escape `"` and `'` during the first pass, before link parsing.
Re-ran the PoC: zero injectable elements, zero dialogs. Second layer: a
Content-Security-Policy is now baked into the desktop shell
(`script-src 'self'`, no inline handlers possible) so a future renderer bug
fails closed instead of executing.

### S2 — Unused native plugins widened the blast radius [HIGH — FIXED]

The desktop shell initialized and permission-granted three plugins the
frontend never calls: full SQLite access (`sql`), file dialogs
(`dialog`), and the settings store (`store`). Combined with S1, an XSS
became native file/DB access. Removed all three (Rust init, Cargo deps,
capabilities, npm deps). Remaining native surface: window/tray, autostart,
notifications, updater, process (restart only).

### S3 — No Content-Security-Policy [MEDIUM — FIXED]

See S1. The desktop shell now ships a CSP: scripts only from the bundle,
no inline handlers, no plugins/objects, frames limited to the YouTube
embedder, network limited to self/HTTPS/WSS. The renderer fix above is the
primary defense (proven live); the CSP is the second layer, validated at
build time. If any legitimate embed ever breaks in production, widen that
single directive rather than touching the renderer.

### S4 — Peers learn your IP address [MEDIUM by design — MITIGATED]

Honest statement: this is how all peer-to-peer calls work (Skype, Zoom P2P,
torrents included). To connect directly, browsers exchange network
candidates, including your public IP. Anyone you voice/video/text-chat with
can see it; strangers cannot (rooms are invite-gated, lobby traffic ignores
unknown peers after signature checks).

What changed: (1) Settings now says this in plain language next to the TURN
controls; (2) new "Hide my IP" mode forces ALL traffic through your TURN
server (`iceTransportPolicy: relay`), so peers only ever see the relay.
It refuses to engage without TURN configured (relay-only with no relay
means no calls at all). Verified headlessly against the real config code.

### S5 — Identity secret lives in plaintext localStorage [MEDIUM — ACCEPTED]

The Ed25519 secret key sits unencrypted on disk. A local attacker (malware)
could steal it and impersonate you. Mitigation roadmap: move secrets to the
OS keychain. Accepted for now because the threat (local compromise) already
defeats every software defense a chat app has; documented here instead of
hidden.

### S6 — Lobby presence is observable [LOW — ACCEPTED]

Anyone holding your invite code can join your lobby room and observe that
you are online (they learn nothing else: misaddressed and badly-signed
messages are dropped before any UI or state change). This is inherent to an
invite-based discovery design with no central directory. Accepted.

### S7 — Update channel [CHECKED, one open item]

Verified: minisign signatures enforced by the updater against a baked-in
pubkey; the shipped v0.1.1 installer signature was independently re-verified
with libsodium (prehashed ed25519) outside the build; private key lives only
on the release machine, never in this repo; endpoints are HTTPS-only.
Open follow-up: downgrade behavior (installing an older signed release) was
not exercised in this pass.

### S8 — Dependencies [CLEAN]

`npm audit` (production): 0 vulnerabilities. Lockfile committed. Playwright
and test-only scripts never ship (devDependencies, excluded from bundles).

### S9 — Message cryptography [REVIEWED, no issues found]

Per-message random nonces (no reuse), XSalsa20-Poly1305 authenticated
encryption (tampering fails closed — proven in smoke tests), X25519 ECDH
from Ed25519 identities with standard conversions, replayed envelopes are
harmless (id+revision dedupe), group sender chains ratchet per message
(forward secrecy) and rotate on member removal (backward secrecy).

### S10 — File handling limits [OK]

25 MB cap, 4096-chunk cap, 200-message history cap, reaction/pin caps,
thumbnails downscaled in-browser. Object URLs are revoked on removal.

## Lab rig (reproducible)

- `scripts/e2e-friends.mjs` — two real browsers, invite/accept/presence.
- `scripts/e2e-files.mjs` — real E2EE image transfer + removal flow.
- `scripts/xss-poc.mjs` — the S1 exploit; must stay silent (run after any
  renderer change).
- `scripts/probe-relays.mjs` — relay writability checks.
- `scripts/repro-select.mjs` — chat-open regression (the crash that froze v0.1.1).

## Responsible disclosure

Found something? Open a GitHub issue (or PR with a PoC script like the ones
above — executable proof beats descriptions). Please do not publish
unfixed critical exploits before a fix ships; we will credit you in this file.
