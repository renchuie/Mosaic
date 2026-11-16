// Tasks, stored in the synced store (collection "tasks"). They show on the
// calendar, the dashboard and the Tasks page; the Phase 4 board builds on
// the same records (status = column).
import { overdueTasks, taskOccurrences, todayKey, type Task } from "../calendar";
import { view } from "./calendar.svelte";
import { del, entries, get, newId, put } from "./synced.svelte";

export const tasks = () => entries<Task>("tasks");
export const getTask = (id: string) => get<Task>("tasks", id);
const shown = (t: Task) => !view.hidden.includes(t.tag ?? "task");

/** Task occurrences in a range, without hidden tags. */
export const visibleTasks = (from: string, to: string) => taskOccurrences(tasks(), from, to).filter((o) => shown(o.task));
export const tasksOn = (from: string, to: string) => taskOccurrences(tasks(), from, to);
export const overdue = () => overdueTasks(tasks(), todayKey());

export function saveTask(id: string | null, t: Task) {
  put("tasks", id ?? newId(), t);
}
export const deleteTask = (id: string) => del("tasks", id);

export function skipTaskDay(id: string, date: string) {
  const t = getTask(id);
  if (t) put("tasks", id, { ...t, skip: [...(t.skip ?? []), date] });
}

/** Tick or untick. Repeating tasks are ticked per day; one-off tasks change status. */
export function toggleTask(id: string, date?: string | null) {
  const t = getTask(id);
  if (!t) return;
  if (t.repeat) {
    if (!date) return;
    const days = t.doneDates ?? [];
    put("tasks", id, { ...t, doneDates: days.includes(date) ? days.filter((d) => d !== date) : [...days, date] });
  } else if (t.status === "done") {
    const { doneAt: _, ...rest } = t;
    put("tasks", id, { ...rest, status: "todo" });
  } else {
    put("tasks", id, { ...t, status: "done", doneAt: Date.now() });
  }
}

export function toggleSubtask(id: string, sub: string) {
  const t = getTask(id);
  if (!t?.subtasks) return;
  put("tasks", id, { ...t, subtasks: t.subtasks.map((s) => (s.id === sub ? { ...s, done: !s.done } : s)) });
}

export const blankTask = (partial: Partial<Task> = {}): Task => ({
  title: "",
  tag: "task",
  priority: "normal",
  status: "todo",
  created: Date.now(),
  ...partial,
});
