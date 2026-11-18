// Everything that should follow you between PC and laptop lives here, in
// named collections of records. Each record remembers when and on which
// machine it last changed; merging keeps the newer one. Recall Lab progress
// (collection "lab", one record per localStorage key) merges smarter, see labMerge.ts.
//
// Local copy: ~/.local/share/studydesk/synced.json
// Shared copy: <sync folder>/<machine>.json, one file per machine.

import { mergeLabValue } from "../labMerge";
import { readAll as readLabStorage } from "../labStorage";
import { inTauri, invoke, loadDoc, saveDoc } from "../tauri";
import { settings } from "./settings.svelte";

/** u: changed at (ms), m: machine, x: deleted, v: value */
export type Rec = { u: number; m: string; x?: 1; v: unknown };
type Colls = Record<string, Record<string, Rec>>;
type SyncFile = { app: "studydesk"; version: 1; machine: string; host: string; savedAt: number; colls: Colls };
type Remote = { name: string; content: string; mtime: number };

export const db = $state<{ colls: Colls }>({ colls: {} });

export const sync = $state({
  machine: "",
  host: "",
  /** off | idle | syncing | error */
  status: "off" as "off" | "idle" | "syncing" | "error",
  error: null as string | null,
  lastSync: 0,
  others: [] as { host: string; savedAt: number }[],
  /** lab progress key currently open in the viewer; not overwritten while open */
  openLabKey: null as string | null,
});

// ---- reading and writing records ------------------------------------------

export function get<T>(coll: string, id: string): T | undefined {
  const r = db.colls[coll]?.[id];
  return r && !r.x ? (r.v as T) : undefined;
}

export function entries<T>(coll: string): [string, T][] {
  return Object.entries(db.colls[coll] ?? {})
    .filter(([, r]) => !r.x)
    .map(([id, r]) => [id, r.v as T]);
}

export function put(coll: string, id: string, v: unknown) {
  (db.colls[coll] ??= {})[id] = { u: Date.now(), m: sync.machine, v };
  changed();
}

export function del(coll: string, id: string) {
  if (!db.colls[coll]?.[id]) return;
  db.colls[coll][id] = { u: Date.now(), m: sync.machine, x: 1, v: null };
  changed();
}

/** Starter data: stamped as oldest possible so any real edit, on any machine, wins. */
export function seed(coll: string, id: string, v: unknown) {
  if (db.colls[coll]?.[id]) return;
  (db.colls[coll] ??= {})[id] = { u: 1, m: "seed", v };
  changed();
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---- merging ---------------------------------------------------------------

const newer = (a: Rec, b: Rec) => a.u > b.u || (a.u === b.u && a.m > b.m);

function mergeRec(coll: string, local: Rec, remote: Rec): Rec {
  const [n, o] = newer(remote, local) ? [remote, local] : [local, remote];
  if (coll === "lab" && !n.x && !o.x && typeof n.v === "string" && typeof o.v === "string") {
    return { ...n, v: mergeLabValue(n.v, o.v) };
  }
  return n;
}

/** Merge remote collections into db. Returns true if anything changed. */
function mergeIn(remote: Colls): boolean {
  let changedAny = false;
  for (const [coll, recs] of Object.entries(remote ?? {})) {
    const mine = (db.colls[coll] ??= {});
    for (const [id, r] of Object.entries(recs ?? {})) {
      if (!r || typeof r.u !== "number") continue;
      const cur = mine[id];
      const next = cur ? mergeRec(coll, cur, r) : r;
      if (!cur || next.u !== cur.u || next.m !== cur.m || next.x !== cur.x || JSON.stringify(next.v) !== JSON.stringify(cur.v)) {
        mine[id] = next;
        changedAny = true;
      }
    }
  }
  return changedAny;
}

// ---- Recall Lab progress <-> localStorage ----------------------------------

/** Record any lab progress that changed in localStorage since we last looked. */
export function captureLabs() {
  for (const [k, v] of Object.entries(readLabStorage())) {
    const r = db.colls.lab?.[k];
    if (!r || r.x || r.v !== v) put("lab", k, v);
  }
}

/** Write merged lab progress back into localStorage (except the lab that is open). */
function applyLabs() {
  const local = readLabStorage();
  for (const [k, r] of Object.entries(db.colls.lab ?? {})) {
    if (r.x || typeof r.v !== "string" || k === sync.openLabKey) continue;
    if (local[k] !== r.v) localStorage.setItem(k, r.v);
  }
}

// ---- persistence and sync --------------------------------------------------

let saveTimer = 0;
let pushTimer = 0;
const listeners = new Set<() => void>();
/** Called after remote changes were merged (e.g. so lab progress is re-read). */
export const onMerged = (f: () => void) => listeners.add(f);

function changed() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveDoc("synced", { colls: $state.snapshot(db.colls) }), 400);
  if (settings.syncEnabled) {
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => void syncNow(), 4000);
  }
}

export async function initSynced(migrate: (put: (c: string, id: string, v: unknown) => void) => Promise<void>) {
  if (!inTauri) return;
  const saved = await loadDoc<{ colls: Colls }>("synced");
  let ident = await loadDoc<{ machine: string }>("machine");
  sync.host = await invoke<string>("machine_name").catch(() => "computer");
  if (!ident?.machine) {
    const base = sync.host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "computer";
    ident = { machine: `${base}-${Math.random().toString(16).slice(2, 6)}` };
    await saveDoc("machine", ident);
  }
  sync.machine = ident.machine;
  if (saved?.colls) db.colls = saved.colls;
  else await migrate(put);

  captureLabs();
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key.startsWith("recallLab.")) captureLabs();
  });
  window.addEventListener("focus", () => void syncNow());
  window.setInterval(() => void syncNow(), 120_000);
  void syncNow();
}

/** Put restored app data in place (backup.ts restoredColls stamps it now, so it wins the next
 *  sync everywhere), write lab progress back to localStorage and tell the stores. */
export function restoreColls(colls: Colls) {
  db.colls = colls;
  applyLabs();
  changed();
  listeners.forEach((f) => f());
}

let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  if (!inTauri) return Promise.resolve();
  if (!settings.syncEnabled) {
    sync.status = "off";
    return Promise.resolve();
  }
  running ??= doSync().finally(() => (running = null));
  return running;
}

async function doSync() {
  sync.status = "syncing";
  try {
    captureLabs();
    const files = await invoke<Remote[]>("sync_read", { dir: settings.syncDir });
    const others: { host: string; savedAt: number }[] = [];
    let merged = false;
    for (const f of files) {
      if (f.name === `${sync.machine}.json`) continue;
      let data: SyncFile;
      try {
        data = JSON.parse(f.content);
      } catch {
        continue; // half-synced or foreign file; try again next time
      }
      if (data?.app !== "studydesk" || !data.colls) continue;
      others.push({ host: data.host || data.machine, savedAt: data.savedAt });
      if (mergeIn(data.colls)) merged = true;
    }
    sync.others = others;
    if (merged) {
      applyLabs();
      await saveDoc("synced", { colls: $state.snapshot(db.colls) });
      listeners.forEach((f) => f());
    }
    const mine: SyncFile = { app: "studydesk", version: 1, machine: sync.machine, host: sync.host, savedAt: Date.now(), colls: $state.snapshot(db.colls) };
    await invoke("sync_write", { dir: settings.syncDir, file: `${sync.machine}.json`, content: JSON.stringify(mine) });
    sync.lastSync = Date.now();
    sync.status = "idle";
    sync.error = null;
  } catch (e) {
    sync.status = "error";
    sync.error = String(e instanceof Error ? e.message : e);
  }
}
