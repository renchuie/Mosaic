# Project history and early decisions

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

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
