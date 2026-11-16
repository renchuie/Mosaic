# Study Desk roadmap: to a usable v1.0 by December 31, 2026

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
- PDF page editing (rotate, delete, reorder, merge) if time allows. Otherwise it moves to 2027.

Done when: a walk through every page finds no screen that looks unfinished.

## Week 7 · Dec 28 – 31 · v1.0

- Feature freeze: only fixes.
- Fresh install on both machines from a clean checkout, restore from backup, check sync.
- Update CLAUDE.md and this file, tag `v1.0`.

Done when: she uses v1.0 on the first day of spring classes without thinking about it.

---

## Later (after v1.0, not before)

- PDF page editing, if it didn't fit in week 6.
- More course modules from the week 5 list.
- Statistics: study time per course, card retention over the term.

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
  28px corners; she said "cozy" but meant more room).
- Nov 16 · Notes as **folder tiles** (tab on top, frosted body; the open/last-used folder takes
  its course colour and recent notes peek out as paper sheets). Notes home gets a folder grid
  (one per course, plus PDF notes and Inbox); Study Home's Recent notes card becomes 4 folders.
  **Week 6.** Both are tweaks on the canvas next to the current pastel look; decide before week 6.
