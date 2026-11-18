// Backups (Nov 19, her picks: app data + every note's text; a copy on this computer and on Drive).
// Pure: no imports, so node can test it. The store (stores/backup.svelte.ts) does the I/O.

/** a synced record: u = changed at (ms), m = machine, x = deleted, v = value (see synced.svelte.ts) */
export type Rec = { u: number; m: string; x?: 1; v: unknown };
export type Colls = Record<string, Record<string, Rec>>;

export type Backup = {
  mosaicBackup: 1;
  created: number;
  machine: string;
  host: string;
  /** this computer's settings (folder paths are never restored from a backup) */
  settings: Record<string, unknown>;
  /** the synced app data: flashcard history, calendar, tasks, courses and grades, plans… */
  colls: Colls;
  /** every note's Markdown, by path inside the Notes folder; null when the notes couldn't be read */
  notes: Record<string, string> | null;
};

/** Settings that belong to one computer and its folders: kept as they are when restoring. */
export const MACHINE_SETTINGS = ["labsRoot", "notesRoot", "pdfRoot", "syncDir", "syncEnabled", "storage", "vault", "driveRoots", "backupLocal", "backupDrive"];

export const BACKUP_PREFIX = "mosaic-backup-";
const pad = (n: number) => String(n).padStart(2, "0");
export const dayStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** one file a day per computer; `timed` (the copy taken just before a restore) adds the time,
 *  "…-2026-11-19T1422-pc.json", so it never replaces the day's normal backup */
export const backupName = (d: Date, machine: string, timed = false) =>
  `${BACKUP_PREFIX}${dayStamp(d)}${timed ? `T${pad(d.getHours())}${pad(d.getMinutes())}` : ""}-${machine.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
/** the day, the time of a timed copy ("14:22"), and the machine from a file name, or null */
export function readName(name: string): { day: string; time: string; machine: string } | null {
  const m = /^mosaic-backup-(\d{4}-\d{2}-\d{2})(?:T(\d{2})(\d{2}))?-(.+)\.json$/.exec(name);
  return m ? { day: m[1], time: m[2] ? `${m[2]}:${m[3]}` : "", machine: m[4] } : null;
}

export function makeBackup(o: { now: number; machine: string; host: string; settings: Record<string, unknown>; colls: Colls; notes: Record<string, string> | null }): Backup {
  return { mosaicBackup: 1, created: o.now, machine: o.machine, host: o.host, settings: o.settings, colls: o.colls, notes: o.notes };
}

/** Read a backup file's text; a message instead when it isn't one. */
export function parseBackup(text: string): Backup | string {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return "That file isn't a Mosaic backup (it isn't valid JSON).";
  }
  const b = d as Partial<Backup>;
  if (!b || b.mosaicBackup !== 1 || typeof b.colls !== "object" || !b.colls) return "That file isn't a Mosaic backup.";
  return {
    mosaicBackup: 1,
    created: typeof b.created === "number" ? b.created : 0,
    machine: String(b.machine ?? ""),
    host: String(b.host ?? ""),
    settings: b.settings && typeof b.settings === "object" ? b.settings : {},
    colls: b.colls as Colls,
    notes: b.notes && typeof b.notes === "object" ? (b.notes as Record<string, string>) : null,
  };
}

const live = (c: Record<string, Rec> | undefined) => Object.fromEntries(Object.entries(c ?? {}).filter(([, r]) => r && !r.x));
/** JSON with object keys sorted, so the same data saved in another key order counts as the same */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

export type CollDiff = { coll: string; back: number; now: number; added: number; removed: number; changed: number };
export type Preview = {
  colls: CollDiff[];
  /** notes the backup has that are gone now, notes that differ, notes made since (left alone) */
  notes: { missing: string[]; changed: string[]; newer: string[] } | null;
};

/** What restoring `b` would change, collection by collection and note by note. */
export function previewRestore(now: Colls, nowNotes: Record<string, string>, b: Backup): Preview {
  const names = [...new Set([...Object.keys(b.colls), ...Object.keys(now)])].sort();
  const colls: CollDiff[] = [];
  for (const coll of names) {
    const a = live(now[coll]);
    const k = live(b.colls[coll]);
    let added = 0;
    let removed = 0;
    let changed = 0;
    for (const [id, r] of Object.entries(k)) {
      if (!a[id]) added++;
      else if (!same(a[id].v, r.v)) changed++;
    }
    for (const id of Object.keys(a)) if (!k[id]) removed++;
    colls.push({ coll, back: Object.keys(k).length, now: Object.keys(a).length, added, removed, changed });
  }
  let notes: Preview["notes"] = null;
  if (b.notes) {
    const missing: string[] = [];
    const changed: string[] = [];
    for (const [rel, text] of Object.entries(b.notes)) {
      if (!(rel in nowNotes)) missing.push(rel);
      else if (nowNotes[rel] !== text) changed.push(rel);
    }
    const newer = Object.keys(nowNotes).filter((r) => !(r in b.notes!));
    notes = { missing: missing.sort(), changed: changed.sort(), newer: newer.sort() };
  }
  return { colls, notes };
}

/**
 * The app data as it was in the backup, stamped NOW so it wins the next sync on every computer
 * (an old stamp would lose to the other machine's newer records and the restore would undo
 * itself). Records that exist now but not in the backup are deleted (tombstones, stamped now).
 * Records that are already the same keep their stamp.
 */
export function restoredColls(now: Colls, b: Backup, machine: string, at: number): Colls {
  const out: Colls = JSON.parse(JSON.stringify(now));
  for (const coll of new Set([...Object.keys(now), ...Object.keys(b.colls)])) {
    const mine = (out[coll] ??= {});
    const k = live(b.colls[coll]);
    for (const [id, r] of Object.entries(k)) {
      const cur = mine[id];
      if (!cur || cur.x || !same(cur.v, r.v)) mine[id] = { u: at, m: machine, v: r.v };
    }
    for (const [id, r] of Object.entries(mine)) if (!r.x && !k[id]) mine[id] = { u: at, m: machine, x: 1, v: null };
  }
  return out;
}

/** The backup's settings without the ones that belong to this computer's folders. */
export function restoredSettings(b: Backup): Record<string, unknown> {
  return Object.fromEntries(Object.entries(b.settings).filter(([k]) => !MACHINE_SETTINGS.includes(k)));
}

/** Friendly names for the synced collections in the restore preview. */
export const COLL_NAMES: Record<string, string> = {
  srs: "Flashcard reviews",
  reviewDays: "Review history by day",
  cardItems: "Library cards",
  cardTypes: "Card types",
  events: "Calendar events",
  tasks: "Tasks",
  tags: "Tags",
  columns: "Board columns",
  plans: "Study plans",
  courses: "Courses",
  assessments: "Grades",
  folders: "Materials folder links",
  lab: "Lab progress",
  labOpens: "Labs opened",
  days: "Study days (streak)",
  quizzes: "Quiz progress",
  pdfState: "PDF reading spots",
  noteFolders: "Folder icons and colours",
  calloutTypes: "Callout styles",
  blockStyles: "Quote and highlight styles",
  hlColors: "Highlight colours",
  hlPalettes: "Highlight palettes",
};
