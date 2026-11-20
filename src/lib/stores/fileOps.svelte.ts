// File management in Study → Files (Nov 20, her ask: "basic features like Obsidian and RemNote"):
// rename, move, new folder, duplicate, delete (to the folder's .trash) and show in file manager,
// for the three places files live: the notes folder (through the note operations, which keep
// links, history and the open note right), the PDF folder and the Materials folder (Rust
// `files_*`). After a PDF or Materials change, whatever was keyed by its path follows it: lecture
// links and stars (`relinkLinks`), a PDF's reading spot and marks state (`pdfState`), a Materials
// folder's course / exam date (`folders`) and when pages were last opened (`labOpens`).
import { inTauri, invoke } from "../tauri";
import { del, entries, put } from "./synced.svelte";
import { relinkLinks, type Link, type LinkKind } from "./outline.svelte";
import { pdfs, refreshPdfs } from "./pdfs.svelte";
import { labs, rescan, type Folder } from "./labs.svelte";
import { dirOf, getNote, importNote, makeFolder, noteDirs, notes } from "./notes.svelte";
import { doMoveFolder, doMoveNote, doRenameFolder, doRenameNote, doTrashFolder, doTrashNote } from "./noteOps.svelte";
import { safeName } from "../materials";

export type Area = "note" | "pdf" | "mat";
export const AREA_NAMES: Record<Area, string> = { note: "Notes", pdf: "PDFs", mat: "Materials" };
export const areaOf = (l: Link): Area | null => (l.kind === "note" ? "note" : l.kind === "pdf" ? "pdf" : l.kind === "file" ? "mat" : null);
export const linkKind = (a: Area): LinkKind => (a === "note" ? "note" : a === "pdf" ? "pdf" : "file");

export const files = $state({ msg: "" });
let timer = 0;
export function tell(m: string) {
  files.msg = m;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => (files.msg = ""), 3500);
}
const errText = (e: unknown) => String(e instanceof Error ? e.message : e);

// ---- folders per place ------------------------------------------------------------------

function matDirs(): string[] {
  const out: string[] = [];
  const walk = (f: Folder) => {
    if (f.rel) out.push(f.rel);
    f.folders.forEach(walk);
  };
  if (labs.tree) walk(labs.tree);
  return out;
}
export const areaDirs = (a: Area): string[] => (a === "note" ? noteDirs() : a === "pdf" ? pdfs.dirs : matDirs()).slice().sort((x, y) => x.localeCompare(y));
/** subfolders directly inside `dir` ("" = the top) */
export const childDirs = (a: Area, dir: string) => areaDirs(a).filter((d) => dirOf(d) === dir);
export const baseName = (rel: string) => rel.split("/").pop() ?? rel;
const extOf = (rel: string) => (/\.[^./]+$/.exec(rel)?.[0] ?? "");
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
function exists(a: Area, rel: string): boolean {
  if (a === "note") return !!getNote(rel) || noteDirs().includes(rel);
  if (a === "pdf") return pdfs.files.some((f) => f.rel === rel) || pdfs.dirs.includes(rel);
  const lower = rel.toLowerCase();
  return matDirs().some((d) => d.toLowerCase() === lower) || [...matItems()].some((r) => r.toLowerCase() === lower);
}
function matItems(): Set<string> {
  const out = new Set<string>();
  const walk = (f: Folder) => {
    f.items.forEach((i) => out.add(i.rel));
    f.folders.forEach(walk);
  };
  if (labs.tree) walk(labs.tree);
  return out;
}
/** a free name in `dir`: "Name", "Name (2)", … */
function freeName(a: Area, dir: string, stem: string, ext: string) {
  for (let n = 1; ; n++) {
    const rel = join(dir, `${stem}${n > 1 ? ` (${n})` : ""}${ext}`);
    if (!exists(a, rel)) return rel;
  }
}

// ---- after a PDF / Materials change -------------------------------------------------------

function moveKeys(coll: string, from: string, to: string | null) {
  for (const [k, v] of entries(coll)) {
    if (k !== from && !k.startsWith(from + "/")) continue;
    del(coll, k);
    if (to !== null) put(coll, to + k.slice(from.length), v);
  }
}
async function after(a: Area, from: string, to: string | null) {
  relinkLinks(linkKind(a), from, to);
  if (a === "pdf") {
    moveKeys("pdfState", from, to);
    await refreshPdfs();
  } else if (a === "mat") {
    moveKeys("folders", from, to);
    moveKeys("labOpens", from, to);
    await rescan();
  }
}
async function raw(cmd: string, args: Record<string, unknown>) {
  if (!inTauri) throw new Error("Not available in the preview");
  await invoke(cmd, args);
}

// ---- operations (each says what went wrong instead of throwing) ---------------------------

