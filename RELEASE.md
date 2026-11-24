# Shipping Rascals updates to friends

Rascals has a built-in auto-updater. Each installed copy polls this manifest:

    https://github.com/MinikLover67/Rascals/releases/latest/download/latest.json

When `latest.json` advertises a newer version (verified against the public key
baked into the app), the friend is offered the update in Settings, it downloads
the signed installer, verifies the signature, installs, and restarts. No manual
re-sending of setup files after the first install.

## Cut a release (from anywhere — CI, recommended)

```bash
git tag v0.1.2 && git push origin v0.1.2
```

That's it. The `docs/release-workflow.yml` pipeline (copy it to `.github/workflows/release.yml` once — see below) builds, signs and
publishes on Windows runners: it bumps the manifests to the tag version, runs
the unit tests, builds the installers, signs them with the minisign key from
the repo Actions secrets (sealed once via `scripts/gh-secrets.mjs`), and
creates the GitHub release with the setup exe, msi and `latest.json` attached.
Installed copies pick the update up automatically.

The signing key must be the SAME one forever — the public key is baked into
every installed copy (see the warning below).

## Cut a release (local, Windows alternative)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 0.1.2 -Notes "What changed"
```

This bumps the version in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json`, runs the signed build, and assembles
`release/v0.1.2/` containing:

- `Rascals_0.1.2_x64-setup.exe` (+ `.sig`) — what friends install / update to
- `Rascals_0.1.2_x64_en-US.msi` — alternative installer
- `latest.json` — the update manifest (MUST be uploaded or nothing updates)

Needs: Rust + MSVC build tools, Node, and the signing key in
`%USERPROFILE%/.tauri/` (`rascals.key` + `rascals-signer-pw.txt`).
Back those two files up somewhere safe — losing them means shipping a new
app identity that old installs will not trust.

## Publish it (2 minutes, in the browser)

1. Open github.com/MinikLover67/Rascals -> Releases -> Draft a new release.
2. Tag: `v0.1.2` (create it), title: `Rascals v0.1.2`.
3. Drag ALL files from `release/v0.1.2/` into the release assets,
   including `latest.json`. Publish.
4. Done. Friends on older builds get the update offer within a day
   (or immediately via Settings -> Check for updates).

First-time friends still install from the setup exe once; every release after
that arrives over the air.

## Changing the update location

Point the updater elsewhere by editing `plugins.updater.endpoints` in
`src-tauri/tauri.conf.json` (any static HTTPS host works — R2, Netlify, VPS).
Keep serving a file named `latest.json` in the exact Tauri manifest shape.
