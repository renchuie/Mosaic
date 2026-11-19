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
