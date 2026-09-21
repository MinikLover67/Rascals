#!/usr/bin/env bash
# Rascals installer for Arch Linux (KDE Plasma, GNOME, etc).
#
#   curl -fsSL https://raw.githubusercontent.com/MinikLover67/Rascals/main/scripts/install-linux.sh | bash
#   bash scripts/install-linux.sh --web        # web app instead of desktop
#
# What it does (desktop mode):
#   1. Installs system pieces (WebKit webview, FUSE for AppImage) via pacman.
#   2. Downloads the latest signed Rascals AppImage from GitHub releases.
#   3. Installs it to ~/Applications, adds a start-menu entry + icon.
#   4. Optionally puts a shortcut on ~/Desktop and launches the app.
# After that, Rascals updates itself in-app like on Windows. Re-run any time
# to repair or jump to the newest release.
#
# Web mode (--web): downloads the static rascals-web-*.zip build instead and
# installs a launcher that serves it locally (python3) + opens the browser.
# Same P2P app, no desktop runtime needed.
set -euo pipefail

REPO="MinikLover67/Rascals"
APP_DIR="$HOME/Applications"
BIN="$APP_DIR/Rascals.AppImage"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"
WEB_DIR="$APP_DIR/rascals-web"
WEB_PORT="4173"

MODE="desktop"      # desktop | web
ASSUME_YES=0        # --yes: take defaults, no prompts
DO_MENU=""          # yes | no (empty = prompt when interactive)
DO_SHORTCUT=""      # yes | no (empty = prompt when interactive)
DO_LAUNCH=""        # yes | no (empty = prompt when interactive)

usage() {
  cat <<EOF
Usage: install-linux.sh [options]

Options:
  --web           Install the web app (local static server + browser) instead
  --dir DIR       Install location (default: $APP_DIR)
  --port PORT     Web mode server port (default: $WEB_PORT)
  --yes           Non-interactive: accept defaults (menu yes, shortcut no, launch yes)
  --no-menu       Skip the start-menu entry
  --no-shortcut   Skip the ~/Desktop shortcut
  --no-launch     Do not launch after installing
  -h, --help      Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --web) MODE="web"; shift ;;
    --dir) APP_DIR="$2"; BIN="$APP_DIR/Rascals.AppImage"; WEB_DIR="$APP_DIR/rascals-web"; shift 2 ;;
    --port) WEB_PORT="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --no-menu) DO_MENU="no"; shift ;;
    --no-shortcut) DO_SHORTCUT="no"; shift ;;
    --no-launch) DO_LAUNCH="no"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)"; exit 1 ;;
  esac
done

interactive() { [ "$ASSUME_YES" -eq 0 ] && [ -t 0 ]; }

ask() { # ask <prompt> <default: Y|N> -> prints yes/no
  local prompt="$1" def="$2" ans=""
  if [ "$def" = "Y" ]; then prompt="$prompt [Y/n] "
  else prompt="$prompt [y/N] "; fi
  read -r -p "$prompt" ans || true
  case "$ans" in
    [Yy]*) echo "yes" ;; [Nn]*) echo "no" ;;
    "") [ "$def" = "Y" ] && echo "yes" || echo "no" ;;
    *) echo "no" ;;
  esac
}

echo "==> Rascals installer (Arch Linux)"
echo "    NOTE: Linux support is new and tested by build, not yet on real"
echo "    Arch/KDE hardware. If anything misbehaves, report it on GitHub."

# Interactive choices (skipped with --yes / --no-* / non-tty pipe defaults).
if interactive && [ "$MODE" = "desktop" ]; then
  echo ""
  echo "Install mode: [1] Desktop AppImage (recommended)  [2] Web app (browser)"
  choice="$(ask "Desktop app?" Y)"
  if [ "$choice" = "no" ]; then MODE="web"; fi
fi
if [ -z "$DO_MENU" ]; then
  if interactive; then DO_MENU="$(ask "Add a start-menu entry?" Y)"; else DO_MENU="yes"; fi
fi
if [ -z "$DO_SHORTCUT" ]; then
  if interactive; then DO_SHORTCUT="$(ask "Also create a desktop shortcut in ~/Desktop?" N)"; else DO_SHORTCUT="no"; fi
fi
if [ -z "$DO_LAUNCH" ]; then
  if interactive; then DO_LAUNCH="$(ask "Launch Rascals now?" Y)"; else DO_LAUNCH="yes"; fi
fi

# Latest-release asset lookup (public repo, no login needed).
release_asset_url() { # <pattern> -> url or empty
  local pattern="$1"
  curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o "\"browser_download_url\": *\"[^\"]*\"" \
    | cut -d'"' -f4 \
    | grep -E "$pattern" \
    | head -n 1 || true
}

write_desktop_file() { # <path> <exec> <icon> <name>
  cat > "$1" <<EOF
[Desktop Entry]
Name=$4
Comment=Private peer-to-peer chat
Exec=$2 %U
Icon=$3
Terminal=false
Type=Application
Categories=Network;InstantMessaging;
StartupWMClass=Rascals
EOF
  chmod +x "$1"
}

refresh_menus() {
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
  if command -v kbuildsycoca6 >/dev/null 2>&1; then kbuildsycoca6 2>/dev/null || true; fi
}

