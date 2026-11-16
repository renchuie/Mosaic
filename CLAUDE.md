# Study Desk

Personal student dashboard for Jazmine (pharmacy student). Desktop app for Arch Linux + Hyprland
(Wayland, end-4 illogical-impulse dotfiles). Must install identically on her PC (AMD GPU) and
laptop (NVIDIA GPU) through `./install.sh`.

## Working agreements

- Build in small phases she can run and look at. After each phase give the exact commands to run
  and a checklist of what to check.
- Before installing any system package, say exactly what and why.
- Never edit her Hyprland config. Offer snippets (`packaging/hyprland-rules.conf`) she pastes herself.
- Personal data never goes in the repo.

## Stack (decided)

- Tauri v2 (Rust) + Svelte 5 (runes) + Vite + TypeScript. Plain CSS with variables, no UI framework.
- App name `studydesk`, shown as "Study Desk". Tauri identifier is `studydesk`, so the Wayland
  app id / Hyprland class and the webview data dir are both `studydesk`.
- App data: JSON files in `~/.local/share/studydesk/`, written atomically from Rust. Anything that
  should follow her between PC and laptop goes in the synced store (see "Sync" below), not in its
  own JSON file. Machine-only data (settings, scan cache, labs tree) stays local.
- No Google APIs at all. She decided against Google Calendar: the calendar is local and syncs
  through the Drive folder like everything else. Drive is only ever touched as a mounted folder.
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
probe, scanned labs, stored progress and sync results to stdout, then exits. Two "machines": run a
second copy with `HOME=/tmp/homeB` (symlink `/tmp/homeB/GoogleDrive` to the real one). Pure
modules (`labMerge.ts`, `calendar.ts`) import nothing, so they can be tested with plain `node`. With Xvfb:
`DISPLAY=:99 STUDYDESK_ROUTE=selftest ./src-tauri/target/release/studydesk`.

## Sync between PC and laptop (Phase 3, built and tested)

- Sync folder (Settings, default on): `~/GoogleDrive/Pharmacy School/Study Lab/Study Desk Sync/`.
  Each machine writes ONLY its own file `<hostname>-<4 hex>.json` (id kept in local `machine.json`)
  and reads the others, so rclone never sees two writers on one file. Writes are temp + rename.
- `src-tauri/src/sync.rs` refuses to create the sync folder when its parent is missing (Drive not
  mounted), so nothing is ever written under an empty mount point. The app keeps working locally.
- `src/lib/stores/synced.svelte.ts`: named collections of records `{u: changed ms, m: machine,
  x?: deleted, v}`; merge keeps the newer record (tie: machine id). Deletes are tombstones.
  Local copy in `synced.json`. Sync on start, window focus, every 2 min, and 4 s after a change.
  `seed()` writes starter records stamped u=1 so any real edit on any machine wins.
- Collections: `events` (calendar), `folders` (lab folder links), `labOpens`, `days` (streak),
  `lab` (one record per `recallLab.*` localStorage key). Phase 2's `labs-folders.json` and
  `labs-activity.json` are migrated once into the store (old files left in place, unused).
- Lab progress merge (`src/lib/labMerge.ts`, pure): `best` = max per section, `known` = union,
  `sims` = union by `d`, `missed` and all other keys from the newer side. Local changes are caught
  from `storage` events and at each sync; the lab open in the viewer is never overwritten while open.
- Tested with two app instances (separate HOME, shared folder): migration, first pull on a new
  machine, and lab progress studied on one machine appearing on the other.

## Calendar (Phase 3, built; redesigned after her feedback)

She said the first version "looks too much like Google Calendar". The look now follows her two
references: a Skejulio-style planner (card events with a tag header, side panel with mini month
and tag checkboxes, "Create schedule" popover) and an exam calendar with month pills and day rows.
Do not go back to thin coloured blocks on a plain grid.

- Data (`src/lib/calendar.ts`, pure; store `src/lib/stores/calendar.svelte.ts`): event = title,
  tag id (`kind`), course, day, all-day or start–end, place, description (`notes`), repeat, skips.
  Dates are local "YYYY-MM-DD" strings.
- Tags (collection `tags`, synced): name, colour, "counts as exam", order. Built-in class / exam /
  study / other can be renamed and recoloured, not deleted; custom tags can be deleted (their
  events move to Other). Colours: `PALETTE` of soft swatches or any colour; components use
  `tagStyle(id)` (sets `--tag`, `--tag-ink`) with `color-mix` tints. Tag manager: `TagManager.svelte`.
- Repeat: daily / weekly (chosen weekdays) / monthly (same date, or same weekday like "3rd Monday"
  / "last Friday") / yearly, every N, ending never / on a date / after N times, plus per-day
  skips. `describeRepeat` writes the summary. Phase 3's `{weekdays, until}` shape is still read.
- Views (`src/routes/Calendar.svelte`): Day, Week (time grid with card events that show less as
  they get shorter or share a lane; click empty time to add; now line with a time pill), Month,
  List (next 14 days as day rows of cards), Exams (month pills with counts, day rows, empty runs
  folded into one short row). Side panel (mini month, tag filters, coming up) can be hidden;
  hidden tags and the panel state are per machine (localStorage).
- One shared editor popover (`EventEditor.svelte`) opens beside the click on wide windows and
  centred on narrow ones. Editing a repeating event changes the series; delete offers "only this
  day" or "every repeat".
- Exams = a tag marked "Exam" (e.g. a custom Quiz tag), or tag Other with an exam keyword in the
  title (Settings, default "Exam"), plus Recall Lab folders with an exam date (skipped when a
  calendar exam is on the same day). So "Exam 4 sim run" tagged Study is not an exam.
