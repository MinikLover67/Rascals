# Rascals release pipeline.
# Bumps the version everywhere, runs a signed Tauri build, and assembles a
# publishable folder with the installers + updater manifest (latest.json).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 0.1.1 -Notes "Connectivity fixes"
#
# Needs: Rust + MSVC build tools, Node, and the signing key in $HOME/.tauri/
# (rascals.key + rascals-signer-pw.txt). Friends' apps poll latest.json at the
# -BaseUrl and auto-update when the version there is newer.

param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = "",
  [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  Write-Error "Version must look like 0.1.1 (got '$Version')"
  exit 1
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = "https://github.com/MinikLover67/Rascals/releases/download/v$Version"
}

$keyPath = Join-Path $HOME '.tauri/rascals.key'
$pwPath = Join-Path $HOME '.tauri/rascals-signer-pw.txt'
if (-not (Test-Path $keyPath)) {
  Write-Error "Missing signing key at $keyPath. Generate one with: npx tauri signer generate --ci -p <password> -w $keyPath"
  exit 1
}
if (-not (Test-Path $pwPath)) {
  Write-Error "Missing signing password at $pwPath."
  exit 1
}

Write-Output "== Rascals release v$Version =="

# 1. Sync the version into package.json, Cargo.toml, tauri.conf.json.
Write-Output '-- bumping versions'
$pkg = Join-Path $root 'package.json'
$pkgText = Get-Content $pkg -Raw
if ($pkgText -notmatch '"version":\s*"\d+\.\d+\.\d+"') {
  Write-Error 'Could not find version field in package.json'
  exit 1
}
$pkgText -replace '"version":\s*"\d+\.\d+\.\d+"', "`"version`": `"$Version`"" |
  Set-Content $pkg -NoNewline

$cargo = Join-Path $root 'src-tauri/Cargo.toml'
$cargoLines = Get-Content $cargo
for ($i = 0; $i -lt $cargoLines.Count; $i++) {
  if ($cargoLines[$i] -match '^\s*version\s*=\s*"\d+\.\d+\.\d+"\s*$') {
    $cargoLines[$i] = 'version = "' + $Version + '"'
    break
  }
}
$cargoLines | Set-Content $cargo

$conf = Join-Path $root 'src-tauri/tauri.conf.json'
(Get-Content $conf -Raw) -replace '"version":\s*"\d+\.\d+\.\d+"', "`"version`": `"$Version`"" |
  Set-Content $conf -NoNewline

# 2. Make sure no running copy locks the exe, then build signed.
Write-Output '-- stopping any running Rascals copy'
try { & taskkill /F /IM rascals.exe 2>&1 | Out-Null } catch {}

Write-Output '-- building (signed)'
$env:PATH = "$env:USERPROFILE\.cargo\bin;" + $env:PATH
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $keyPath -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content $pwPath -Raw
npx tauri build
if ($LASTEXITCODE -ne 0) {
  Write-Error 'tauri build failed'
  exit 1
}

# 3. Assemble the publishable folder.
$out = Join-Path $root "release/v$Version"
New-Item -ItemType Directory -Force $out | Out-Null

$nsisDir = Join-Path $root 'src-tauri/target/release/bundle/nsis'
$msiDir = Join-Path $root 'src-tauri/target/release/bundle/msi'
$setup = Get-ChildItem $nsisDir -Filter "Rascals_${Version}_x64-setup.exe" | Select-Object -First 1
$setupSig = Get-ChildItem $nsisDir -Filter "Rascals_${Version}_x64-setup.exe.sig" | Select-Object -First 1
$msi = Get-ChildItem $msiDir -Filter "Rascals_${Version}_x64_*.msi" | Select-Object -First 1
if (-not $setup -or -not $setupSig) {
  Write-Error 'Signed NSIS installer not found — did the signed build succeed?'
  exit 1
}
Copy-Item $setup.FullName (Join-Path $out $setup.Name) -Force
Copy-Item $setupSig.FullName (Join-Path $out ($setup.Name + '.sig')) -Force
if ($msi) { Copy-Item $msi.FullName (Join-Path $out $msi.Name) -Force }

$manifest = [ordered]@{
  version = $Version
  notes = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  platforms = [ordered]@{
    'windows-x86_64' = [ordered]@{
      signature = (Get-Content ($setupSig.FullName) -Raw).Trim()
      url = "$BaseUrl/$($setup.Name)"
    }
  }
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $out 'latest.json')

Write-Output ''
Write-Output "Release folder ready: $out"
Get-ChildItem $out | ForEach-Object { Write-Output ("  " + $_.Name + '  ' + $_.Length + ' bytes') }
Write-Output ''
Write-Output "To ship it: create GitHub release v$Version on MinikLover67/Rascals"
Write-Output 'and upload every file in that folder (latest.json MUST be an asset).'
Write-Output 'Friends on older builds will then be offered the update in-app.'
