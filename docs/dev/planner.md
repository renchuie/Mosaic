# Calendar, tasks, board, study plan

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

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
- Only the four built-in tags are seeded (u=1, so any edit wins). The two exam events seeded
  before Nov 19 stay in her synced store; new installs get none (see "Generic defaults").
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
