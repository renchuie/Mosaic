// Recall Labs: the scanned folder tree (local to this machine) and each lab's
// progress (same-origin localStorage). When each lab was last opened, study
// days, and the per-folder settings (course, exam date, colour) that turn a
// folder into a dashboard live in the synced store, so they follow you.
import { readAll } from "../labStorage";
import { EMPTY, combine, parseProgress, type Progress } from "../progress";
import type { Tone } from "../sample/data";
import { sampleProgress, sampleTree } from "../sample/labs";
import { inTauri, invoke, loadDoc, saveDoc } from "../tauri";
import { captureLabs, db, entries, get, onMerged, put, sync } from "./synced.svelte";
import { settings } from "./settings.svelte";

export type LabMeta = { title: string; version: string; slug: string; slug_guessed: boolean };
export type Item = { name: string; rel: string; kind: "lab" | "note" | "file"; ext: string; size: number; mtime: number; lab: LabMeta | null };
export type Folder = { name: string; rel: string; folders: Folder[]; items: Item[]; truncated: boolean };
type ScanResult = { root: string; tree: Folder | null; error: string | null; scanned_at: number; files_read: number };

export type FolderMeta = { course?: string; examDate?: string; tone?: Tone };
export type LabRef = { item: Item; lab: LabMeta; folder: Folder; progress: Progress; lastOpened: number };
type LabOpen = { last: number; opens: number };

const state = $state({
  tree: null as Folder | null,
  root: "",
  error: null as string | null,
  scanning: false,
  scannedAt: 0,
  /** raw localStorage values by key */
  storage: {} as Record<string, string>,
  storageError: null as string | null,
});
export const labs = state;

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function initLabs() {
  if (!inTauri) {
    state.tree = sampleTree;
    state.root = settings.labsRoot;
    state.storage = sampleProgress;
    const rec = (v: unknown) => ({ u: 1, m: "preview", v });
    Object.assign(db.colls, {
      labOpens: { "Ther IV/Exam 5/Ther IV Exam 5 Recall Lab.html": rec({ last: Date.now() - 3.6e6, opens: 9 }) },
      days: Object.fromEntries(lastNDays([0, 1, 2, 4, 5, 6]).map((d) => [d, rec(1)])),
      folders: {
        "Ther IV": rec({ course: "Therapeutics IV", tone: "rose" }),
        "Ther IV/Exam 5": rec({ examDate: "2026-12-04", tone: "sage" }),
        "Ther IV/Exam 4": rec({ examDate: "2026-11-17", tone: "peach" }),
      },
    });
    return;
  }
  const cached = await loadDoc<ScanResult>("labs-tree");
  if (cached?.tree) {
    state.tree = cached.tree;
    state.root = cached.root;
    state.scannedAt = cached.scanned_at;
  }
  refreshProgress();
  void rescan();
  // A lab saving progress in the viewer fires this in the dashboard document.
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key.startsWith("recallLab.")) refreshProgress();
  });
  window.addEventListener("focus", () => refreshProgress());
  onMerged(() => refreshProgress());
}

/** One-time move of Phase 2 files (labs-folders.json, labs-activity.json) into the synced store. */
export async function migrateLabDocs(add: (coll: string, id: string, v: unknown) => void) {
  const [folders, activity] = await Promise.all([
    loadDoc<Record<string, FolderMeta>>("labs-folders"),
    loadDoc<{ labs?: Record<string, LabOpen>; days?: string[] }>("labs-activity"),
  ]);
  for (const [rel, m] of Object.entries(folders ?? {})) add("folders", rel, m);
  for (const [rel, o] of Object.entries(activity?.labs ?? {})) add("labOpens", rel, o);
  for (const d of activity?.days ?? []) add("days", d, 1);
}

function lastNDays(offsets: number[]) {
  return offsets.map((o) => dayKey(new Date(Date.now() - o * 864e5)));
}

let inFlight: Promise<void> | null = null;

/** Scan the labs folder. A call during a scan waits for that scan instead of starting another. */
export function rescan(): Promise<void> {
  if (!inTauri) return Promise.resolve();
  inFlight ??= doScan().finally(() => (inFlight = null));
  return inFlight;
}

async function doScan() {
  state.scanning = true;
  try {
    const res = await invoke<ScanResult>("scan_labs", { root: settings.labsRoot, depth: settings.scanDepth });
    state.root = res.root;
    state.error = res.error;
    state.scannedAt = res.scanned_at;
    if (res.tree) {
      state.tree = res.tree;
      await saveDoc("labs-tree", res);
    } else {
      state.tree = null;
    }
  } catch (e) {
    state.error = String(e);
  } finally {
    state.scanning = false;
  }
}

