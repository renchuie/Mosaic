# Study Desk

Personal student dashboard: a small Tauri desktop app for Arch Linux + Hyprland.

## Install (PC and laptop)

```sh
git clone <this repo> && cd iwanttocry
./install.sh
```

The script lists any missing system packages and asks before installing them, builds the app, and
puts the binary, icon and launcher entry in `~/.local`. Then open **Study Desk** from your launcher.

## Develop

```sh
npm install
npm run tauri dev
```

Optional Hyprland window rules are in `packaging/hyprland-rules.conf`.
See `CLAUDE.md` for the decisions behind the project and the build phases.
