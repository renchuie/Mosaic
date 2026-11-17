# Mosaic roadmap: to a usable v1.0 by December 31, 2026

v1.0 is still just for her: usable every day before spring semester starts. Sharing with
friends (on Windows) comes after, during the spring semester (see "Sharing with friends" below). The bigger
vision in `VISION.md` (custom homepage, databases, notes editor without Markdown symbols,
personal side) is planned after v1.0 unless a piece fits a week below.

One focus per week. Bugs found during a week go into the "Found this week" list. If they block
daily use they get fixed straight away; otherwise they wait for the week they belong to. Nothing new gets
started outside that week's focus.

**"Usable" means:** installed the same way on the PC and the laptop, used every day for real
classes, data safe, with a backup she can restore, and set up for the spring semester before it starts.

Weeks are planned around the exams already on the calendar: Ther IV Exam 4 on Tue Nov 17 and
Exam 5 on Fri Dec 4. Exam weeks get a light focus. Finals dates aren't in the app yet; when they
are known, swap the week 4 and 5 focuses if needed.

| Week | Dates | Focus | Load |
|---|---|---|---|
| 1 | Nov 16 – 22 | Move in: real data on both computers | Light (Exam 4) |
| 2 | Nov 23 – 29 | Trust: backup, restore, sync you can see | Build week (Thanksgiving) |
| 3 | Nov 30 – Dec 6 | Study for real: cards, PDFs, notes + Ctrl+K search | Light (Exam 5) |
| 4 | Dec 7 – 13 | Calendar and tasks polish | Medium (finals?) |
| 5 | Dec 14 – 20 | Courses hub and the spring term | Build week |
| 6 | Dec 21 – 27 | Look and feel: dark mode, dashboard, consistency | Build week |
| 7 | Dec 28 – 31 | v1.0: freeze, fresh installs, release | Short |

---

## Week 1 · Nov 16 – 22 · Move in

Goal: the app holds her real semester on both machines. This week is mostly using it, with very
little new building.

- Install on the PC and the laptop (`./install.sh`), check the NVIDIA launcher works on the laptop.
- Point Settings at the real folders: Recall Labs, Notes, PDFs, Sync. Check both machines see
  each other in sync status.
- Enter grading for each course from the syllabus. Enter the class schedule as repeating events.
- Open real lecture PDFs, real labs, write one real class note.
- Keep a list of everything slow, confusing or broken (below).

Done when: a normal school day can be run from the app on either computer.

## Week 2 · Nov 23 – 29 · Trust

