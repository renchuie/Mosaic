// Backups (Nov 19): once a day, a copy of the app data and every note's text goes to this computer
// AND to Drive (settings.backupLocal / backupDrive; "" turns a place off), the newest 14 per
// computer kept. Settings → Backups backs up now, lists them and restores one with a preview.
// The pure parts (building, checking, diffing, restoring) are in ../backup.ts.

import {
  backupName, dayStamp, makeBackup, parseBackup, previewRestore, readName, restoredColls, restoredSettings,
  type Backup, type Preview,
} from "../backup";
import { inTauri, invoke } from "../tauri";
import { notes, saveNote, trashNote } from "./notes.svelte";
import { noteHooks } from "./noteOps.svelte";
import { saveSettings, settings } from "./settings.svelte";
import { db, restoreColls, sync } from "./synced.svelte";

export type Place = "local" | "drive";
export type BackupFile = { name: string; size: number; mtime: number };
export type Listed = BackupFile & { place: Place; day: string; time: string; machine: string; mine: boolean };

export const backups = $state({
  running: false,
  /** per place: when it last worked this session, or the error */
  last: { local: 0, drive: 0 } as Record<Place, number>,
  error: { local: "", drive: "" } as Record<Place, string>,
  list: [] as Listed[],
});

const dirOf = (p: Place) => (p === "local" ? settings.backupLocal : settings.backupDrive) ?? "";
const places = (): Place[] => (["local", "drive"] as Place[]).filter((p) => dirOf(p).trim());
const errText = (e: unknown) => String(e instanceof Error ? e.message : e);

function build(): Backup {
  // notes from the index (the cache when the folder couldn't be read); null if there's nothing,
  // so an empty folder (Drive not mounted) never looks like "all notes deleted"
  const texts = Object.fromEntries(Object.values(notes.files).map((e) => [e.rel, e.text]));
  return makeBackup({
    now: Date.now(),
    machine: sync.machine || "computer",
    host: sync.host,
    settings: $state.snapshot(settings) as Record<string, unknown>,
    colls: $state.snapshot(db.colls),
    notes: Object.keys(texts).length ? texts : null,
  });
}

/** Back up to every place that's on. `force` = even if today's copy is there (it's replaced);
 *  `timed` = a separate copy named with the time (taken before a restore). */
export async function runBackup(force = false, timed = false): Promise<void> {
  if (!inTauri || backups.running) return;
  if (!Object.keys(db.colls).length) return; // app data not loaded: nothing worth keeping yet
  backups.running = true;
  try {
    const name = backupName(new Date(), sync.machine || "computer", timed);
    let content = "";
    for (const p of places()) {
      try {
        // pasted images: only new ones are copied, so this is cheap every time
        if (notes.loaded) await invoke("backup_attachments", { dir: dirOf(p) }).catch((e) => console.error("backup images", e));
        if (!force) {
          const have = await invoke<BackupFile[]>("backup_list", { dir: dirOf(p) });
          if (have.some((f) => f.name === name)) {
            backups.error[p] = "";
            continue;
          }
        }
        content ||= JSON.stringify(build());
        await invoke("backup_write", { dir: dirOf(p), file: name, content });
        await invoke("backup_prune", { dir: dirOf(p), machine: sync.machine || "computer", keep: Math.max(1, settings.backupKeep ?? 14) });
        backups.last[p] = Date.now();
        backups.error[p] = "";
      } catch (e) {
        backups.error[p] = errText(e);
      }
    }
  } finally {
    backups.running = false;
  }
}

/** Every backup in both places, newest first. */
export async function listBackups(): Promise<void> {
  if (!inTauri) return;
  const out: Listed[] = [];
  for (const p of places()) {
    try {
      for (const f of await invoke<BackupFile[]>("backup_list", { dir: dirOf(p) })) {
        const n = readName(f.name);
        if (n) out.push({ ...f, place: p, day: n.day, time: n.time, machine: n.machine, mine: n.machine === sync.machine });
      }
      backups.error[p] = "";
    } catch (e) {
      backups.error[p] = errText(e);
    }
  }
  backups.list = out.sort((a, b) => b.mtime - a.mtime);
}

export async function readBackup(f: Listed): Promise<Backup | string> {
  try {
    return parseBackup(await invoke<string>("backup_read", { dir: dirOf(f.place), file: f.name }));
  } catch (e) {
    return errText(e);
  }
}

export const preview = (b: Backup): Preview =>
  previewRestore($state.snapshot(db.colls), Object.fromEntries(Object.values(notes.files).map((e) => [e.rel, e.text])), b);

export type RestoreWhat = { data: boolean; notes: boolean; settings: boolean };

/**
 * Put a backup back. App data replaces what's here (and syncs out to the other computer); notes
 * that are missing come back and notes that differ are replaced, the current version going to
 * .trash first. Notes made since the backup are left alone. A fresh backup of the current state
 * is taken first, so a restore can itself be undone.
 */
export async function restoreBackup(b: Backup, what: RestoreWhat): Promise<{ notes: number; failed: string[] }> {
  await runBackup(true, true);
  const failed: string[] = [];
  let restored = 0;
  if (what.data) restoreColls(restoredColls($state.snapshot(db.colls), b, sync.machine || "computer", Date.now()));
  if (what.settings) await saveSettings(restoredSettings(b) as Partial<typeof settings>);
  if (what.notes && b.notes) {
    // pasted images the notes folder is missing come back from the backup folders
    for (const p of places()) await invoke("backup_restore_attachments", { dir: dirOf(p) }).catch(() => 0);
    const pv = preview(b);
    if (notes.editing && [...pv.notes!.changed].includes(notes.editing)) noteHooks.moved?.(null); // leave it first
    for (const rel of pv.notes!.missing) {
      try {
        await saveNote(rel, b.notes[rel]);
        restored++;
      } catch {
        failed.push(rel);
      }
    }
    for (const rel of pv.notes!.changed) {
      try {
        await trashNote(rel);
        await saveNote(rel, b.notes[rel]);
        restored++;
      } catch {
        failed.push(rel);
      }
    }
  }
  return { notes: restored, failed };
}

/** Daily backups: a while after the app opens (so start-up stays quick), then every hour, which
 *  also catches the day changing while the app stays open. */
export function initBackups() {
  if (!inTauri) return;
  const tick = () => {
    if (settings.autoBackup !== false) void runBackup();
  };
  window.setTimeout(tick, 45_000);
  window.setInterval(tick, 60 * 60_000);
}

export const today = () => dayStamp(new Date());