export function refreshProgress() {
  if (!inTauri) return;
  try {
    state.storage = readAll();
    state.storageError = null;
  } catch (e) {
    state.storageError = String(e instanceof Error ? e.message : e);
  }
}

export function progressOf(lab: LabMeta | null): Progress {
  if (!lab) return EMPTY;
  return parseProgress(state.storage[`recallLab.${lab.slug}.v3`]);
}

export function recordOpen(rel: string) {
  const prev = get<LabOpen>("labOpens", rel);
  put("labOpens", rel, { last: Date.now(), opens: (prev?.opens ?? 0) + 1 });
  markStudyDay();
}

/** A day counts toward the streak: you opened a lab or checked off a study block.
 *  Older records are just 1 (= one lab opened). */
export function markStudyDay(what: "labs" | "blocks" | "reviews" = "labs") {
  const today = dayKey();
  const cur = get<number | { labs?: number; blocks?: number; reviews?: number }>("days", today);
  const rec = typeof cur === "number" ? { labs: cur } : { ...(cur ?? {}) };
  rec[what] = (rec[what] ?? 0) + 1;
  put("days", today, rec);
}

/** While a lab is open its progress is not overwritten by sync; on leaving, capture and push it. */
export function setOpenLab(lab: LabMeta | null) {
  sync.openLabKey = lab ? `recallLab.${lab.slug}.v3` : null;
  if (!lab) {
    captureLabs();
    refreshProgress();
  }
}

export const folderMeta = (rel: string): FolderMeta => get<FolderMeta>("folders", rel) ?? {};

export function setFolderMeta(rel: string, patch: Partial<FolderMeta>) {
  const next: FolderMeta = { ...folderMeta(rel), ...patch };
  for (const k of Object.keys(next) as (keyof FolderMeta)[]) if (next[k] === undefined) delete next[k];
  put("folders", rel, next);
}

// ---- tree helpers ---------------------------------------------------------

export function findFolder(rel: string, from: Folder | null = state.tree): Folder | null {
  if (!from) return null;
  if (from.rel === rel) return from;
  for (const f of from.folders) {
    if (rel === f.rel || rel.startsWith(f.rel + "/")) return findFolder(rel, f);
  }
  return null;
}

export function parentRel(rel: string) {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

/** All labs at or below a folder. */
export function labsIn(folder: Folder | null): LabRef[] {
  if (!folder) return [];
  const out: LabRef[] = [];
  const walk = (f: Folder) => {
    for (const item of f.items) {
      if (item.kind === "lab" && item.lab) {
        out.push({ item, lab: item.lab, folder: f, progress: progressOf(item.lab), lastOpened: get<LabOpen>("labOpens", item.rel)?.last ?? 0 });
      }
    }
    f.folders.forEach(walk);
  };
  walk(folder);
  return out;
}

export function folderStats(folder: Folder | null) {
  const list = labsIn(folder);
  return { count: list.length, progress: list.length ? combine(list.map((l) => l.progress)) : EMPTY };
}

/** Folder setting, inherited from the nearest parent that has it. */
export function inherited<K extends keyof FolderMeta>(rel: string, key: K): FolderMeta[K] | undefined {
  let r: string | null = rel;
  while (r !== null) {
    const v = folderMeta(r)[key];
    if (v) return v;
    r = r === "" ? null : parentRel(r);
  }
  return undefined;
}

/** Folders that have an exam date, for the countdowns. */
export function folderExams() {
  return entries<FolderMeta>("folders")
    .filter(([, m]) => m.examDate)
    // "Ther IV/Exam 5" → "Ther IV Exam 5": the folder name alone is often just "Exam 5".
    .map(([rel, m]) => ({ rel, title: rel.split("/").slice(-2).join(" ") || "Exam", course: m.course ?? inherited(rel, "course") ?? "", date: `${m.examDate}T09:00` }));
}

export function streakInfo() {
  const days = new Set(entries("days").map(([d]) => d));
  let n = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return days.has(dayKey(x));
  });
  return { days: n, week };
}

export const encodeRel = (rel: string) => rel.split("/").map(encodeURIComponent).join("/");
export const folderHref = (rel: string) => (rel ? `#/labs/${encodeRel(rel)}` : "#/labs");
export const labHref = (rel: string) => `#/labs/${encodeRel(rel)}`;
