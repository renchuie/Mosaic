# Materials, quizzes and recall labs

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

## Materials (M1, built): the labs folder's new name, plus uploads

- Study → **Materials** replaces Recall Labs (tab, page titles, Settings "Materials folder"). It is
  the same scanned folder (`settings.labsRoot`, routes `#/labs/...`); new default
  `~/GoogleDrive/Pharmacy School/Study Lab/Materials`.
- Moving in (`resolveRoot` / `adoptMaterials` in the labs store, Rust `src-tauri/src/materials.rs`):
  if the folder in use is named "Recall Labs" (or the Materials default is missing but a sibling
  "Recall Labs" exists, which is then used for the session), the Materials page shows "Move your
  labs into Materials?". `materials_adopt` renames the folder (or moves its entries into an
  existing Materials, skipping name clashes) and writes `.mosaic-materials`. Paths inside stay
  the same, so progress (keyed by slug) and folder links / exam dates (keyed by relative path)
  carry over. Another computer whose settings still say "Recall Labs" sees the marker in the
  sibling Materials folder and switches by itself (tested with a second HOME).
- Upload (`UploadDialog.svelte`): Upload button on every Materials folder, or drop files anywhere
  on Materials (window `dragDropEnabled: false` in tauri.conf so the webview gets real HTML5 file
  drops). Each .html is read and checked (`src/lib/materials.ts`, pure, node-tested; mirrors the
  Rust lab detection): title, version, slug. Course + "exam or topic folder" choose the place:
  `Materials/<course folder>/<exam>/<file>` where the course folder is the top folder already
  linked to that course, else the course code; a new course folder gets linked to its course.
  Same slug already present → "Replace it, keep my progress" (overwrites that file in place) or
  "Add a second copy". Non-lab HTML is skipped unless ticked. `materials_write` only writes
  html/htm/md/txt/json inside the folder and refuses to overwrite without `replace`.
- Materials home: chips to browse one course's labs across its exam folders.
- Self-test: `STUDYDESK_ROUTE=selftest-materials` (move, marker, upload, refuse overwrite).

## Quiz engine core (M2, built)

- Format: `docs/mosaic-format.md` (v1). Markdown with front matter `mosaic: quiz`, questions start
  `## Q<n> · <type> · <topic>`; types single, sata (all-or-nothing), tf, blank (`{{a|alt}}`),
  dropdown (`{{*right|wrong}}`), calc (`Answer: 50 mL/min ± 2`, default ± 1%); `>` lines are the
  explanation. Parser and grading in `src/lib/quiz.ts` (pure, node-tested): problems with line
  numbers (bad questions are skipped, not fatal), typo tolerance for blanks, question id =
  fingerprint of type + stem. `QUIZ_GUIDE` there is the copy-ready text for Claude.
  `src/lib/md.ts` renders material Markdown (tables, lists, images, inline styles).
- Scanner (`labs.rs`): `.md` files whose front matter has `mosaic: <kind>` become items of kind
  `material` with `mat {kind, title, id, course, exam, count}`; the scan cache entry has `v2` so
  old caches re-inspect `.md` files once.
- Player (`src/routes/labs/QuizPlayer.svelte`, route `#/labs/<rel>` of a quiz file): start screen
  (topics, best / last / attempts / to redo, shuffle questions + options, Practice all, Redo
  missed, list of unreadable parts), one question at a time with Check → feedback (right answer,
  explanation; card turns sage or shakes rose) → Next, keys 1–9 / A–I / T / F / Enter, results
  ring with by-topic bars and a to-review list. Progress: synced collection `quizzes` keyed by quiz
  id (`src/lib/stores/quizzes.svelte.ts`): per question seen / right / last / lastRight, last 30
  attempts. Best counts full practice runs only. Finishing marks a study day.
- Getting quizzes in: Materials → Paste quiz (`PasteQuiz.svelte`: strips ``` fences, live check,
  Copy format for Claude) hands a .md file to the upload dialog; uploading or dropping .md works
  too. The dialog files a quiz under its `course` / `exam` from the header when the course
  exists, and offers "Replace, keep my progress" when a quiz with the same id is already there.
- Folder pages show a Quizzes section (best, last, attempts, to redo); Materials home counts
  quizzes.

## Recall Labs (Phase 2, built; now inside Materials)

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
