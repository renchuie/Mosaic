// Courses: the hub everything else points at. Synced collections "courses" and
// "assessments". Other records (events, tasks, lab folders, plan blocks) refer to a
// course by its NAME, so renaming a course rewrites those references.
import { courseGrade, DEFAULT_SCALE, type Assessment, type Grading } from "../grades";
import type { CalEvent, Task } from "../calendar";
import type { Plan } from "../plan";
import { del, entries, get, newId, put, seed } from "./synced.svelte";

export type Course = {
  name: string;
  code?: string;
  color: string;
  icon: string;
  term: string;
  credits?: number;
  instructor?: string;
  email?: string;
  office?: string;
  location?: string;
  grading: Grading;
  /** special module: the Top 200/300 drug quiz tracker */
  tracker?: "drugs";
  /** how many drugs the list has (Top 300 = 300) */
  drugTotal?: number;
  /** free-form notes pad on the course page */
  notes?: string;
  order: number;
  archived?: boolean;
};

export const TERM = "Fall 2026";
const blank = (target = 90): Grading => ({ mode: "category", categories: [], target, scale: DEFAULT_SCALE });

/** Fall 2026, as she listed them. Grading is filled in from each syllabus in the app. */
const SEED: [string, Omit<Course, "order">][] = [
  ["ther4", { name: "Therapeutics IV", code: "Ther IV", color: "#F2B8B5", icon: "pill", term: TERM, grading: blank() }],
  ["law", { name: "Pharmacy Law", code: "Law", color: "#B9D4EE", icon: "book", term: TERM, grading: blank() }],
  ["pgx", { name: "Clinical Pharmacogenetics", code: "PGx", color: "#CDB4F7", icon: "labs", term: TERM, grading: blank() }],
  ["app", { name: "Advanced Pharmacy Practice", code: "APP", color: "#F6CFA8", icon: "users", term: TERM, grading: blank() }],
  ["capps", { name: "Clinical Applications", code: "CApps", color: "#A9CDC3", icon: "heart", term: TERM, grading: blank() }],
  [
    "top200",
    {
      name: "Top 200/300 drugs", code: "Top 300", color: "#F7E3B0", icon: "flag", term: TERM, tracker: "drugs", drugTotal: 300,
      grading: { mode: "category", categories: [{ id: "quizzes", name: "Quizzes", weight: 100 }], target: 90, scale: DEFAULT_SCALE },
    },
  ],
];

export function initCourses() {
  SEED.forEach(([id, c], i) => seed("courses", id, { ...c, order: i }));
}

export const courses = (all = false) =>
  entries<Course>("courses")
    .filter(([, c]) => all || !c.archived)
    .sort((a, b) => a[1].order - b[1].order || a[1].name.localeCompare(b[1].name));
export const getCourse = (id: string) => get<Course>("courses", id);
/** Names for every course picker in the app. */
export const courseNames = () => courses().map(([, c]) => c.name);
export const courseByName = (name?: string) => (name ? courses(true).find(([, c]) => c.name === name) : undefined);

export function saveCourse(id: string | null, c: Course): string {
  const key = id ?? `course-${newId()}`;
  const before = id ? getCourse(id) : undefined;
  put("courses", key, c);
  if (before && before.name !== c.name) renameRefs(before.name, c.name);
  return key;
}

/** Point everything that used the old name at the new one. */
function renameRefs(from: string, to: string) {
  for (const [id, e] of entries<CalEvent>("events")) if (e.course === from) put("events", id, { ...e, course: to });
  for (const [id, t] of entries<Task>("tasks")) if (t.course === from) put("tasks", id, { ...t, course: to });
  for (const [rel, m] of entries<{ course?: string }>("folders")) if (m.course === from) put("folders", rel, { ...m, course: to });
  for (const [d, p] of entries<Plan>("plans"))
    if (p.blocks.some((b) => b.course === from)) put("plans", d, { ...p, blocks: p.blocks.map((b) => (b.course === from ? { ...b, course: to } : b)) });
}

export function deleteCourse(id: string) {
  for (const [aid, a] of entries<Assessment>("assessments")) if (a.courseId === id) del("assessments", aid);
  del("courses", id);
}

// ---- assessments -----------------------------------------------------------------

export const assessments = (courseId: string) =>
  entries<Assessment>("assessments")
    .filter(([, a]) => a.courseId === courseId)
    .sort((a, b) => (a[1].date ?? "9999").localeCompare(b[1].date ?? "9999") || a[1].created - b[1].created);

export function saveAssessment(id: string | null, a: Assessment): string {
  const key = id ?? newId();
  put("assessments", key, a);
  return key;
}
export const deleteAssessment = (id: string) => del("assessments", id);
export const getAssessment = (id: string) => get<Assessment>("assessments", id);

export const gradeOf = (id: string, whatIf?: Record<string, number>) => {
  const c = getCourse(id);
  return c ? courseGrade(c.grading, assessments(id), whatIf) : null;
};
