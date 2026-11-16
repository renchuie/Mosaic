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
- Fonts bundled through `@fontsource/*` (Outfit, DM Sans). The app must work offline.
- Bundling is off (`bundle.active: false`); `install.sh` builds with `tauri build --no-bundle` and
  installs the binary, icon and `.desktop` file into `~/.local`.
- NVIDIA: `install.sh` detects the driver and puts `WEBKIT_DISABLE_DMABUF_RENDERER=1` in the launcher.

## Design (decided: soft, fluid pastel)

She dropped neo-brutalism entirely (first softened it, then switched). Do not bring back ink
borders, hard shadows, window-dot header strips, hatched fills, Unbounded or Space Mono.
Everything lives in `src/styles/tokens.css`:

- No outlines. Soft blurred warm shadows, 26px card radius, pill buttons, gentle gradients and
  layered wave shapes (`Wave.svelte`) as decoration. Touch targets at least 44px.
- Palette taken from her pastel reference: rose #F2B8B5 (deep #E3949B), peach #F6CFA8,
  sage #A9CDC3 (deep #7FB3A6), butter #F7E3B0, each with a `-soft` tint; ivory #FBF6F0 panel,
  white #FFFDFB cards, charcoal #3B3033 text and primary buttons, mauve #6F6164 muted text.
- Meaning: rose = exams/alerts/overdue, sage = done/study/go, peach and butter = neutral accents.
- Card tones cycle through `TONES` (rose, sage, peach, butter) using the `--g-*` gradients.
- Fonts: Outfit 400–600 for headings and big numbers (sentence case), DM Sans for body and labels.
- Layout: backdrop is a soft rose-to-sage gradient; the sidebar sits directly on it and the active
  nav item is a tab that flows into the big rounded ivory main panel. Sidebar has the streak panel
  at the bottom. Main card grid plus right column (countdown, current block, mini month, today,
  quick play). Must hold up in narrow tiled windows: right column drops below ~1180px, sidebar
  becomes an icon rail below ~860px.
- Components use semantic tokens (`--panel`, `--surface`, `--text`, `--primary` …) so dark mode
  later is one extra block of variables.

## Recall Labs (Phase 2 design)

- Labs are single self-contained HTML files under the rclone mount `~/GoogleDrive` (read from disk,
  never the Drive API). Detect by `<meta name="recall-lab-version" content="…">` plus `<title>`.
- Progress lives in localStorage key `recallLab.<slug>.v3` (example slug `ther4-exam4`). Fields used:
  `best` (section id → best %), `missed` (question ids), `known` (flashcard ids),
  `sims` (`{d, n, pct, lost, gained, other, min}`). Ignore `gut`, `gm`, `cb`, `plan`, `exam`, ….
- Slug: found by searching the lab HTML for `recallLab.<slug>.v3`.
- Show: sections tried (count of keys in `best`, no total), average best %, missed count, last and
  best sim score.
- Plan: Rust serves labs on one custom origin (`lab://localhost/…`) in an iframe; a hidden bridge
  page on that origin reads all `recallLab.*.v3` keys and posts them to the dashboard. Lab files are
  never modified. FIRST verify WebKitGTK persists that iframe storage across restarts; fallback is
  serving app and labs from a single origin.
- Scan: configurable folder, depth limit (default 3), read only the head of each `.html`, cache by
  path + mtime + size, manual Rescan. Add a one-time "import progress" paste box for progress that
  currently lives in her browser.
- Current labs: Ther IV Exam 4 (exam Tue 2026-11-17), Ther IV Exam 5 (exam Fri 2026-12-04, grows).

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
- Settings: name, labs folder, calendars shown, exam keywords, JSON export/import.

## Phases

1. Shell, design system, dashboard on sample data, launcher entry, install script. DONE
   (restyled once to the soft pastel look)
2. Recall Labs: storage test, scanner + cache, hub, in-app viewer, real progress on the dashboard.
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
