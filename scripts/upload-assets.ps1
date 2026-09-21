# Uploads release assets to a GitHub release. Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/upload-assets.ps1 -ReleaseId 123 -Folder release/v0.1.8
param(
  [Parameter(Mandatory = $true)][string]$ReleaseId,
  [Parameter(Mandatory = $true)][string]$Folder,
  [Parameter(Mandatory = $true)][string]$Token
)
$ErrorActionPreference = 'Stop'
$H = @{ 'Authorization' = "Bearer $Token" }
$base = "https://uploads.github.com/repos/MinikLover67/Rascals/releases/$ReleaseId/assets?name="
$files = @('latest.json') + (Get-ChildItem (Join-Path $Folder '*') -Include '*.exe', '*.sig', '*.msi', '*.AppImage', '*.AppImage.tar.gz', '*.AppImage.tar.gz.sig', '*.deb', 'rascals-web-*.zip', 'latest-linux.json' | ForEach-Object { $_.Name })
$existing = @{}
try {
  $list = Invoke-RestMethod -Uri "https://api.github.com/repos/MinikLover67/Rascals/releases/$ReleaseId/assets?per_page=50" -Headers $H
  foreach ($a in $list) { $existing[$a.name] = $true }
} catch {
  Write-Output 'WARNING: could not list existing assets, uploading everything.'
}
foreach ($name in $files) {
  if ($existing.ContainsKey($name)) {
    Write-Output ("SKIP (already on release): " + $name)
    continue
  }
  $path = Join-Path $Folder $name
  if (-not (Test-Path $path)) {
    Write-Output ("SKIP (missing): " + $name)
    continue
  }
  $r = Invoke-RestMethod -Uri ($base + $name) -Method Post -Headers $H -ContentType 'application/octet-stream' -InFile $path
  Write-Output ($name + ' -> id ' + $r.id + ' ' + $r.size + ' bytes')
}
