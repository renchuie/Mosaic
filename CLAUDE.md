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
- Work follows `ROADMAP.md`: one focus per week until v1.0 on Dec 31, 2026. Stay inside the current
  week's focus; log anything else under "Found this week" in that file.

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
`STUDYDESK_ROUTE=selftest-pdf` reads a PDF from the PDF folder, saves a highlight into it through the
raw IPC write, reads it back and checks that a stale write is refused.

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

## Tasks look (after her "more pizazz" feedback, from four mobile task-app references)

- Tasks page top: dark "Today's progress" card (ring % of today's tasks done, overdue, To do / In
  progress / Done this week) and a week strip with coloured dots per due task; picking a day
  filters List and Board (`taskView.day` in the tasks store). Files: `src/routes/tasks/`.
- Board cards: white, tag-coloured accent bar, coloured priority pill (Low = sage, Medium = peach,
  High = rose; the stored value is still `normal` for Medium), round open arrow, pastel tag icon
  tile, checklist progress bar, dashed footer with due (rose when late), estimate, repeat streak
  and the tick. Columns are tinted by status / course / tag colour with a count-bubble pill header.
- Tags have an icon (`Tag.icon`, picker in the tag manager, defaults in `DEFAULT_TAG_ICON`).
- List view is a routine-style timeline (`TaskRow.svelte`): tick circles on a dotted line, icon
  tile, "Streak N weeks" for repeating tasks (`taskStreak`), estimate / due on the right behind a
  divider, expandable checklist. Group headings have icons.
- Study plan blocks are a timeline: coloured circle icons on a line (study sage, break butter,
  lab peach, task = its tag colour); the current block is a tall pill that fills as time passes
  and says "N min remaining"; tick rings in the block colour.

## Phase 5: courses as the hub (built; she plans to keep adding to it)

The app's purpose is an all-in-one uni home base, and the course is what ties things together.

- Courses (synced collection `courses`, store `src/lib/stores/courses.svelte.ts`): name, short name,
  colour, icon, term, credits, instructor, email, office hours, room, grading, notes pad, optional
  drug-quiz tracker, archived. Seeded for Fall 2026 (ids ther4, law, pgx, app, capps, top200) with
  no grading; she fills it in from each syllabus. `courseNames()` feeds every course picker.
- Other records (events, tasks, lab folder links, plan blocks) refer to a course by NAME.
  `saveCourse` rewrites those references when a course is renamed (tested). Keep it that way or
  migrate everything to ids in one go.
- Grade maths (`src/lib/grades.ts`, pure, tested with node): weighted categories (points add up
  inside a category, drop-lowest N, extra credit, excused) or total points; current grade on what's
  graded; final grade is linear in the average x scored on everything left (final = A + B·x), which
  gives "need X% on the rest" (secured / reachable / out of reach), worst and best case, the
  graded share, what-if scores, letters from a per-course scale (A–F or +/−) and a term GPA estimate.
  A category with weight but no assessments yet counts entirely as "still to come".
- Pages (`src/routes/courses/`): Courses home (cards with grade ring, letter, need line, graded
  share, next exam/task, linked labs; term GPA; archived toggle) and a course page: gradient header
  with grade ring, editable target, need/what-if, worst–best bar; Grades module (category bars,
  inline-editable assessment tables, quick add per category, ⋯ menu for extra credit / excused /
  move category / delete, what-if mode); Drug quiz tracker (Top 200/300: drug ranges, average, best,
  coverage of the list, trend line, quick add that continues from the last range); side column with
  Coming up (exams, tasks, events for the course, + Task / + Event), Study (linked Recall Lab
  folders and labs, study minutes from plan blocks) and a Notes pad. Settings dialog
  (`CourseSettings.svelte`) with category templates and a weights-must-total-100 check.
- Dashboard has a Courses card (ring with letter, grade, need line per course).
- All placeholder pages are gone; every sidebar page is real.

## Study tab (decided; being built in phases S1–S6)

Labs became a generic **Study** area, "RemNote but better". Sections: Home, Notes, Cards, PDFs,
Recall Labs. Decisions she approved:
- Notes are Markdown files in a Drive folder (default `~/GoogleDrive/Pharmacy School/Study Lab/Notes`,
  Settings), readable outside the app. Card review history lives in the synced store, keyed by a
  stable card id written into the note.