export async function renameItem(a: Area, rel: string, name: string): Promise<boolean> {
  const n = name.trim();
  if (!n) return false;
  if (a === "note") return doRenameNote(rel, n);
  const ext = extOf(rel);
  const to = join(dirOf(rel), safeName(n.replace(new RegExp(`\\${ext}$`, "i"), "")) + ext);
  if (to === rel) return true;
  try {
    await raw("files_move", { area: a, from: rel, to });
    await after(a, rel, to);
    return true;
  } catch (e) {
    tell(errText(e));
    return false;
  }
}

export async function moveItem(a: Area, rel: string, folder: string): Promise<void> {
  if (dirOf(rel) === folder) return;
  if (a === "note") return doMoveNote(rel, folder);
  const to = join(folder, baseName(rel));
  try {
    await raw("files_move", { area: a, from: rel, to });
    await after(a, rel, to);
  } catch (e) {
    tell(errText(e));
  }
}

export async function trashItem(a: Area, rel: string): Promise<void> {
  if (a === "note") return doTrashNote(rel);
  try {
    await raw("files_trash", { area: a, rel });
    await after(a, rel, null);
  } catch (e) {
    tell(`Couldn't delete it (${errText(e)})`);
  }
}

export async function duplicateItem(a: Area, rel: string): Promise<string | null> {
  const ext = extOf(rel);
  const stem = `${baseName(rel).slice(0, baseName(rel).length - ext.length)} copy`;
  try {
    if (a === "note") {
      const e = getNote(rel);
      if (!e) return null;
      return await importNote(dirOf(rel), `${stem}.md`, e.text);
    }
    const to = freeName(a, dirOf(rel), stem, ext);
    await raw("files_copy", { area: a, from: rel, to });
    await (a === "pdf" ? refreshPdfs() : rescan());
    return to;
  } catch (e) {
    tell(errText(e));
    return null;
  }
}

export async function newFolder(a: Area, parent: string, name: string): Promise<string | null> {
  const n = safeName(name.trim());
  if (!n) return null;
  const rel = join(parent, n);
  if (exists(a, rel)) {
    tell(`“${n}” is already there`);
    return null;
  }
  try {
    if (a === "note") await makeFolder(rel);
    else {
      await raw("files_mkdir", { area: a, rel });
      if (a === "pdf") pdfs.dirs = [...pdfs.dirs, rel].sort();
      else await rescan();
    }
    return rel;
  } catch (e) {
    tell(errText(e));
    return null;
  }
}

export async function moveFolderTo(a: Area, rel: string, parent: string): Promise<boolean> {
  const to = join(parent, baseName(rel));
  if (to === rel) return true;
  if (parent === rel || parent.startsWith(rel + "/")) {
    tell("A folder can't go inside itself");
    return false;
  }
  if (a === "note") return doMoveFolder(rel, to);
  return folderMove(a, rel, to);
}
export async function renameFolder(a: Area, rel: string, name: string): Promise<boolean> {
  const n = safeName(name.trim());
  if (!n || n === baseName(rel)) return !!n;
  if (a === "note") return doRenameFolder(rel, n);
  return folderMove(a, rel, join(dirOf(rel), n));
}
async function folderMove(a: Area, from: string, to: string) {
  try {
    await raw("files_move", { area: a, from, to });
    if (a === "pdf") pdfs.dirs = pdfs.dirs.map((d) => (d === from || d.startsWith(from + "/") ? to + d.slice(from.length) : d));
    await after(a, from, to);
    return true;
  } catch (e) {
    tell(errText(e));
    return false;
  }
}
export async function trashFolder(a: Area, rel: string): Promise<void> {
  if (a === "note") return doTrashFolder(rel);
  try {
    await raw("files_trash", { area: a, rel });
    if (a === "pdf") pdfs.dirs = pdfs.dirs.filter((d) => d !== rel && !d.startsWith(rel + "/"));
    await after(a, rel, null);
  } catch (e) {
    tell(`Couldn't delete it (${errText(e)})`);
  }
}

/** Add any file's bytes to the PDF or Materials folder (never over an existing one). */
export async function addAnyFile(a: "pdf" | "mat", rel: string, bytes: Uint8Array): Promise<void> {
  if (!inTauri) throw new Error("Not available in the preview");
  await invoke("files_add", bytes, { headers: { "x-area": a, "x-rel": encodeURIComponent(rel) } });
}
/** Open a file in the computer's own app for it. */
export async function openFile(a: Area, rel: string) {
  try {
    await raw("files_open", { area: a, rel });
  } catch (e) {
    tell(errText(e));
  }
}

export async function reveal(a: Area, rel: string) {
  try {
    await raw("files_reveal", { area: a, rel });
  } catch (e) {
    tell(errText(e));
  }
}

/** How many notes / files a folder holds (for "Delete folder" to say what goes). */
export function folderCount(a: Area, rel: string): number {
  const inIt = (r: string) => r.startsWith(rel + "/");
  if (a === "note") return Object.keys(notes.files).filter(inIt).length;
  if (a === "pdf") return pdfs.files.filter((f) => inIt(f.rel)).length;
  return [...matItems()].filter(inIt).length;
}
