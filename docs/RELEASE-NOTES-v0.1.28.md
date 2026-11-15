# Release notes — v0.1.28

## Fixed

- **Mutual simultaneous friend-add no longer hangs.** If both people pasted
  each other's invite codes at the same time, a verified incoming knock could
  overwrite your own pending request before the hello handshake ran, leaving
  one side stuck with a phantom pending request forever. A verified knock from
  someone you already added now completes the friendship immediately
  (regression-tested: `src/store/app.test.ts`).

## New

- **Connection doctor** (Friends panel, next to "Add friend"): live findings —
  relay reachability, NAT/firewall suspicion, the hide-IP-without-TURN trap,
  pending-request age — each with ordered fix steps, plus two buttons:
  **Repair connections** (rejoin lobby + DM rooms, rebroadcast presence) and
  **Copy report** (shareable diagnostics JSON, no messages/keys).
- **Support & feedback (beta)**: new self-help page
  (`docs/support`, served on GitHub Pages) and structured GitHub issue forms
  that accept a pasted Connection doctor report. Nothing in the app changed
  for this — feedback flows through GitHub only.
- **AI debug server (MCP)**: `mcp/rascals-mcp.mjs` lets MCP-capable assistants
  analyze a copied report (`analyze_rascals_connection`) — see `mcp/README.md`.

## For release

Verified before this release: 40/40 vitest (5 new), oxlint clean, tsc clean,
vite build OK; headless E2E over live Nostr relays — same-network
handshake+chat PASS, relay-blocked peer detection PASS, mutual simultaneous
add PASS on both sides.

Suggested command (Windows):

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 0.1.28 -Notes "Fixed: mutual simultaneous friend-add hang. New: Connection doctor with repair button, support page + issue forms (beta), MCP AI debug server. See docs/RELEASE-NOTES-v0.1.28.md."
```
