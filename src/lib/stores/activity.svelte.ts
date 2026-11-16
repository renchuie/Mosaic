// Activity per day for the heatmap: study minutes (plans), labs opened and
// study blocks checked off ("days"), tasks finished ("tasks").
import { addDays, todayKey, toKey, type Task } from "../calendar";
import { activityLevel, activityScore, bestStreak, studiedMinutes, type DayActivity, type Plan } from "../plan";
import { entries } from "./synced.svelte";

type DayRec = number | { labs?: number; blocks?: number };

export function activityByDay(): Map<string, DayActivity> {
  const m = new Map<string, DayActivity>();
  const at = (d: string) => {
    let a = m.get(d);
    if (!a) m.set(d, (a = { minutes: 0, labs: 0, tasks: 0, blocks: 0 }));
    return a;
  };
  for (const [d, v] of entries<DayRec>("days")) {
    const a = at(d);
    if (typeof v === "number") a.labs += 1;
    else {
      a.labs += v.labs ?? 0;
      a.blocks += v.blocks ?? 0;
    }
  }
  for (const [d, p] of entries<Plan>("plans")) {
    const min = studiedMinutes(p);
    if (min) at(d).minutes += min;
  }
  for (const [, t] of entries<Task>("tasks")) {
    if (t.repeat) for (const d of t.doneDates ?? []) at(d).tasks += 1;
    else if (t.status === "done" && t.doneAt) at(toKey(new Date(t.doneAt))).tasks += 1;
  }
  return m;
}

/** Last `weeks` weeks, Monday-first columns, ending with the current week. */
export function heatmap(weeks = 20) {
  const data = activityByDay();
  const today = todayKey();
  const d0 = new Date();
  const monday = addDays(today, -((d0.getDay() + 6) % 7));
  const first = addDays(monday, -7 * (weeks - 1));
  const cols = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(first, w * 7 + i);
      const a = data.get(date) ?? { minutes: 0, labs: 0, tasks: 0, blocks: 0 };
      return { date, future: date > today, a, level: activityLevel(activityScore(a)) };
    }),
  );
  const cells = cols.flat().filter((c) => !c.future);
  const active = cells.filter((c) => c.level > 0);
  const byWeekday = Array(7).fill(0);
  for (const c of active) byWeekday[(new Date(c.date + "T12:00").getDay() + 6) % 7] += activityScore(c.a);
  const top = byWeekday.indexOf(Math.max(...byWeekday));
  const thisWeek = cols[cols.length - 1].reduce((n, c) => n + c.a.minutes, 0);
  return {
    cols,
    activeDays: active.length,
    best: bestStreak([...data.entries()].filter(([, a]) => activityScore(a) > 0).map(([d]) => d)),
    topDay: active.length ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][top] : null,
    thisWeekMinutes: thisWeek,
  };
}
