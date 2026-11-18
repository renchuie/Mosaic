// Managing notes and folders from the notes list and the Notes home: the right-click menu,
// dragging a note or folder onto a folder, and each folder's own icon and colour (synced
// collection `noteFolders`, keyed by the folder's path). The menu and the drag ghost are drawn
// by NoteMenu.svelte, mounted once on the notes page. Drop targets are any element with
// `data-drop-dir` (the folder path, "" = top level).
import { del, entries, get, put } from "./synced.svelte";
import { dirOf, moveFolder, moveNote, notes, renameNote, trashFolder, trashNote } from "./notes.svelte";
import { setLastNote, ui } from "./ui.svelte";

export type FolderLook = { icon?: string; color?: string };
export const folderLook = (dir: string): FolderLook => get<FolderLook>("noteFolders", dir) ?? {};
export function setFolderLook(dir: string, patch: FolderLook) {
  const v: FolderLook = { ...folderLook(dir), ...patch };
  for (const k of Object.keys(v) as (keyof FolderLook)[]) if (!v[k]) delete v[k];
  if (Object.keys(v).length) put("noteFolders", dir, v);
  else if (get("noteFolders", dir)) del("noteFolders", dir);
}

/** The note page registers these so a note that is open gets saved first, and followed after. */
export const noteHooks = {
  flush: null as null | (() => Promise<void>),
  /** the open note moved to `to` (null = it was deleted) */
  moved: null as null | ((to: string | null) => void),
};

export type Target = { kind: "note" | "folder"; rel: string };
export const noteMenu = $state({
  open: null as null | (Target & { x: number; y: number; view: "menu" | "rename" | "look" | "delete" | "move" }),
  msg: "",
});

export function openMenu(e: MouseEvent, t: Target) {
  e.preventDefault();
  e.stopPropagation();
  noteMenu.open = { ...t, x: e.clientX, y: e.clientY, view: "menu" };
}

let msgTimer = 0;
export function say(m: string) {
  noteMenu.msg = m;
  window.clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => (noteMenu.msg = ""), 4000);
}
const errText = (e: unknown) => String(e instanceof Error ? e.message : e);

const isOpenIn = (rel: string) => !!notes.editing && (notes.editing === rel || notes.editing.startsWith(rel + "/"));
async function beforeChange(rel: string) {
  if (isOpenIn(rel)) await noteHooks.flush?.();
}
/** the open note's (or the remembered last note's) path after `from` became `to` */
function followMove(from: string, to: string | null) {
  const map = (r: string) => (r === from ? to : r.startsWith(from + "/") ? (to === null ? null : to + r.slice(from.length)) : r);
  if (notes.editing && isOpenIn(from)) noteHooks.moved?.(map(notes.editing));
  if (ui.lastNote && (ui.lastNote === from || ui.lastNote.startsWith(from + "/"))) setLastNote(map(ui.lastNote));
}

export async function doRenameNote(rel: string, title: string) {
  try {
    await beforeChange(rel);
    const to = await renameNote(rel, title.trim());
    followMove(rel, to);
    return true;
  } catch (e) {
    say(errText(e));
    return false;
  }
}
export async function doMoveNote(rel: string, folder: string) {
  if (dirOf(rel) === folder) return;
  try {
    await beforeChange(rel);
    const to = await moveNote(rel, folder);
    followMove(rel, to);
  } catch (e) {
    say(errText(e));
  }
}
export async function doTrashNote(rel: string) {
  try {
    await beforeChange(rel);
    await trashNote(rel);
    followMove(rel, null);
  } catch (e) {
    say(errText(e));
  }
}

/** Move or rename a folder; its look (and its subfolders' looks) go with it. */
export async function doMoveFolder(from: string, to: string) {
  try {
    await beforeChange(from);
    const done = await moveFolder(from, to);
    if (done === from) return true;
    for (const [k, v] of entries<FolderLook>("noteFolders")) {
      if (k === from || k.startsWith(from + "/")) {
        put("noteFolders", done + k.slice(from.length), v);
        del("noteFolders", k);
      }
    }
    followMove(from, done);
    return true;
  } catch (e) {
    say(errText(e));
    return false;
  }
}
export const doRenameFolder = (dir: string, name: string) => doMoveFolder(dir, `${dirOf(dir) ? dirOf(dir) + "/" : ""}${name.trim()}`);
export async function doTrashFolder(dir: string) {
  try {
    await beforeChange(dir);
    await trashFolder(dir);
    for (const [k] of entries("noteFolders")) if (k === dir || k.startsWith(dir + "/")) del("noteFolders", k);
    followMove(dir, null);
  } catch (e) {
    say(errText(e));
  }
}

// ---- dragging ------------------------------------------------------------------------------

export const noteDrag = $state({
  item: null as null | (Target & { label: string; icon: string }),
  x: 0,
  y: 0,
  /** folder under the pointer that would take the drop (undefined = none) */
  over: undefined as string | undefined,
});
let pending: { t: Target & { label: string; icon: string }; x0: number; y0: number } | null = null;

/** A drop is allowed when it changes something and doesn't put a folder inside itself. */
export function canDrop(t: Target, dir: string) {
  if (t.kind === "note") return dirOf(t.rel) !== dir;
  return dir !== t.rel && !dir.startsWith(t.rel + "/") && dirOf(t.rel) !== dir;
}

export function dragStart(e: PointerEvent, t: Target, label: string, icon = t.kind === "note" ? "📄" : "📁") {
  if (e.button !== 0 || e.pointerType === "touch") return;
  pending = { t: { ...t, label, icon }, x0: e.clientX, y0: e.clientY };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}
function onMove(e: PointerEvent) {
  if (pending && !noteDrag.item) {
    if (Math.hypot(e.clientX - pending.x0, e.clientY - pending.y0) < 6) return;
    noteDrag.item = pending.t;
    document.documentElement.classList.add("note-dragging");
    window.getSelection()?.removeAllRanges();
  }
  if (!noteDrag.item) return;
  e.preventDefault();
  noteDrag.x = e.clientX;
  noteDrag.y = e.clientY;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-drop-dir]");
  const dir = el?.dataset.dropDir;
  noteDrag.over = dir !== undefined && canDrop(noteDrag.item, dir) ? dir : undefined;
  // scroll the list under the pointer when near its top or bottom edge
  const sc = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-drag-scroll]");
  if (sc) {
    const r = sc.getBoundingClientRect();
    if (e.clientY < r.top + 36) sc.scrollTop -= 10;
    else if (e.clientY > r.bottom - 36) sc.scrollTop += 10;
  }
}
function swallow(ev: Event) {
  ev.preventDefault();
  ev.stopPropagation();
}
function onUp() {
  window.removeEventListener("pointermove", onMove);
  const it = noteDrag.item;
  const over = noteDrag.over;
  pending = null;
  noteDrag.item = null;
  noteDrag.over = undefined;
  document.documentElement.classList.remove("note-dragging");
  if (!it) return;
  // the drag ends with a click on whatever was pressed (a link or a folder): swallow that one
  // click; it comes right after pointerup, so the listener goes again on the next tick
  window.addEventListener("click", swallow, { capture: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
  if (over === undefined) return;
  if (it.kind === "note") void doMoveNote(it.rel, over);
  else void doMoveFolder(it.rel, `${over ? over + "/" : ""}${it.rel.split("/").pop()}`);
}
