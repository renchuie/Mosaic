// What the rest of the app knows about a course: what's coming up, its Recall Lab
// folders and study time. Kept apart from the courses store to avoid import loops.
import { addDays, taskOccurrences, todayKey } from "../calendar";
import { studiedMinutes, type Plan } from "../plan";
import { exams, occ } from "./calendar.svelte";
import { inherited, labs, labsIn, findFolder, type Folder } from "./labs.svelte";
import { entries } from "./synced.svelte";
import { tasks } from "./tasks.svelte";

export function upcomingFor(name: string, days = 21) {
  const today = todayKey();
  const end = addDays(today, days);
  const events = occ(today, end).filter((o) => o.ev.course === name);
  const due = taskOccurrences(tasks().filter(([, t]) => t.course === name), addDays(today, -14), end).filter((o) => !o.done);
  const ex = exams().filter((e) => e.course === name && e.days >= 0);
  return { events, due, exams: ex };
}

/** Lab folders linked to the course (directly or through a parent), topmost only. */
export function foldersFor(name: string): Folder[] {
  const out: Folder[] = [];
  const walk = (f: Folder) => {
    if (f.rel && inherited(f.rel, "course") === name) {
      out.push(f);
      return;
    }
    f.folders.forEach(walk);
  };
  if (labs.tree) walk(labs.tree);
  return out;
}
export const labsFor = (name: string) => foldersFor(name).flatMap((f) => labsIn(findFolder(f.rel)));

/** Minutes studied for the course: plan blocks tagged with it (this week and all time). */
export function studyFor(name: string) {
  const today = todayKey();
  const monday = addDays(today, -((new Date().getDay() + 6) % 7));
  let week = 0;
  let total = 0;
  for (const [d, p] of entries<Plan>("plans")) {
    const m = studiedMinutes({ blocks: p.blocks.filter((b) => b.course === name) });
    total += m;
    if (d >= monday && d <= today) week += m;
  }
  return { week, total };
}
