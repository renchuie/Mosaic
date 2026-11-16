#!/usr/bin/env bash
# Study Desk installer for Arch Linux. Same script on the PC and the laptop.
# Installs only into your home directory, except for the pacman step,
# which lists the packages and asks before doing anything.
set -euo pipefail
cd "$(dirname "$0")"

BIN="$HOME/.local/bin/studydesk"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor"

# --- 1. system packages -----------------------------------------------------
# webkit2gtk-4.1: the webview Tauri draws the window with
# base-devel, openssl, librsvg, curl, wget, file, libappindicator-gtk3: Tauri's Linux build requirements
# nodejs, npm: build the frontend
# rustup: Rust compiler (skipped if you already have cargo)
want=(webkit2gtk-4.1 base-devel openssl librsvg curl wget file libappindicator-gtk3 nodejs npm)
command -v cargo >/dev/null || want+=(rustup)

if ! command -v pacman >/dev/null; then
  echo "pacman not found. This script is written for Arch Linux." >&2
  exit 1
fi

missing=()
for p in "${want[@]}"; do
  if [[ $p == base-devel ]]; then
    pacman -Qq gcc make pkgconf >/dev/null 2>&1 || missing+=("$p")
  else
    pacman -Qq "$p" >/dev/null 2>&1 || missing+=("$p")
  fi
done

if ((${#missing[@]})); then
  echo "These system packages are missing:"
  printf '  %s\n' "${missing[@]}"
  read -rp "Install them with 'sudo pacman -S --needed'? [y/N] " ok
  [[ $ok == [yY]* ]] || { echo "Stopped. Nothing was installed."; exit 1; }
  sudo pacman -S --needed "${missing[@]}"
fi

if ! command -v cargo >/dev/null; then
  rustup default stable
fi

# --- 2. build ---------------------------------------------------------------
npm ci
npm run tauri build -- --no-bundle

# --- 3. install into ~/.local -----------------------------------------------
install -Dm755 src-tauri/target/release/studydesk "$BIN"
install -Dm644 packaging/studydesk.png "$ICONS/256x256/apps/studydesk.png"
install -Dm644 packaging/studydesk.svg "$ICONS/scalable/apps/studydesk.svg"

# NVIDIA + Wayland: WebKitGTK can show a blank window unless its DMA-BUF
# renderer is turned off, so the launcher sets that only on NVIDIA machines.
exec_line="$BIN"
if [[ -e /proc/driver/nvidia/version ]] || lsmod 2>/dev/null | grep -q '^nvidia'; then
  exec_line="env WEBKIT_DISABLE_DMABUF_RENDERER=1 $BIN"
  echo "NVIDIA driver detected: launcher will set WEBKIT_DISABLE_DMABUF_RENDERER=1"
fi
mkdir -p "$APPS"
sed "s|@EXEC@|$exec_line|" packaging/studydesk.desktop > "$APPS/studydesk.desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -qtf "$ICONS" || true

echo
echo "Installed. Open 'Study Desk' from your launcher, or run: $BIN"
