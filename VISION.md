# Mosaic: vision

**Mosaic: your student life in full view.** (Renamed from Study Desk on Nov 16.)

Written from Jazmine's own answers (Nov 16, 2026). This is the "why" behind every plan; when a
design or feature choice is unclear, check it against this file.

## In one line

A pretty, fast, local app that is **already set up** to run her life as a health science student,
with a homepage and pages she can design herself, and a personal side for the rest of life.

## What "this app gets me" means

Pretty **and** practical. Notion and xTiles can look beautiful, but making them useful takes
hours of setup and they still don't make her productive. Mosaic should be useful on day one
and pretty on day one, and customisation is a bonus, never a requirement.

## Principles (in priority order)

1. **Works out of the box.** The student tools come built in: planner, tasks, assignment
   tracker, gradebook, exam planner, flashcards, notes, PDFs. No setup and no scary templates
   before it is useful.
2. **Everything is connected.** A date anywhere (exam, assignment, class, task) shows up in the
   planner; notes, cards, PDFs, labs and grades link to their course and to each other. Things
   that don't connect are a reason she drops an app.
3. **Fast and light.** Slowness is the other reason she drops apps. Every feature has to stay
   quick on her Arch machines, including big Drive folders and PDFs.
4. **Customisable, Arch-style.** A homepage she designs herself, with widgets and her own
   modules, pages she builds, themes. Customising is part of what makes her want to work.
   Defaults are great, so customising is for fun, not to make the app usable.
5. **Clean, modern, cosy.** Calm, pretty, roomy, with personality.
6. **Studying is rich and free.** As good as Anki (with FSRS), image occlusion and the rest built
   in. Nothing locked behind a paywall.
7. **Your files stay yours.** Local files on her Drive mount, readable outside the app.

## First audience

Health science students, starting with pharmacy: drug cards (Top 300), calculations, lab values,
cases, recall labs, exam-heavy courses.

## Two sides

- **School** (built first): Study (with Courses merged in), Planner (calendar + tasks merged),
  gradebook, exams.
- **Personal** (later): dashboards for habits, journaling, health, hobbies, reading, tracking,
  and self-learning curriculums. These are popular on Notion but overwhelming to set up there, so
  here they come ready to use (one click), not as templates to fill in.
- The two sides respect each other: tasks and the planner can hold both school and personal
  life, and school never takes over personal pages.

## What she takes from each inspiration

| App | Keep | Leave behind |
|---|---|---|
| RemNote | Making flashcards straight from notes; the most practical student app she's used | Weaker flashcards than Anki; image occlusion and more behind a paywall |
| Anki | Strong scheduling, image occlusion, add-ons | Old-fashioned look, plugins needed for basics |
| xTiles | Free-form tiles, visual layouts | So much work to get the most out of it |
| Notion | Pages, databases, covers, icons; notes that are easy to look at and use | Overwhelming setup; pretty but not productive |
| Obsidian | Local files, backlinks, mind maps / graph | Raw Markdown feels overwhelming |
| Google Docs (her notes today) | Simple, pretty, tables | Docs don't connect to other notes; no tags or properties |

## What this means for the notes editor

**Decision (Nov 16):** notes stay **Markdown files** (transferable outside Mosaic), but inside
the app there is **no Markdown feel at all**: a Notion-style block editor (no symbols even on
the line being typed, block handles, + button, selection toolbar, slash menu), RemNote-style
cards and cloze inline, Obsidian-style [[links]] and linked references. The live-preview editor
(N1) was a step there; she found it still too Obsidian / Markdown. Mockup first, then build.

She wants notes that feel like Google Docs / Notion (simple, pretty, tables, no visible syntax)
but connect like Obsidian (links, backlinks, tags, properties, mind map), stored as local files.

## Decisions (Nov 16)

- **Just for her.** Mosaic is for her own use, not a product for other students. Goal: usable
  every day before spring semester starts (v1.0 on Dec 31, as in `ROADMAP.md`).
- **No notes import.** She won't bring her Google Docs in as notes; she puts PDFs into folders
  and builds her knowledge base from there.
- **Dates entered by hand.** Exams and assignments come from syllabi and Canvas, and she prefers
  to enter them herself: no Canvas feed, no syllabus parsing. Make manual entry fast instead.
- **Homepage layout:** free placement (xTiles style) **and** an optional neat grid to snap to.
- **Home** stays customisable and is where school and personal life mix. Only some widgets are
  offered on Home; the full school tools stay inside Study.
- **Recall Labs become one kind of "Material"** (Study → **Materials**, named Nov 16): the place for study material she
  generates with AI (Claude, NotebookLM). She wants to **upload** a recall lab's HTML file into
  the app (not only point at a folder), and a **quiz engine** fed by quiz files generated by
  Claude or NotebookLM. Goal: everything she creates, in one place.
- Materials she makes: **recall labs, quizzes, summaries, mind maps, slide decks, patient
  cases** (no audio). She also wants a **mind map area**. All of these come from Claude /
  NotebookLM through a **standard Mosaic format + ready-made prompts**, so the app can read
  whatever she generates.
- **Uploaded material files are read-only to Mosaic**: it shows them and never changes the file.
  Her progress (quiz answers, scores, missed questions, case write-ups) is stored separately in
  the synced store, keyed by the file and a fingerprint of each question.
- **Patient cases come in two layouts: SOAP and a full patient chart.** The questions after a case
  depend on its topic, so the prompts carry standard question sets per topic.
- **Materials folder is the home for everything she generates**, existing recall labs included
  (they move into it). Labs can be uploaded (copied into Materials, sorted by course/exam;
  same progress key = "Replace, keep my progress").
- **Quiz engine question types**, first version: multiple choice, SATA (**all-or-nothing**
  scoring), true/false, fill in the blank (alternatives + spelling tolerance), drop-downs in a
  sentence, sorting, matching, categorise, grid, calculation (units + tolerance), cases. **Hot spot
  and highlight wait.** Modes: practice, exam (timer, flags, review), missed only, weak topics.
- **No rush on Materials**: build it properly, however long it takes.
- Mosaic itself still has **no AI features**: it doesn't call any AI. It is built to take in
  what she makes with AI elsewhere.

## Why she dropped every other app

Each one was always missing something she couldn't add with plugins or its own features. Mosaic
can grow with her because she shapes it.
