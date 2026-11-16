# Study Desk

Personal student dashboard for Jazmine (pharmacy student). Desktop app for Arch Linux + Hyprland
(Wayland, end-4 illogical-impulse dotfiles). Must install identically on her PC (AMD GPU) and
laptop (NVIDIA GPU) through `./install.sh`.

## Working agreements

- Build in small phases she can run and look at. After each phase give the exact commands to run
  and a checklist of what to check.
- Before installing any system package or creating any Google Cloud resource, say exactly what and why.
- Never edit her Hyprland config. Offer snippets (`packaging/hyprland-rules.conf`) she pastes herself.
- Tokens, OAuth client IDs and personal data never go in the repo.

## Stack (decided)

- Tauri v2 (Rust) + Svelte 5 (runes) + Vite + TypeScript. Plain CSS with variables, no UI framework.
- App name `studydesk`, shown as "Study Desk". Tauri identifier is `studydesk`, so the Wayland
  app id / Hyprland class and the webview data dir are both `studydesk`.
- App data: JSON files in `~/.local/share/studydesk/`, written atomically from Rust. Separate per
  machine; export/import JSON moves it between PC and laptop.
- Font bundled through `@fontsource/atkinson-hyperlegible-next`. The app must work offline.
- Bundling is off (`bundle.active: false`); `install.sh` builds with `tauri build --no-bundle` and
  installs the binary, icon and `.desktop` file into `~/.local`.
- NVIDIA: `install.sh` detects the driver and puts `WEBKIT_DISABLE_DMABUF_RENDERER=1` in the launcher.

## Design (decided: soft, fluid pastel)

She dropped neo-brutalism entirely (first softened it, then switched). Do not bring back ink
borders, hard shadows, window-dot header strips, hatched fills, Unbounded or Space Mono. (Outfit + DM Sans were tried and replaced too.)
Everything lives in `src/styles/tokens.css`:

- No outlines. Soft blurred warm shadows, 26px card radius, pill buttons, gentle gradients and
  layered wave shapes (`Wave.svelte`) as decoration. Touch targets at least 44px.
- Palette taken from her pastel reference: rose #F2B8B5 (deep #E3949B), peach #F6CFA8,
  sage #A9CDC3 (deep #7FB3A6), butter #F7E3B0, each with a `-soft` tint; ivory #FBF6F0 panel,
  white #FFFDFB cards, charcoal #3B3033 text and primary buttons, mauve #6F6164 muted text.
- Meaning: rose = exams/alerts/overdue, sage = done/study/go, peach and butter = neutral accents.
- Card tones cycle through `TONES` (rose, sage, peach, butter) using the `--g-*` gradients.
- Font: Atkinson Hyperlegible Next everywhere (she asked for something clean and easy on the
  eyes): 600 for headings and big numbers in sentence case, 400–500 for body and labels.
- Layout: backdrop is a soft rose-to-sage gradient; the sidebar sits directly on it and the active
  nav item is a tab that flows into the big rounded ivory main panel. Sidebar has the streak panel
  at the bottom. Main card grid plus right column (countdown, current block, mini month, today,
  quick play). Must hold up in narrow tiled windows: right column drops below ~1180px, sidebar
  becomes an icon rail below ~860px.
- Components use semantic tokens (`--panel`, `--surface`, `--text`, `--primary` …) so dark mode
  later is one extra block of variables.

## Recall Labs (Phase 2, built)

- Labs folder: `~/GoogleDrive/Pharmacy School/Study Lab/Recall Labs` (rclone mount; read from disk,
  never the Drive API). Configurable in Settings, with scan depth (default 4).
- Every folder is a dashboard (`src/routes/labs/FolderView.svelte`): its labs with progress,
  subfolders, notes (.md .txt .docx .doc .odt .rtf .gdoc .pages) and files (everything else,
  opened with `xdg-open`), plus a "Link this folder" card: course, exam date, colour. Those are
  stored in app data `labs-folders.json` keyed by path relative to the labs folder (course and
  colour inherit from parent folders; renaming a folder loses its link). A folder exam date feeds
  the dashboard countdown as "<parent> <folder>", e.g. "Ther IV Exam 5".
