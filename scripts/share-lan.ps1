# Serves release/v0.1.1 over the LAN so the second laptop can download it.
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'release/v0.1.1'
Start-Process -FilePath 'python' -ArgumentList @('-m', 'http.server', '8000', '--directory', $dir) -WindowStyle Minimized
'serving ' + $dir + ' on port 8000'
