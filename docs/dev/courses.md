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
- Next (H1b): link from the item itself (note header, PDF viewer, Materials, deck options), the
  Files tab with kind filters (board frame 3), drop files on a lecture (frame 5); later the
  one-folder move (frame 6).