install_icon() {
  mkdir -p "$ICON_DIR"
  curl -fsSL "https://raw.githubusercontent.com/$REPO/main/src-tauri/icons/128x128.png" \
    -o "$ICON_DIR/rascals.png" || true
}

install_desktop() {
  # 1. System dependencies (needs sudo once).
  if command -v pacman >/dev/null 2>&1; then
    if ! pacman -Q webkit2gtk-4.1 fuse2 >/dev/null 2>&1; then
      echo "==> Installing system pieces with pacman (sudo password needed once)..."
      sudo pacman -S --needed --noconfirm webkit2gtk-4.1 fuse2
    else
      echo "==> System pieces already present."
    fi
  else
    echo "WARNING: pacman not found — this script targets Arch. Continuing without deps."
  fi

  # 2. Find the newest AppImage on GitHub.
  echo "==> Finding the newest release..."
  APPIMAGE_URL="$(release_asset_url '\.AppImage$')"
  if [ -z "$APPIMAGE_URL" ]; then
    echo "ERROR: no AppImage found in the newest release. Is one published?"
    exit 1
  fi
  echo "==> Downloading $(basename "$APPIMAGE_URL")..."
  mkdir -p "$APP_DIR"
  curl -fSL --progress-bar "$APPIMAGE_URL" -o "$BIN"
  chmod +x "$BIN"

  # 3. Menu entry + icon.
  install_icon
  if [ "$DO_MENU" = "yes" ]; then
    mkdir -p "$DESKTOP_DIR"
    write_desktop_file "$DESKTOP_DIR/rascals.desktop" "$BIN" "rascals" "Rascals"
    echo "==> Start-menu entry added."
  fi
  if [ "$DO_SHORTCUT" = "yes" ]; then
    mkdir -p "$HOME/Desktop"
    write_desktop_file "$HOME/Desktop/rascals.desktop" "$BIN" "rascals" "Rascals"
    # Mark trusted on GNOME so double-click launches instead of opening an editor.
    gio set "$HOME/Desktop/rascals.desktop" metadata::trusted true 2>/dev/null || true
    echo "==> Desktop shortcut created."
  fi
  refresh_menus

  echo ""
  echo "Done! Find Rascals in your app menu (or run: $BIN)"
  echo "Updates arrive inside the app from now on."
  if [ "$DO_LAUNCH" = "yes" ]; then
    echo "==> Launching Rascals..."
    nohup "$BIN" >/dev/null 2>&1 &
    disown || true
  fi
}

install_web() {
  echo "==> Finding the newest web build..."
  ZIP_URL="$(release_asset_url 'rascals-web-.*\.zip$')"
  if [ -z "$ZIP_URL" ]; then
    echo "ERROR: no rascals-web-*.zip found in the newest release."
    echo "The web bundle ships with releases built after web support landed."
    exit 1
  fi
  for dep in python3 unzip; do
    if ! command -v "$dep" >/dev/null 2>&1; then
      echo "ERROR: web mode needs '$dep' installed (sudo pacman -S $dep)."
      exit 1
    fi
  done
  echo "==> Downloading $(basename "$ZIP_URL")..."
  mkdir -p "$WEB_DIR"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fSL --progress-bar "$ZIP_URL" -o "$tmp/web.zip"
  unzip -q -o "$tmp/web.zip" -d "$WEB_DIR"
  rm -rf "$tmp"
  trap - EXIT

  LAUNCHER="$WEB_DIR/rascals-web.sh"
  cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
# Generated by install-linux.sh — serves Rascals web locally and opens it.
PORT="$WEB_PORT"
DIR="\$(cd "\$(dirname "\$0")" && pwd)"
if ! curl -fsS -o /dev/null "http://127.0.0.1:\$PORT/" 2>/dev/null; then
  nohup python3 -m http.server "\$PORT" --directory "\$DIR" >/dev/null 2>&1 &
fi
sleep 1
(xdg-open "http://127.0.0.1:\$PORT/" >/dev/null 2>&1 || true) &
echo "Rascals web: http://127.0.0.1:\$PORT/"
EOF
  chmod +x "$LAUNCHER"

  install_icon
  if [ "$DO_MENU" = "yes" ]; then
    mkdir -p "$DESKTOP_DIR"
    write_desktop_file "$DESKTOP_DIR/rascals-web.desktop" "$LAUNCHER" "rascals" "Rascals (Web)"
    echo "==> Start-menu entry added."
  fi
  if [ "$DO_SHORTCUT" = "yes" ]; then
    mkdir -p "$HOME/Desktop"
    write_desktop_file "$HOME/Desktop/rascals-web.desktop" "$LAUNCHER" "rascals" "Rascals (Web)"
    gio set "$HOME/Desktop/rascals-web.desktop" metadata::trusted true 2>/dev/null || true
    echo "==> Desktop shortcut created."
  fi
  refresh_menus

  echo ""
  echo "Done! Web files live in $WEB_DIR — your identity stays in the browser profile."
  if [ "$DO_LAUNCH" = "yes" ]; then
    echo "==> Launching Rascals web..."
    bash "$LAUNCHER"
  else
    echo "Run $LAUNCHER to start it (serves http://127.0.0.1:$WEB_PORT/)."
  fi
}

if [ "$MODE" = "web" ]; then install_web; else install_desktop; fi
