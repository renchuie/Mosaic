# Courses and grades

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

## Phase 5: courses as the hub (built; she plans to keep adding to it)

The app's purpose is an all-in-one uni home base, and the course is what ties things together.

- Courses (synced collection `courses`, store `src/lib/stores/courses.svelte.ts`): name, short name,
  colour, icon, term, credits, instructor, email, office hours, room, grading, notes pad, optional
  drug-quiz tracker, archived. Nothing is seeded since Nov 19 (her six Fall 2026 courses, seeded
  before, stay in her synced store); new courses get `currentTerm()` as their term. `courseNames()` feeds every course picker.
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

## Course hub H1 (Nov 20): exams → lectures → linked things

Her pick after the board "One Mosaic folder, with the course as the hub" (B + C) and the question
"links or folders": **links first**, files stay where they are (the one-folder move comes later).
- Store `src/lib/stores/outline.svelte.ts`: synced collection `lectures` {course (name), exam (key
  from `exams()`: "<event id>@<date>" or "folder:<rel>", "" = none), title, date?, order, links:
  {kind: note | pdf | file | deck, ref}} (`file` = a Materials rel: quiz, interactive page, any
  file). `addLecture`, `saveLecture`, `deleteLecture` (files untouched), `addLinks`, `removeLink`,
  `lecturesWith(link)`. Notes moved / renamed / trashed are followed (`relinkNotes`, called from
  noteOps `followMove`); a renamed course carries its lectures (`renameLectureCourse` in
  `renameRefs`).
- `src/lib/stores/linkInfo.svelte.ts`: `describe(link)` → kind (note / pdf / quiz / page / file /
  deck), name, short progress (note: N due / N cards; PDF: p. X of Y + bar; quiz: best %; page:
  avg best %), href, course, `gone` when the file isn't found; `candidates()` for the picker;
  `noteCardStats()` counts cards per note in one pass. Icons `KIND_ICONS` (quiz `i:circle-help`,
  page `i:app-window`, both added to iconSet with `chevron-down`).
- Card scopes in srs: `lecture:<id>` (its notes' cards + its decks' cards) and
  `unit:<course>|<exam key>` (every lecture under that exam); `scopeName` names them.
