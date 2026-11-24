# Starts the Vite dev server detached for E2E runs.
$root = Split-Path -Parent $PSScriptRoot
Start-Process -FilePath 'npm' -ArgumentList @('run', 'dev') -WorkingDirectory $root -WindowStyle Minimized
'dev server starting in background'