- PDF annotations are saved into the PDF itself after a one-time backup of the original.
- Imports: Anki and CSV (built with the card library). No AI features.
- Libraries (npm, no system packages): CodeMirror 6 (notes editor), ts-fsrs (FSRS scheduling),
  pdfjs-dist 4.x legacy build (viewing), pdf-lib (writing annotations, later page editing).
- Phases: S1 Study tab shell with Recall Labs moved in (DONE); S2 notes (DONE); S3 cards in notes + FSRS (DONE); S4 card library (DONE); S5 PDF viewer + annotations (DONE) (editor, [[links]], backlinks,
  #tags, templates, class notes from calendar events, notes on course pages); S3 cards written in
  notes (`Q :: A`, `:::` two-way, `{{cloze}}`, list cards) + FSRS review + dashboard "cards due";
  S4 card library (note types with fields, Drug type, table → cards, CSV/Anki import, image
  occlusion, exam-aware scheduling/cram); S5 PDF viewer + annotations linked to notes and cards;
  S6 PDF page editing + Ctrl+K search everywhere.
- Her own additions to keep: exam-aware scheduling, table → cards for drug comparison tables,
  class notes linked to calendar events, Top 300 as drug cards feeding the quiz tracker.

## Study S1 + S2 (built): Study tab and notes

- Sidebar "Labs" is now "Study" (`#/study`); Recall Labs keep their `#/labs/...` routes and show
  the Study tabs (Home, Notes, Recall Labs) on top (`src/routes/study/StudyNav.svelte`). Cards and
  PDFs tabs get added when S3/S5 land.
- Notes: Rust `src-tauri/src/notes.rs` (list / read / conflict-safe write with expected mtime /
  pasted images / mkdir / move / trash into `.trash/`; refuses to create the folder when Drive is
  unmounted). Note images are served at `/__notes/…` like labs (and by `vite.config.ts` in dev).
- `src/lib/notes.ts` (pure, node-tested): front matter (course, tags, date, event, unknown keys
  kept), title = first H1 or file name, [[links]] (alias and #heading forms), #tags, headings,
  rename links, safe file names, templates (Lecture, Drug monograph with `::` fields, Disease
  state, Patient case SOAP).
- Store `src/lib/stores/notes.svelte.ts`: in-memory index cached in `notes-cache.json`, re-reads
  only changed files, refresh on focus. Renaming a note renames the file, its H1 if it matched,
  and every [[link]] to it. Clicking a link to a missing note creates it. Class notes:
  `classNote(eventId, date, …)` keyed by front matter `event: id@date`, in a folder named after
  the course, lecture template.
- Editor `src/lib/components/NoteEditor.svelte` (CodeMirror 6): styled Markdown, • bullets,
  Tab/Shift-Tab, ==highlight==, [[link]] chips that open on click + autocomplete, #tag
  autocomplete, card syntax highlighted (`::`, `:::`, `{{cloze}}`), pasted images saved to
  `attachments/` and shown inline. Autosave 700 ms; a conflict shows "Load that version / Keep mine".
- Notes page: tree with search (title + full text), properties row (course, date, tags), ⋯ move /
  trash, toolbar, right column with Linked to, Outline, Backlinks, Links (missing ones offer
  create). Event editor has "Take notes / Open notes"; course pages list Course notes (+ Note);
  the old course notes pad is now "Scratch pad".
- Layout gotcha: a container query can't style the element that is the container. NotesView and
  Calendar wrap themselves (`.nwrap`, `.calwrap`) for that reason.
- Empty `<input type=date>` shows today's date in WebKitGTK; add class `empty` (greyed) when unset.

## Study S3 (built): flashcards in notes + FSRS review

- Syntax (`src/lib/cards.ts`, pure, node-tested): `Q :: A` basic, `Q ::: A` two cards (forward and
  reverse), `{{cloze}}` (each gap its own card; `{{c1::…}}` gaps hide together; `{{answer::hint}}`),
  `Question ::` with indented bullets below = list card. `Field ::` with nothing after it (the drug
  template) is not a card. Code blocks are skipped. Context = heading path + up to two parent bullets.
- Every card line gets a hidden stable id `<!--sd:xxxxxx-->` appended (review keys: `id`, `id:r`,
  `id:cN`). The editor adds ids to the open note while typing (`appendToLines`, cursor kept) and
  hides them as atomic ranges; `ensureIds()` adds them to other notes (skips `notes.editing`) with
  the usual mtime conflict check.
- Store `src/lib/stores/srs.svelte.ts` (ts-fsrs, enable_fuzz, max interval 10 y): synced
  collections `srs` (FSRS card state per key, dates as ms, `suspended`) and `reviewDays` (reviews,
  new, again, ms per day). Settings: `newPerDay` (20), `retention` (0.9). Learning cards may show up
  to 20 min early (Anki's learn-ahead). Undo restores the previous record (deletes it for a new card).
- UI: Study → Cards (`CardsView.svelte`): due now hero, stats (total, mature ≥ 21 d, 30-day
  retention, today), decks by course and by note, 14-day forecast, searchable card list with suspend,
  settings. Review (`ReviewSession.svelte`, `#/study/cards/review/all|course:<name>|note:<rel>`):
  context breadcrumb, Space to show, 1–4 to rate with next-interval labels, Z undo, "Edit in note"
  jumps to the line (`notes.jump`), summary at the end.
- Wired in: Cards tab badge, dashboard Flashcards card, Study Home card, course page "N to review",
  study plan suggestion "Review N flashcards" (block `href`), heatmap (+½ per review), streak
  (`markStudyDay("reviews")`).

## Study S4 (built): card library

- Library cards live in the synced store, not in notes: collection `cardItems` (one item = note type
  id + fields + course + tags), note types in collection `cardTypes` (seeded built-ins, u=1).
  Store `src/lib/stores/library.svelte.ts`; pure logic `src/lib/cardTypes.ts` (node-tested).
- Built-in types: Basic, Basic both ways, Cloze, Drug (generic/brand/class/indication/ADEs/
  counseling; templates brand→generic, generic→brand, generic→class, indication, ADEs, counseling,
  each only when its fields are filled), Image occlusion. Custom types: fields + card templates
  with `{{Field}}`, `{{#F}}…{{/F}}`, `{{^F}}`, `{{cloze:F}}`; renaming a field rewrites templates.
- Review keys: `fl:<itemId>:<template>`, cloze `:cN`, occlusion `:m<maskId>`. `allCards()` in the
  srs store returns note cards and library cards together; scope `library` is the library deck.
- Import (`ImportDialog.svelte`): CSV / TSV / Anki "Notes in plain text" export (auto separator,
  quotes, `#separator` / `#html` headers, HTML stripped), column → field mapping guessed from
  headers, course and tags for the batch.
- Image occlusion (`OcclusionEditor.svelte`, `OcclusionView.svelte`): paste or pick an image
  (saved to the notes folder `attachments/card-…`), draw boxes; one card per box, "hide all" or
  "hide one" mode. Card title is the Header field.
- Table cards in notes: a Markdown table with `:: table` on the line above makes one card per filled
  cell (row header + column header → cell), key `id:t<hash(row|col)>`, so drug comparison tables work.
- Exam-aware (Settings in Cards, default on): when a course has an exam coming, a review's due date
  is capped at the evening before it (if that is more than 1 h away). Course-level for now, so a
  Ther IV card counts for both Exam 4 and Exam 5; linking a deck to one exam is a possible later step.
- Cards page: exam readiness panel per upcoming exam (cards due before it, "Fit before exam" pulls
  everything into the window, Cram); cram (`#/study/cards/cram/<scope>`) reviews without changing
  FSRS state. Library at `#/study/cards/library[/<itemId>]` with type filter chips, quick add per type,
  search and course filter.

## Study S5 (built): PDF viewer and annotations

- PDF folder (Settings, default `~/GoogleDrive/Pharmacy School`, 6 levels): Rust `src-tauri/src/pdfs.rs`
  lists PDFs (hidden folders skipped), serves them at `/__pdfs/…` like labs and notes (and
  `vite.config.ts` serves `/__pdfs/` and `/__pdfs-list` in dev/preview; `STUDYDESK_PDFS` overrides the
  folder there), writes with the bytes as a raw IPC body (path in header `x-rel`, conflict check on
  `x-expected` mtime), and copies the untouched original once to `<pdf folder>/.studydesk-originals/
  <same path>` before the first write. "Restore the original" puts it back. `pdfs_open` = xdg-open.
- Annotations live IN the PDF as standard annotations with appearance streams (Highlight, Underline,
  StrikeOut, Square, Ink, Text), so Okular/Firefox/Acrobat show them too (checked with poppler).
  Ours have `/NM sd-…` and our JSON in `/SDData`; everything else in the file (a lecturer's notes,
  links, forms) is kept. `src/lib/pdfAnnots.ts` (pure, pdf-lib, node-tested): `readAnnots` returns
  our marks plus a copy WITHOUT them for pdf.js to draw (we draw ours as SVG on top, blended with
  multiply), `writeAnnots` replaces ours on save. Coordinates are PDF user space via pdf.js
  `convertToPdfPoint` / `convertToViewportRectangle`. Encrypted or unparseable PDFs open read-only.
- Store `src/lib/stores/pdfs.svelte.ts`: list cached in `pdfs-cache.json`; synced collection
  `pdfState` per PDF {page, opened, annots, pages} (resume on the other machine). A PDF belongs to a
  course when a folder on its path is the course name or code ("Ther IV", "Law").
- Viewer `src/routes/study/pdfs/PdfViewer.svelte` (`#/study/pdfs/<rel>?p=<page>`): lazy page
  rendering (IntersectionObserver, canvases far away released), pdf.js text layer, fit width / zoom,
  page box, outline, Marks panel. Tools: select (menu: highlight colours, underline, Card, To note),
  highlight H, underline U, strike S, box B, pen P, sticky note N; Esc, Delete, PgUp/PgDn, Ctrl ±/0.
  Autosave 0.9 s after a change. If the file changed on disk (other computer), marks are merged by
  id (newer wins, deletions on either side respected) and saved again; checked on window focus too.
- Links: Card from a highlight (`CardFromText.svelte`: cloze by clicking/dragging words, or a
  question) and occlusion card from a box (region rendered at up to 6x into OcclusionEditor);
  library items get `source: {pdf, page}` and review shows a link back to the page. "To note" /
  "Highlights to note" append quotes to the PDF's own note (front matter `pdf: <rel>`, created in the
  course's notes folder) with a link `[[folder/file.pdf#p3|file, p. 3]]`; clicking such a link in a
  note opens the PDF at that page (`Parsed.pdfs` holds a note's PDF links, kept out of note links).
- Also: Study tab "PDFs" (`PdfsHome.svelte`: keep reading, course chips, search, folder groups),
  Study Home "Keep reading", course page "PDFs".

## Other decisions

- Streak: a day counts if she opened a lab or checked off a study block. Activity heatmap feeds it.
- Settings: name, labs folder, scan depth, exam keywords, sync folder and status exist; JSON
  export/import comes in Phase 6 (sync covers moving data between machines).

## Phases

1. Shell, design system, dashboard on sample data, launcher entry, install script. DONE
   (restyled once to the soft pastel look)
2. Recall Labs: folder dashboards, scanner + cache, in-app viewer, real progress on the dashboard. DONE
3. Local calendar (week, agenda, exams) and sync through the Drive folder. DONE
4. Tasks board and daily study plan with timer; activity heatmap. DONE (tasks as calendar
   entries were added just before it)
5. Courses and grades; Top 200/300 tracker. DONE as a first version; more course modules to come.
6. Settings, JSON backup, polish.

All Phase 1 sample data has been replaced; `src/lib/sample/data.ts` only holds the TONES list, and
`src/lib/sample/labs.ts` is preview data for running the UI in a plain browser.

## Commands

- `npm run tauri dev`: run with hot reload
- `npm run build` / `npm run check`: frontend build / type-check
- `npm run tauri build -- --no-bundle`: release binary at `src-tauri/target/release/studydesk`
- `./install.sh`: check packages (asks first), build, install into `~/.local`