- Course page main column starts with `CourseOutline.svelte`: a section per exam of the course
  (upcoming first, soonest on top, then "Other" for lectures without an exam, then past exams
  folded), "+ Lecture" (type, Enter for the next), lecture cards with a chip per linked thing,
  drag a lecture onto another exam's section to move it (pointer-based), "+ Exam" (calendar
  editor with kind exam). Side column: "Ready for <next exam>" (cards ready of total via
  `readiness()` on the unit scope, quizzes' best average, pages tried) with "Study for <exam>".
- Lecture page `LecturePage.svelte`, route `#/courses/<id>/l/<lectureId>` (Courses.svelte splits
  the route): breadcrumb, editable title, date, exam picker, Review N cards (lecture scope), Quiz
  (first linked quiz), Add, ⋯ Delete lecture; a tile per linked thing (× removes the link only).
  Picker `LinkPicker.svelte`: search, kind chips, "This course" / "Everything", multi-select,
  "Already here", shows other lectures an item is in.

## Course hub H1b (Nov 20)

- `src/lib/components/LectureMenu.svelte`: a Lecture chip / button on the item itself. Opens a menu
  (moved to `<body>`, position fixed) of the course's lectures grouped by exam, ticked when linked;
  click links / unlinks; "New lecture" makes one under the next exam and links it; with no course
  it asks for one. Placed in: the note header chips (when the note has a course), the PDF viewer
  bar, Materials interactive-page cards and quiz cards (beside the card link, `.qlec`), deck pages
  of a one-course deck.
- Study → **Files** (`src/routes/study/FilesView.svelte`, `#/study/files`, tab after Home): every
  note, PDF, quiz, interactive page, deck and Materials file (`candidates()`, newest first, `mtime`
  now in `Shown`), kind chips, search; left: All files, then course → exam → lectures and "Not in a
  lecture" per course. A row's Lecture column is a LectureMenu; dragging a row onto a lecture in
  the side list links it (pointer-based, `data-lec`, ghost + "Added to …" toast).
- Dropping files on a lecture page (window drag events; `dragDropEnabled: false` lets HTML5 drops
  through): PDFs → `addPdf` (new Rust `pdfs_add`: raw body + `x-rel`, refuses an existing file,
  makes the folder; name made unique) into `<PDF folder>/<course code>/`; plain .md / .txt →
  `importNote` into the course's notes folder, with `course:` added to the front matter if missing;
  .md with `mosaic:` front matter and .html → the Materials UploadDialog (new props `course` /
  `exam` start it on the lecture's course and exam folder), `onsaved` links what was written;
  anything else is skipped and named in the toast.
- "Recall Labs" / "labs" in the UI became **interactive pages** (her Nov 19 pick); internals
  (routes `#/labs`, `labsRoot`, `recallLab.*` keys, the `labs` store) keep their names. The
  "Move Recall Labs into Materials?" card keeps the old folder's name.
- Next: the one-folder move (frame 6) and Courses inside Study (H2).

## Materials and PDFs tabs retired (Nov 20, her ask: "all of that will just be in files")

- Study tabs are **Home · Files · Notes · Flashcards**. `#/labs` (no path) and `#/study/pdfs`
  redirect to `#/study/files?kind=page` / `?kind=pdf`; FilesView reads `?kind=` on load and when
  the route changes. Interactive pages and quizzes still open at `#/labs/<rel>`, PDFs at
  `#/study/pdfs/<rel>`, Materials folder pages (Link this folder, exam dates) at `#/labs/<folder>`;
  those keep the Files tab lit.
- Files has **Upload** (file picker: PDF, Markdown, HTML), **Paste quiz** (PasteQuiz → UploadDialog)
  and drop-anywhere; all go through `src/lib/stores/addFiles.ts` (`addFiles(list, course?)`,
  shared with lecture pages): under the selected course, linked when a lecture is selected. The
  old "Move Recall Labs into Materials?" card shows on Files while `labs.legacy` is set.
- PdfsHome.svelte and the Materials home are no longer reachable from the nav (files kept).

## Files as a file manager (Nov 20, her ask: "basic features like Obsidian and RemNote")

- Side list switch **Courses / Folders** (localStorage "mosaic.filesView"). Folders = the real
  Notes, Materials and PDFs folders as trees (`areaDirs` / `childDirs` in fileOps); a folder shows
  its subfolders first, then its files (search inside a folder searches everything below it);
  breadcrumb on top. **Starred** (synced `stars`, `toggleStar` / `starred()` in outline.svelte.ts)
  and All files sit above. Sort Changed / Name / Kind ("mosaic.filesSort").
- Row menu (right-click or ⋯): Open, Rename (F2, in place), Move to… (folder picker for that place),
  Duplicate, Star, Copy link (`[[Note]]`, PDF link, else the path), Show in file manager, Delete
  (to the folder's `.trash/` with `.from`, confirm first). Folder menu: New folder inside, New
  note here (Notes), Rename, Move to…, Show in file manager, Delete folder (says how many files).
  Ctrl / Shift click (or the icon tile) picks several: bar with Move to…, Star, Delete; Ctrl+A,
  Delete, Esc. Dragging rows onto a side folder or breadcrumb (`data-dir="<area>|<rel>"`) moves
  them (same place only), onto a lecture links them.
- `src/lib/stores/fileOps.svelte.ts`: notes go through noteOps (`doRenameNote`, `doMoveNote`,
  `doTrashNote`, `doMoveFolder`, `doRenameFolder`, `doTrashFolder`, so links / history / the open
  note follow); PDFs and Materials through Rust `src-tauri/src/files.rs` (`files_move` never
  overwrites, refuses a folder into itself, moves a PDF's `.studydesk-originals` copy along;
  `files_mkdir`, `files_copy`, `files_trash` (notes' `trash_into`), `files_reveal`; paths must stay
  inside the folder and skip hidden parts; `cargo test files`). After a change: `relinkLinks`
  (lecture links + stars), `pdfState`, Materials `folders` and `labOpens` keys follow, then
  refresh. `pdfs_list` now also returns `dirs` (folders holding a PDF below, or empty ones).
- Self-test `STUDYDESK_ROUTE=selftest-files` (new folder, move, rename, duplicate, folder rename,
  delete, Materials move + delete, path escape refused). Passed in the real app (Xvfb, throwaway
  HOME). Deleted PDFs / Materials files sit in that folder's `.trash/`; the in-app Trash lists
  notes only so far.

## Add files window (Nov 20, her ask: "uploading is tedious; ask me the name, course and lecture")

- `src/routes/study/AddFilesDialog.svelte` opens for every Upload, drop and Paste quiz on Files and
  on lecture pages (replaces the UploadDialog there; `addFiles.ts` is no longer used by them). One
  row per file: name (renamed on save), kind, course, lecture (grouped by exam, "+ New lecture…" →
  made once per course + name under the next exam), and for a quiz / interactive page already in
  Materials "Replace, keep progress" / "Add a copy". With 2+ files an "All files" bar sets course
  and lecture (and one "New lecture" name) for every row. Unsupported kinds show "Can't add this
  kind of file" and are skipped; × leaves a row out. It starts on the selected course / lecture.
- Landing places: PDFs `<PDF folder>/<course code>/<name>.pdf`; notes `<notes>/<course>/<name>.md`
  with `course:` set; quizzes and pages `Materials/<course folder>/<exam of the lecture>/<name>`
  (course folder = the top folder linked to the course, else the code). Everything added is linked
  to its lecture.

## Any file in Mosaic (Nov 20, step 1 of PowerPoint / Word support)

- Add files takes ANY file: slides, documents, spreadsheets, pictures, anything (`kind: "other"`)
  go to `Materials/<course folder>/<exam>/<name>.<ext>` through Rust `files_add` (raw body,
  headers `x-area` mat|pdf + `x-rel`; never replaces: "exists"; written via a temp file). Files'
  Upload no longer limits types.
- `fileType(name)` in linkInfo: Slides (pptx ppt key odp pps ppsx), Document (docx doc odt rtf
  pages gdoc), Spreadsheet (xlsx xls ods csv numbers), Picture (png jpg … heic svg), else the
  extension; `Shown.icon` carries its icon (presentation / file-text / grid-2x2 / image) and Files,
  lecture pages and course chips use it.
- A Materials file that isn't a page or quiz opens `src/routes/labs/FileView.svelte` at
  `#/labs/<rel>`: name, kind, size, folder, Lecture menu, Star, Show in folder, **Open** (Rust
  `files_open` → `open_path`: `cmd /C start` on Windows, `open` on macOS, `xdg-open` on Linux;
  `open_in_system` uses it too). Pictures are shown on the page (`/__labs/<rel>`).
- Next: step 2, a built-in .pptx → PDF reader (try pptx-svg / Pagus / pptxviewjs / pptx-browser on
  real decks first; SVG keeps text selectable for highlights); step 3, optional portable
  LibreOffice download (AppImage / Windows MSI admin extract) used quietly (`--headless
  --convert-to pdf`, own profile) when present; offered in onboarding, Settings → Extras, and on
  the first .pptx.

## PowerPoint → PDF built in (Nov 20, step 2; no other app needed)

- `src/lib/pptxToPdf.ts` `pptxToPdf(bytes, onProgress)` → {pdf, pages, pictures}: pptx-svg (MIT,
  WebAssembly, ~414 KB) draws each slide as SVG; svg2pdf.js + jsPDF (MIT) make each slide its OWN
  one-page PDF (a slide svg2pdf can't parse left the graphics state unbalanced and flipped the next
  page when they shared one document); pdf-lib joins them. A slide that still fails becomes a
  picture of itself (SVG → canvas at 2x → PNG page). `data:image/tiff` pictures become PNG first
  with UTIF (MIT; browsers can't draw TIFF). Hidden slides are skipped. All four libraries load
  only on conversion (own chunks). Only .pptx (not old .ppt / Keynote).
- Chosen after trying pptx-svg, pptxviewjs and pptx-browser on a made deck and her real 47-slide
  lecture (scratchpad only, never in the repo): pptx-svg drew everything; pptxviewjs jumbled
  bullets and lost a table row; pptx-browser dropped text boxes and loads fonts from Google.
  Known limits: fonts swap to look-alikes (long titles can run over a banner), table header styles
  are lost, big TIFFs make big PDFs (her deck: 21 MB .pptx → 35 MB PDF).
- Add files: a .pptx row has "Make a PDF too" (on): the deck goes to Materials, the PDF to
  `<PDF folder>/<course code>/<name>.pdf`, both linked to the lecture; the row shows "Making a PDF
  12 / 47". A .pptx's FileView has **Make a PDF** (same place; links it to the deck's lectures;
  opens it).
- Self-test `STUDYDESK_ROUTE=selftest-pptx` converts the first .pptx in Materials inside the real
  app's WebKit: her deck → 47 pages, 1 as a picture, ~11 s on Xvfb software rendering.
- Next: step 3, the optional portable LibreOffice download for exact copies.