- Lab detection: `<meta name="recall-lab-version">` (any attribute order) plus `<title>`. Slug: the
  most frequent literal `recallLab.<slug>.v3` in the file; if none (key built dynamically), slugify
  the file name and flag `slug_guessed`. Non-lab .html files are plain files.
- Scan (`src-tauri/src/labs.rs`): reads only the first 64 KB for the meta tag (whole file only to
  find the slug), cached by path + mtime + size in `labs-scan-cache.json`; last tree cached in
  `labs-tree.json` so the app opens instantly, then rescans in the background.
- Progress: `recallLab.<slug>.v3` → `best` (sections tried = number of keys, average best %),
  `missed` count, `known`, `sims` sorted by `d` (last and best `pct`). Parser: `src/lib/progress.ts`.
- SERVING (important, tested): labs are served at `tauri://localhost/__labs/<rel>` through
  `on_web_resource_request` on the main window (built in `setup`, config has `create: false`), so
  labs and the dashboard share ONE origin and localStorage, read directly (`src/lib/labStorage.ts`)
  with `storage` events for live updates. A separate `lab://` custom-scheme origin in an iframe was
  tried first: WebKitGTK gave it session-only storage, so progress vanished on restart. Do not go
  back to a separate origin. In `tauri dev`, `vite.config.ts` serves `/__labs/` the same way.
  Trade-off: labs run on the app origin and could call app commands; acceptable because she
  writes the labs herself.
- Settings has "Check lab storage" (proves persistence across restarts) and a paste box to import
  `recallLab.*` progress copied from a browser's devtools console.
- Streak: days with a lab opened (`labs-activity.json`); study-block check-offs join in Phase 4.

## Testing without a screen

`STUDYDESK_ROUTE=labs/<path>` opens a page at start; `STUDYDESK_ROUTE=selftest` prints the storage
probe, scanned labs and stored progress to stdout, then exits. With Xvfb:
`DISPLAY=:99 STUDYDESK_ROUTE=selftest ./src-tauri/target/release/studydesk`.

## Other decisions

- Google Calendar: OAuth installed-app loopback flow with PKCE in Rust. Tokens in the system keyring
  (Secret Service), falling back to a `0600` file in the data dir. Client ID kept in the data dir.
  She does the Cloud console clicks herself from a step-by-step walkthrough.
- Calendar page: week grid with coloured blocks and a create popover (study blocks written to a
  calendar she chooses), 14-day agenda, exams tab. Exams = events whose title matches the exam
  keywords (default "Exam") plus manually added ones.
- Tasks: BOARD view, switchable between columns by status and columns by course, and she can add her
  own categories/columns. Fields: course, due date, priority, done. Daily study plan with ordered
  blocks, durations, start/pause timer that survives page changes, check-off.
- Streak: a day counts if she opened a lab or checked off a study block. Activity heatmap feeds it.
- Grades: each course can be weighted by category or by points. Show current grade and what is
  needed on remaining items to hit a target. Fall 2026 courses: Therapeutics IV, Pharmacy Law,
  Clinical Pharmacogenetics, Advanced Pharmacy Practice (group innovation project), Clinical
  Applications. Also track Top 200/300 drug quizzes.
- Settings: name, labs folder and scan depth exist (Phase 2); calendars shown, exam keywords and
  JSON export/import come in Phase 6.

## Phases

1. Shell, design system, dashboard on sample data, launcher entry, install script. DONE
   (restyled once to the soft pastel look)
2. Recall Labs: folder dashboards, scanner + cache, in-app viewer, real progress on the dashboard. DONE
3. Google Calendar: walkthrough, connect, agenda, week grid, exams, countdowns, study blocks.
4. Tasks board and daily study plan with timer; activity heatmap.
5. Courses and grades; Top 200/300 tracker.
6. Settings, JSON backup, polish.

Sample data lives in `src/lib/sample/data.ts`; each phase replaces its part with a real store.

## Commands

- `npm run tauri dev`: run with hot reload
- `npm run build` / `npm run check`: frontend build / type-check
- `npm run tauri build -- --no-bundle`: release binary at `src-tauri/target/release/studydesk`
- `./install.sh`: check packages (asks first), build, install into `~/.local`
