#!/usr/bin/env bash
# Rascals one-liner installer for Arch Linux (works on KDE Plasma, GNOME, etc).
#
#   curl -fsSL https://raw.githubusercontent.com/MinikLover67/Rascals/main/scripts/install-linux.sh | bash
#
# What it does:
#   1. Installs system pieces (WebKit webview, FUSE for AppImage) via pacman.
#   2. Downloads the latest signed Rascals AppImage from GitHub releases.
#   3. Installs it to ~/Applications, adds a start-menu entry + icon.
# After that, Rascals updates itself in-app like on Windows. Re-run any time
# to repair or jump to the newest release.
set -euo pipefail

REPO="MinikLover67/Rascals"
APP_DIR="$HOME/Applications"
BIN="$APP_DIR/Rascals.AppImage"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"

echo "==> Rascals installer (Arch Linux)"
echo "    NOTE: Linux support is new and tested by build, not yet on real"
echo "    Arch/KDE hardware. If anything misbehaves, report it on GitHub."

# 1. System dependencies (needs sudo once).
if ! pacman -Q webkit2gtk-4.1 fuse2 >/dev/null 2>&1; then
  echo "==> Installing system pieces with pacman (sudo password needed once)..."
  sudo pacman -S --needed --noconfirm webkit2gtk-4.1 fuse2
else
  echo "==> System pieces already present."
fi

# 2. Find the newest AppImage on GitHub (public repo, no login needed).
echo "==> Finding the newest release..."
API="https://api.github.com/repos/$REPO/releases/latest"
APPIMAGE_URL="$(curl -fsSL "$API" | grep -o '"browser_download_url": *"[^"]*\.AppImage"' | head -n 1 | cut -d'"' -f4)"
if [ -z "$APPIMAGE_URL" ]; then
  echo "ERROR: no AppImage found in the newest release. Is one published?"
  exit 1
fi
echo "==> Downloading $(basename "$APPIMAGE_URL")..."
mkdir -p "$APP_DIR"
curl -fSL --progress-bar "$APPIMAGE_URL" -o "$BIN"
chmod +x "$BIN"

# 3. Icon for the menu.
mkdir -p "$ICON_DIR"
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/src-tauri/icons/128x128.png" -o "$ICON_DIR/rascals.png" || true

# 4. Start-menu entry (shows up in Kickoff / app launcher).
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/rascals.desktop" <<EOF
[Desktop Entry]
Name=Rascals
Comment=Private peer-to-peer chat
Exec=$BIN %U
Icon=rascals
Terminal=false
Type=Application
Categories=Network;InstantMessaging;
StartupWMClass=Rascals
EOF
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo ""
echo "Done! Find Rascals in your app menu (or run: $BIN)"
echo "Updates arrive inside the app from now on."