Goal: she never worries about losing data. (This was Phase 6's backup part.)

- Export everything to one JSON backup file, and import it again (with a preview of what changes).
- Automatic backups: a dated copy each day, last 14 kept, in a folder she picks.
- A clear sync status: last synced, which machines, what to do when Drive isn't mounted.
- Friendly states everywhere when the Drive folder is missing (labs, notes, PDFs, sync).
- Check the big Drive scans (PDF folder, labs) stay fast. Add a "folders to skip" setting if not.

Done when: deleting `~/.local/share/studydesk` and restoring a backup brings everything back.

## Week 3 · Nov 30 – Dec 6 · Study for real

Goal: studying for Exam 5 happens in the app. Fix whatever gets in the way while using it.

- Ctrl+K search across notes, cards, PDFs (names and highlights), tasks, events and courses (S6, part 1).
- Friction fixes from real review sessions, PDF reading and note taking.
- Link a deck to one exam (exam-aware scheduling is course-level today).

Done when: one full Exam 5 study day (plan, review, PDFs, labs) runs without leaving the app.

## Week 4 · Dec 7 – 13 · Calendar and tasks

Goal: the planner side feels finished.

- Edit or move a single occurrence of a repeating class (still open from Phase 3).
- Finals: exam events, the countdown and the study plan all point at them.
- Quick add everywhere it's missing. Keyboard shortcuts on the calendar and tasks.
- Friction fixes from weeks 1–3 that belong to calendar, tasks and study plan.

Done when: finals week is planned in the app and nothing about it needs a workaround.

## Week 5 · Dec 14 – 20 · Courses hub and spring term

Goal: the course page is the home base for every class, and spring is ready.

- New course modules (pick from what she wants most): syllabus and files, class schedule on the
  course page, group project, grade history over the term.
- Term change: archive Fall 2026, add Spring 2027 courses, carry over cards and notes.
- Term GPA and final fall grades.

Done when: spring courses are set up with their schedules before break ends.

## Week 6 · Dec 21 – 27 · Look and feel

Goal: it looks and feels like one app.

- Dark mode (tokens are ready for it: one extra block of variables).
- Dashboard tidy-up: decide which cards stay, their order, and what she looks at first.
- Consistency pass: buttons, dialogs, empty states, loading states, narrow tiled windows.
- PDF page editing is now phase P1 of the Study track.

Done when: a walk through every page finds no screen that looks unfinished.

## Week 7 · Dec 28 – 31 · v1.0

- Feature freeze: only fixes.
- Fresh install on both machines from a clean checkout, restore from backup, check sync.
- Update CLAUDE.md and this file, tag `v1.0`.

Done when: she uses v1.0 on the first day of spring classes without thinking about it.

---

## Study track: Materials, quiz engine, notes, flashcards, PDFs (no deadline)

One build order across five areas. Each phase is usable on its own and is finished properly before
the next starts. Placement in the weeks above is a proposal (see "Proposed placement" below).

| # | Phase | Area |
|---|---|---|
| 1 | M1 · Materials home + lab integrator (DONE Nov 16) | Materials |
| 2 | M2 · Quiz format + quiz engine core (DONE Nov 16) | Quiz engine |
| 3 | N1 · Notes editor that feels like Docs / Notion (DONE Nov 16) | Notes |
| 3b | N1b · Mosaic note page: block editor without Markdown (Tiptap, files stay .md), cover, icon, tag chips, side panel, tucked panels (icon strips + sliding sheets, focus edges, pins), arrow cards, linked references (DONE Nov 16) | Notes |
| 3c | N1c · Note + paired PDF side by side (paired by hand through a "Paired with" property) | Notes / PDFs |
| 4 | F1 · Flashcards on par with Anki | Flashcards |
| 5 | P1 · PDF page editing + find | PDFs |
| 6 | M3 · Full quiz engine | Quiz engine |
| 7 | N2 · Connected notes | Notes |
| 8 | M4 · Cases and other materials | Materials |
| 9 | F2 · Smarter flashcards | Flashcards |
| 10 | P2 · PDF reading comfort | PDFs |
| 11 | M5 · Prompt kit | Materials |

- **M1 · Materials home + lab integrator.** Study → Materials replaces Recall Labs. Materials
  folder setting (default `Study Lab/Materials`); one-time "move my labs into Materials" that
  keeps progress and folder links (links are keyed by path, so they must be moved with the files).
  Upload / drop HTML labs → checked, copied into `Materials/<course>/<exam>/`, replace keeps
  progress. Browse by course, exam and type.
- **M2 · Mosaic format v1 + quiz engine core.** Written spec of the format (header `mosaic: quiz`,
  versioned). Parser, node-tested. Import by drop or paste with a check ("12 questions found",
  errors point to the line). Types: multiple choice, SATA (all-or-nothing), true/false, fill in
  the blank, drop-downs, calculation. Practice mode. Answers stored in the synced store by file +
  question fingerprint; the file itself is never changed.
- **N1 · Notes editor that feels like Docs / Notion.** No visible Markdown: formatting shows as
  formatting and the symbols only appear on the line being edited (Obsidian "live preview"
  style); files stay Markdown on Drive. Toolbar and `/` menu (heading, table, callout, checklist,
  card, divider, image). Real tables (add rows / columns, Tab between cells). Callouts, text
  colours and highlights. Properties (course, tags, date) as chips. Pasting from Google Docs keeps
  headings, lists, bold and tables.
- **F1 · Flashcards on par with Anki.** Card browser: every card in one table with search and
  filters (course, deck, tag, new / learning / due / suspended), edit in place, bulk suspend /
  reschedule / delete. Anki `.apkg` import (notes, images, and review history if she wants it).
  Deck options (new cards and review limits per deck). Leech detection, sibling burying. A stats
  page (reviews per day, retention, intervals, forecast).
- **P1 · PDF page editing + find.** Page thumbnails sidebar; rotate, delete, reorder by dragging,
  insert a blank page, extract pages to a new PDF, merge PDFs (pdf-lib; the original is backed up
  first, as with annotations). Find in PDF (Ctrl+F) with hits highlighted. Free-text notes on the
  page; adjust a highlight's ends after making it.
- **M3 · The rest of the quiz engine.** Sorting, matching, categorise, grid. Exam mode (timer,
  flags, review screen), missed only, weak topics, shuffle. Results by topic; missed question →
  flashcard; quiz + lab results feed Weak spots and exam readiness.
- **N2 · Connected notes.** Mind map area (any note's outline as a mind map, plus standalone mind
  maps), graph view of links, Notes home with folder tiles, covers and icons on notes, embeds (a
  PDF page or highlight, a card, a material) and "unlinked mentions".
- **M4 · Cases and other materials.** Patient cases (full chart and SOAP layouts, write-up
  questions with model answer + checklist), summaries, mind maps from Claude, slide decks.
- **F2 · Smarter flashcards.** FSRS parameters tuned to her own review history; image occlusion
  upgrades (shapes, grouped masks, labels); custom study sessions (Anki's "custom study"); cards
  from a mind map branch.
- **P2 · PDF reading comfort.** Two-page and continuous modes, a dark reading mode, and PDF text
  and highlights in Ctrl+K search.
- **M5 · Prompt kit.** Copy-ready prompts for Claude / NotebookLM per material type and per case
  topic (planned later, at her request).
- **Later:** hot spot and highlight questions.

### Proposed placement (to confirm with her)

- Week 3 (Exam 5): **M1**, so her labs are in Materials while she studies.
- Week 4: **M2**. The calendar and tasks polish moves to January, together with the Planner merge.
- Week 5: **N1**, plus only the term change from the courses week (archive fall, add spring).
- Week 6: look and feel as planned (rail, glass, folder tiles, icon already done).
- January, before and around the start of spring: **F1, P1, M3**, the Planner merge, Courses
  into Study. Then N2, M4, F2, P2, M5 during spring.

## Later (after v1.0, not before)

- More course modules from the week 5 list.
- Statistics: study time per course, card retention over the term.

## Sharing with friends (spring semester 2027, after Study and the Planner are fully fleshed out)

Decided Nov 17: her friends use Windows, and she wants the Study tab and the Planner (Tasks +
Calendar) complete before anyone else uses it. In this order:

1. **First-run setup, no personal data built in.** A welcome flow asks name, notes / PDF /
   materials folders and courses; nothing of hers is seeded (her Fall 2026 courses, Ther IV exam
   dates and Drive layout become her own data, not defaults). Features shaped around her habits
   (Recall Labs) are optional.
2. **Windows builds.** GitHub Actions builds a Windows installer (Tauri bundler, `.msi` / `.exe`)
   on a Windows runner and runs the automated checks there. Replace Linux-only bits: `xdg-open`
   → Tauri's opener, folder defaults, Windows paths (Google Drive for desktop is e.g.
   `G:\My Drive`). The NVIDIA launcher flag and Hyprland rules stay Linux-only. Windows uses
   WebView2 (Edge's engine).
3. **Auto-updates** through Tauri's updater and GitHub Releases, so friends never pull code.
4. **A friend tests on Windows** before it is shared widely. Unsigned at first (friends click
   "More info → Run anyway"); a code-signing certificate is a later, paid decision.

Also before sharing: the performance pass and a "Battery saver" switch (solid panels instead of
blur, fewer animations, slower background sync; on automatically when the laptop is unplugged).

## Found this week

Add things here as they come up (date, page, what happened). Each one is either fixed now
(blocks daily use) or tagged with the week it belongs to.

- Nov 16 · Study tab look: rework planned from mockups (design canvas "Study tab redesign"):
  card-dashboard Study Home, Exam prep hub, extra widgets to pick from. **Week 6** (or the
  Exam prep hub in week 3).
- Nov 16 · Sidebar: she picked option A, the **floating rail** (white pill rail, dark rounded
  square for the active page, + for Quick add, overdue dot on Tasks, streak as a flame badge,
  settings and avatar at the bottom; page names on hover). Replaces the labelled sidebar and
  the streak panel. **Week 6.**
- Nov 16 · New look being tried: **Frosted glass** (soft pastel colour blooms behind translucent,
  blurred cards with a thin bright edge) and **roomier spacing** (bigger gaps and padding than now,
  28px corners; she said "cozy" but meant more room). Both are tweaks on the canvas next to the
  current pastel look; decide before week 6.
- Nov 16 · Notes as **folder tiles** (tab on top, frosted body; the open/last-used folder takes
  its course colour and recent notes peek out as paper sheets). Notes home gets a folder grid
  (one per course, plus PDF notes and Inbox); Study Home's Recent notes card becomes 4 folders.
  **Week 6.** Same folder style for the PDFs page.
- Nov 16 · Structure (likely): Courses merge into Study (one school space); Tasks + Calendar
  merge into a Planner tab. The app will later get a personal-life side next to the student side.
  Decide the structure before week 5 (courses) and week 4 (planner).
- Nov 16 · **Look pulled forward at her request (built):** frosted glass (default) + pastel theme
  switch, roomier spacing with a density switch, floating rail, folder tiles on Notes / PDFs /
  Study Home, the Study Home card dashboard, lively spring animations. Week 6 still has dark mode,
  the consistency pass, the exam prep hub and the widget gallery.
- Nov 17 · **15 themes built at her request** (mocked up first on the canvas): Glass (Mosaic, Pink,
  Green, Blue, Purple), Neutral (Linen, Stone, Oat, Plain, Default), Dark (Catppuccin, Tokyo
  Night, Rosé Pine, Gruvbox, Everforest). Pastel retired. (Dark mode was planned for week 6.)
- Nov 16 · **N1b built at her request** (new note page, tucked panels). Testing it is part of
  daily use now; anything odd goes here.
- Nov 16 · **Note page test list (her first testing round).** Fix now: cloze placeholder loses its
  cloze when retyped; coloured highlights look wrong after the Markdown view. Polish now: card line
  padding and a gap between card lines, centred arrows, list flashcards in the `/` menu, selection
  toolbar waits for mouse-up, softer selection, cursor below a pasted image, course chip dropdown,
  floating toolbar at the bottom while typing in a long note. Wishes started now: card look
  settings (card background on/off, arrow and cloze colours), "hide clozes together" per line,
  image resize, images under bullets, table rows above / columns left, highlight shortcuts.
  All built Nov 16: the block style manager for callouts + quotes, highlight colours + palettes,
  and table upgrades (column widths, lists inside cells, cell colours).
- Nov 16 · Renamed to **Mosaic** ("your student life in full view") and gave it the **glass
  tiles** app icon (option C). Done now, since both were small.
- Nov 17 · Note page felt "weird and small" with all the boxes. Mockups on the canvas ("Roomier
  note page": one sheet, compact header, page width, writing mode); she loved all four, so all
  four were built now (the note page is daily use).
- Nov 17 · She asked to split a note into columns; picked Notion-style **column blocks** over a
  whole-note newspaper layout. Built now (`/2 columns`, drag beside, resize), files stay Markdown.
- Nov 17 · She'll share Mosaic with friends next semester; they're all on Windows. Planned as its
  own track ("Sharing with friends"), after the Study tab and the Planner are complete. Also
  wants it fast and light on laptops: performance pass + Battery saver switch, logged there too.
- Nov 18 · Real note-taking round (Bipolar notes): ⠿ menu in the wrong place for column blocks,
  selection toolbar cut off at the edge, flashcard bullets out of line, table "no colour" not
  clearing a mixed selection, selected coloured cells invisible, table widths confusing (now
  Google Docs style with Even out), and a new "side by side" layout for Full width. All done now.
- Nov 18 · Editor todo list (she said yes to all; editor fixes count as daily use since she's
  writing real Ther IV notes in it):
  1. Tables shake-down: she tests (lists / cards in cells, tables in columns and halves, pasting
     from Docs, undo after resize / Even out, wide tables, `:: table` after moving cells).
  2. Concept and descriptor cards (RemNote style). **Done Nov 18** (option A: bold term + :::).
  3. Reverse card ← (`A <:: Q`). **Done Nov 18.**
  4. Images in the editor: test pass (paste, resize, under bullets, columns, halves, cells, drag).
     **Done Nov 18** (an image pasted in a table cell now goes inline instead of breaking the table).
  5. Fold headings (collapse everything under a heading). **Done Nov 18.**
  6. Card status in the note (dot per card line, hover = next due). **Done Nov 18.**
  7. Ctrl+K search everywhere (week 3 already).
  8. Paste check into columns / halves / tables. **Done Nov 18** (blocks pasted into a cell become
     lines in that cell instead of splitting the table; columns pasted in a column open up).
  9. Print / export a note to PDF, keeping columns and side by side. **Done Nov 18** (⋯ → Print or
     save as PDF; the system print dialog's "Print to File" makes the PDF).
  10. Collapsible callouts (`> [!note]-`). **Done Nov 18.**
  11. Table flashcards fleshed out (her ask). **Done Nov 18** (▾ Flashcards menu: each cell / each
      row / cloze rows, → ⇄ ←, skip columns, key column).
  12. Big, pretty review cards (her ask, canvas "Flashcards in review"). **Done Nov 18.**
  13. Notes tab picks up the last open note at the same scroll spot (her ask). **Done Nov 18.**