- Ther IV Exam 4 (2026-11-17) and Exam 5 (2026-12-04) are seeded as exam events; the four
  built-in tags are seeded too (u=1, so any edit wins).
- Dashboard: countdown, mini month, next-exam tile and Today timeline read the calendar.

## Tasks (built early, at her request; Phase 4 builds on this)

- Tasks are the second kind of calendar entry (collection `tasks`, synced). Shape in
  `src/lib/calendar.ts` (`Task`): title, notes, tag (default built-in "Task" tag), course, due day
  (optional) and optional due time, priority (high / normal / low), status (todo / doing / done;
  the Phase 4 board uses status as its column, custom columns may add ids), doneAt, estimate in
  minutes (for the Phase 4 study plan), checklist (`subtasks`), repeat with per-day `doneDates`
  and `skip`. Keep this shape stable.
- One editor for both (`EventEditor.svelte`): new entries have an Event / Task switch; existing
  ones keep their type. Every field is reset on open. Time inputs accept any minute (11:59 PM
  deadlines). Weekly repeat days follow the chosen date until she picks days herself.
- Calendar: tasks show as tickable chips (`TaskChip.svelte`) in the Week/Day "Tasks" row and in
  Month cells, and as cards (`TaskCard.svelte`) in List, which also has an Overdue section.
- Overdue = one-off tasks past due and not done (any age), and repeating tasks' missed days from
  the last 14 days.
- Dashboard: Tasks card lists overdue, today, then the next 5 days (tick, open, add); "Due today"
  tile and the summary line use real tasks.
- Tasks page (`src/routes/Tasks.svelte`): quick add (no date / today / tomorrow), course and tag
  filters, groups Overdue, Today, Tomorrow, This week, Later (one row per repeating task), No due
  date, Done (optional). The board view is still Phase 4.

## Phase 4: board, study plan, activity (built)

- Tasks page has tabs List / Board / Study plan (`#/tasks`, `#/tasks/board`, `#/tasks/plan`),
  files in `src/routes/tasks/`.
- Board (`Board.svelte`): group by status (To do, In progress, her own columns from synced
  collection `columns`, Done), by course (COURSES + No course) or by tag (tags are her own
  categories; "+ Add tag" makes one). Dragging is pointer-based (not HTML drag-and-drop, which
  Tauri's file-drop handling can block on Linux); the board auto-scrolls near its edges. A drop
  sets status / course / tag and renumbers `order` for the column it lands in. A repeating task
  shows once, as its next unticked day; dropping it on Done ticks that day. Deleting a custom
  column moves its tasks to To do. Done shows the last 14 days. Per-column quick add.
- Study plan (`src/lib/plan.ts` pure, `src/lib/stores/plan.svelte.ts`): synced collection `plans`
  keyed by day, `{blocks, start?}`; block = title, minutes, study/break, done, spentMs, optional
  taskId / labRel / course. Times are worked out from the start time. The timer is per machine
  (local `timer.json`), keeps counting across page changes and restarts (capped at the block length
  + 30 min if left running), chimes once when time is up, and saves time on pause / done.
  Checking off a study block counts toward the streak. Suggestions: Study events on the calendar
  that day, tasks due soon or overdue (using their estimate), and recent Recall Labs (missed review,
  sim run). Unfinished blocks from yesterday can be brought over.
- Floating timer pill (`TimerPill.svelte`) on every page except the plan; the dashboard's
  Current block card is the real next / running block.
- Activity heatmap (`Heatmap.svelte`, `src/lib/stores/activity.svelte.ts`) on the dashboard: score
  per day = study minutes + 20 per lab opened + 10 per task done; as many weeks as fit. `days`
  records are now `{labs, blocks}` counts (old records are `1` = one lab).
- Tested: drags in all three groupings, custom columns, the timer across pages, and the timer across
  a real app restart (`STUDYDESK_ROUTE=selftest-timer`, run twice).

## Other decisions

- Streak: a day counts if she opened a lab or checked off a study block. Activity heatmap feeds it.
- Grades: each course can be weighted by category or by points. Show current grade and what is
  needed on remaining items to hit a target. Fall 2026 courses: Therapeutics IV, Pharmacy Law,
  Clinical Pharmacogenetics, Advanced Pharmacy Practice (group innovation project), Clinical
  Applications. Also track Top 200/300 drug quizzes.
- Settings: name, labs folder, scan depth, exam keywords, sync folder and status exist; JSON
  export/import comes in Phase 6 (sync covers moving data between machines).

## Phases

1. Shell, design system, dashboard on sample data, launcher entry, install script. DONE
   (restyled once to the soft pastel look)
2. Recall Labs: folder dashboards, scanner + cache, in-app viewer, real progress on the dashboard. DONE
3. Local calendar (week, agenda, exams) and sync through the Drive folder. DONE
4. Tasks board and daily study plan with timer; activity heatmap. DONE (tasks as calendar
   entries were added just before it)
5. Courses and grades; Top 200/300 tracker.
6. Settings, JSON backup, polish.

All Phase 1 sample data has been replaced; `src/lib/sample/data.ts` only holds the TONES list, and
`src/lib/sample/labs.ts` is preview data for running the UI in a plain browser.

## Commands

- `npm run tauri dev`: run with hot reload
- `npm run build` / `npm run check`: frontend build / type-check
- `npm run tauri build -- --no-bundle`: release binary at `src-tauri/target/release/studydesk`
- `./install.sh`: check packages (asks first), build, install into `~/.local`
