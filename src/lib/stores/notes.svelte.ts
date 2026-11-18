// Notes: Markdown files in the notes folder on the Drive mount. Everything is
// indexed in memory (title, links, tags, headings) and cached locally so the app
// opens instantly; only files whose size or modification time changed are re-read.
import { fileNameFor, joinNote, linkKey, parseNote, rebaseAttachments, renameLinks, snippet, splitNote, TEMPLATES, type Meta, type Parsed } from "../notes";
import { inTauri, invoke, loadDoc, saveDoc } from "../tauri";
import { settings } from "./settings.svelte";

export type NoteEntry = { rel: string; mtime: number; size: number; text: string; p: Parsed };
type Listing = { root: string; files: { rel: string; mtime: number; size: number }[]; dirs: string[] };

export const notes = $state({
  root: "",
  /** the Notes folder setting the index was read from (a vanished folder is never re-made) */
  from: "",
  dirs: [] as string[],
  files: {} as Record<string, NoteEntry>,
  loaded: false,
  loading: false,
  error: null as string | null,
  /** note open in the editor (its card ids are added by the editor, not in the background) */
  editing: null as string | null,
  /** line to jump to when a note opens (from "Edit in note" on a card) */
  jump: null as { rel: string; line: number } | null,
});

const fileOf = (rel: string) => rel.split("/").pop()!;
export const dirOf = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
const entry = (rel: string, mtime: number, size: number, text: string): NoteEntry => ({ rel, mtime, size, text, p: parseNote(text, fileOf(rel)) });

let cacheTimer = 0;
function saveCache() {
  if (!inTauri) return;
  window.clearTimeout(cacheTimer);
  cacheTimer = window.setTimeout(() => {
    const files = Object.fromEntries(Object.values(notes.files).map((e) => [e.rel, { mtime: e.mtime, size: e.size, text: e.text }]));
    void saveDoc("notes-cache", { root: notes.root, from: notes.from, dirs: notes.dirs, files });
  }, 800);
}

export async function initNotes() {
  if (!inTauri) {
    loadSample();
    // browser preview only: lets the UI tests read what a note would save
    (window as unknown as { __notes: typeof notes }).__notes = notes;
    return;
  }
  const c = await loadDoc<{ root: string; from?: string; dirs: string[]; files: Record<string, { mtime: number; size: number; text: string }> }>("notes-cache");
  if (c?.files) {
    notes.root = c.root;
    notes.from = c.from ?? settings.notesRoot; // caches from before Nov 19: the folder in use
    notes.dirs = c.dirs ?? [];
    notes.files = Object.fromEntries(Object.entries(c.files).map(([rel, f]) => [rel, entry(rel, f.mtime, f.size, f.text)]));
    notes.loaded = true;
  }
  // empty the trash of anything older than settings.trashDays (30) once the folder is known
  void refreshNotes().then(() => purgeTrash("", settings.trashDays ?? 30).catch(() => 0));
  window.addEventListener("focus", () => void refreshNotes());
}

// ---- the notes folder's .trash (Nov 19: an in-app Trash) ----------------------------------------
export type TrashItem = { id: string; name: string; from: string; deleted: number; dir: boolean };
export async function trashList(): Promise<TrashItem[]> {
  return inTauri ? invoke<TrashItem[]>("notes_trash_list") : [];
}
/** Put a note or folder back where it was; returns its path (" (restored)" when the name is taken). */
export async function restoreFromTrash(t: TrashItem): Promise<string> {
  changed();
  const rel = await invoke<string>("notes_trash_restore", { id: t.id });
  if (t.from && rel !== t.from) historyMoved(t.from, rel, t.dir);
  await refreshNotes();
  return rel;
}
/** Delete for good: one entry by id, or (id "") everything older than `days` (0 = everything). */
export async function purgeTrash(id: string, days = 0): Promise<number> {
  return inTauri ? invoke<number>("notes_trash_purge", { id, days }) : 0;
}

let running: Promise<void> | null = null;
export function refreshNotes(): Promise<void> {
  if (!inTauri) return Promise.resolve();
  running ??= doRefresh().finally(() => (running = null));
  return running;
}

/** bumped by every move / rename / delete, so a refresh that read the folder before one of them
 *  is thrown away (it would bring back the old path) and runs again */
let changes = 0;
const changed = () => changes++;

async function doRefresh() {
  notes.loading = true;
  const gen = changes;
  try {
    // only make the folder when there were never notes from it (a new setup), never in place of
    // one that went missing
    const create = !Object.keys(notes.files).length || notes.from !== settings.notesRoot;
    const l = await invoke<Listing>("notes_list", { root: settings.notesRoot, create });
    const next: Record<string, NoteEntry> = {};
    for (const f of l.files) {
      const old = notes.files[f.rel];
      if (old && old.mtime === f.mtime && old.size === f.size) next[f.rel] = old;
      else next[f.rel] = entry(f.rel, f.mtime, f.size, await invoke<string>("notes_read", { rel: f.rel }));
      if (gen !== changes) break;
    }
    if (gen !== changes) {
      setTimeout(() => void refreshNotes(), 300);
      return;
    }
    notes.root = l.root;
    notes.from = settings.notesRoot;
    notes.dirs = l.dirs;
    notes.files = next;
    notes.error = null;
    saveCache();
  } catch (e) {
    notes.error = String(e instanceof Error ? e.message : e);
  } finally {
    notes.loading = false;
    notes.loaded = true;
  }
}

// ---- reading ------------------------------------------------------------------------

export const allNotes = () => Object.values(notes.files).sort((a, b) => a.p.title.localeCompare(b.p.title));
export const recentNotes = (n = 8) => Object.values(notes.files).sort((a, b) => b.mtime - a.mtime).slice(0, n);
export const getNote = (rel: string) => notes.files[rel];

/** The note a [[link]] points to: by file name first, then by title. */
export function resolveLink(name: string): NoteEntry | undefined {
  const k = linkKey(name);
  const list = Object.values(notes.files);
  return list.find((e) => linkKey(e.rel) === k) ?? list.find((e) => e.p.title.toLowerCase() === k);
}
/** Name to use when linking to a note. */
export const linkName = (e: NoteEntry) => fileOf(e.rel).replace(/\.md$/i, "");

export function backlinks(rel: string) {
  const me = notes.files[rel];
  if (!me) return [];
  const keys = new Set([linkKey(rel), me.p.title.toLowerCase()]);
  return Object.values(notes.files)
    .filter((e) => e.rel !== rel && e.p.links.some((l) => keys.has(linkKey(l))))
    .map((e) => {
      const line = splitNote(e.text).body.split("\n").find((l) => /\[\[/.test(l) && [...keys].some((k) => l.toLowerCase().includes(`[[${k}`))) ?? "";
      return { e, context: line.replace(/^\s*[-*]\s*/, "").trim() };
    });
}

export const notesForCourse = (name: string) =>
  Object.values(notes.files).filter((e) => e.p.meta.course === name).sort((a, b) => String(b.p.meta.date ?? "").localeCompare(String(a.p.meta.date ?? "")) || b.mtime - a.mtime);

export const allTags = () => [...new Set(Object.values(notes.files).flatMap((e) => e.p.tags))].sort();

export function searchNotes(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return Object.values(notes.files)
    .map((e) => ({ e, score: e.p.title.toLowerCase().includes(s) ? 2 : e.text.toLowerCase().includes(s) ? 1 : 0 }))
    .filter((x) => x.score)
    .sort((a, b) => b.score - a.score || b.e.mtime - a.e.mtime)
    .map((x) => ({ e: x.e, snip: snippet(x.e.text, q) }));
}

// ---- writing ------------------------------------------------------------------------

/** Save a note. Throws "conflict" if it changed on disk since `expected` (another computer). */
// ---- per-note history (Nov 19, her ask): before a save replaces a note's text, the old text is
// kept on this computer (Rust history.rs) — at most one version per 10 minutes of editing, so a
// typing session gives a version every 10 minutes, not one per autosave; `force` always keeps one
// (restoring an older version). Kept `settings.historyDays` days, up to 300 per note.
const SNAP_MS = 10 * 60_000;
const lastSnap = new Map<string, number>();
export function snapshot(rel: string, text: string, force = false) {
  if (!inTauri || !text) return;
  const now = Date.now();
  if (!force && now - (lastSnap.get(rel) ?? 0) < SNAP_MS) return;
  lastSnap.set(rel, now);
  void invoke("history_add", { rel, text, keepDays: settings.historyDays ?? 14, max: 300 }).catch((e) => console.error("history", e));
}
function historyMoved(from: string, to: string, folder = false) {
  if (!inTauri) return;
  for (const [k, t] of [...lastSnap]) {
    if (k === from || (folder && k.startsWith(from + "/"))) {
      lastSnap.delete(k);
      lastSnap.set(to + k.slice(from.length), t);
    }
  }
  void invoke("history_move", { from, to, folder }).catch((e) => console.error("history move", e));
}

export async function saveNote(rel: string, text: string, expected?: number): Promise<void> {
  const before = notes.files[rel]?.text;
  if (before !== undefined && before !== text) snapshot(rel, before);
  if (!inTauri) {
    notes.files[rel] = entry(rel, Date.now(), text.length, text);
    return;
  }
  const mtime = await invoke<number>("notes_write", { rel, content: text, expected: expected ?? null });
  notes.files[rel] = entry(rel, mtime, new Blob([text]).size, text);
  saveCache();
}

export async function reloadNote(rel: string) {
  if (!inTauri) return;
  const l = await invoke<Listing>("notes_list", { root: settings.notesRoot });
  const f = l.files.find((x) => x.rel === rel);
  if (f) notes.files[rel] = entry(rel, f.mtime, f.size, await invoke<string>("notes_read", { rel }));
}

function uniqueRel(folder: string, title: string) {
  const base = fileNameFor(title).replace(/\.md$/, "");
  for (let i = 1; ; i++) {
    const rel = `${folder ? folder + "/" : ""}${base}${i > 1 ? ` ${i}` : ""}.md`;
    if (!notes.files[rel]) return rel;
  }
}

/** Bring in a Markdown file from elsewhere (a guided note from Claude…) as it is, front matter
 *  and all, under its own file name (made unique in the folder). */
export async function importNote(folder: string, fileName: string, text: string): Promise<string> {
  const rel = uniqueRel(folder, fileName.replace(/\.(md|markdown|txt)$/i, "").trim() || "Imported note");
  await saveNote(rel, text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
  return rel;
}

export async function createNote(folder: string, title: string, template = "blank", meta: Meta = {}): Promise<string> {
  const t = TEMPLATES[template] ?? TEMPLATES.blank;
  const rel = uniqueRel(folder, title);
  const m: Meta = { ...meta, tags: [...new Set([...(meta.tags ?? []), ...(t.tags ?? [])])] };
  await saveNote(rel, joinNote(m, t.body(title)));
  if (folder && !notes.dirs.includes(folder)) notes.dirs = [...notes.dirs, folder].sort();
  return rel;
}

/** Rename a note's file, and update [[links]] to it in every other note. */
export async function renameNote(rel: string, title: string): Promise<string> {
  changed();
  const e = notes.files[rel];
  const to = `${dirOf(rel) ? dirOf(rel) + "/" : ""}${fileNameFor(title)}`;
  if (!e || to === rel) return rel;
  if (notes.files[to]) throw new Error(`A note called “${title}” is already in this folder.`);
  const oldName = linkName(e);
  if (inTauri) await invoke("notes_move", { from: rel, to });
  historyMoved(rel, to);
  delete notes.files[rel];
  notes.files[to] = entry(to, e.mtime, e.size, e.text);
  // keep the note's own heading in step when it was just the old name
  const first = e.p.headings.find((h) => h.level === 1);
  if (first && first.text.trim().toLowerCase() === oldName.toLowerCase()) {
    const { meta, body } = splitNote(e.text);
    const fixed = body.replace(/^#\s+.*$/m, `# ${title}`);
    await saveNote(to, joinNote(meta, fixed), inTauri ? undefined : undefined);
  }
  const newName = fileNameFor(title).replace(/\.md$/, "");
  for (const other of Object.values(notes.files)) {
    if (other.p.links.some((l) => linkKey(l) === linkKey(oldName))) await saveNote(other.rel, renameLinks(other.text, oldName, newName), other.mtime);
  }
  if (inTauri) await refreshNotes();
  return to;
}

export async function moveNote(rel: string, folder: string): Promise<string> {
  changed();
  const to = `${folder ? folder + "/" : ""}${fileOf(rel)}`;
  if (to === rel) return rel;
  if (notes.files[to]) throw new Error("A note with that name is already in that folder.");
  if (inTauri) await invoke("notes_move", { from: rel, to });
  historyMoved(rel, to);
  const e = notes.files[rel];
  delete notes.files[rel];
  notes.files[to] = entry(to, e.mtime, e.size, e.text);
  await rebase(to, depth(rel), depth(to));
  saveCache();
  return to;
}

const depth = (rel: string) => rel.split("/").length - 1;
/** keep a moved note's pasted images working (their paths are relative to the note) */
async function rebase(rel: string, from: number, to: number) {
  const e = notes.files[rel];
  if (!e || from === to) return;
  const t = rebaseAttachments(e.text, from, to);
  if (t !== e.text) await saveNote(rel, t, e.mtime).catch((err) => console.error("rebase images", err));
}

const under = (r: string, dir: string) => r === dir || r.startsWith(dir + "/");

/** Rename or move a folder (with everything in it). `to` is the folder's new path. */
export async function moveFolder(from: string, to: string): Promise<string> {
  changed();
  to = to.split("/").map((p) => p.replace(/[\\/:*?"<>|]+/g, " ").trim()).filter(Boolean).join("/");
  if (!to || to === from) return from;
  if (to.startsWith(from + "/")) throw new Error("A folder can't go inside itself.");
  if (notes.dirs.includes(to) || Object.keys(notes.files).some((r) => r.startsWith(to + "/")))
    throw new Error(`There's already a folder called “${to.split("/").pop()}” there.`);
  if (inTauri) await invoke("notes_move", { from, to });
  historyMoved(from, to, true);
  const next: Record<string, NoteEntry> = {};
  const moved: [string, string][] = [];
  for (const [r, e] of Object.entries(notes.files)) {
    if (!r.startsWith(from + "/")) next[r] = e;
    else {
      const nr = to + r.slice(from.length);
      next[nr] = entry(nr, e.mtime, e.size, e.text);
      moved.push([r, nr]);
    }
  }
  notes.files = next;
  notes.dirs = [...new Set([...notes.dirs.map((d) => (under(d, from) ? to + d.slice(from.length) : d)), to])].sort();
  for (const [a, b] of moved) await rebase(b, depth(a), depth(b));
  saveCache();
  return to;
}

/** Move a folder and everything in it to the notes folder's `.trash/`. */
// Deleting shows at once (Nov 19, her "a brief moment before it disappears": the move into .trash/
// on the Drive mount can take a while): the index changes first, the file moves after, and a
// failed move puts everything back before the error goes up.
export async function trashFolder(dir: string) {
  changed();
  const files = notes.files;
  const dirs = notes.dirs;
  notes.files = Object.fromEntries(Object.entries(files).filter(([r]) => !r.startsWith(dir + "/")));
  notes.dirs = dirs.filter((d) => !under(d, dir));
  try {
    if (inTauri) await invoke("notes_trash", { rel: dir });
  } catch (e) {
    notes.files = files;
    notes.dirs = dirs;
    throw e;
  } finally {
    saveCache();
  }
}

export async function trashNote(rel: string) {
  changed();
  const prev = notes.files[rel];
  delete notes.files[rel];
  try {
    if (inTauri) await invoke("notes_trash", { rel });
  } catch (e) {
    if (prev) notes.files[rel] = prev;
    throw e;
  } finally {
    saveCache();
  }
}

export async function makeFolder(rel: string) {
  changed();
  if (inTauri) await invoke("notes_mkdir", { rel });
  if (!notes.dirs.includes(rel)) notes.dirs = [...notes.dirs, rel].sort();
}

/** Save a pasted image next to the note's folder; returns the Markdown path to use. */
export async function savePastedImage(noteRel: string, dataUrl: string, ext: string): Promise<string> {
  const name = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const rel = `attachments/${name}`;
  if (inTauri) await invoke("notes_write_file", { rel, base64: dataUrl });
  const depth = dirOf(noteRel) ? dirOf(noteRel).split("/").length : 0;
  return `${"../".repeat(depth)}${rel}`;
}

/** URL for an image path written in a note. */
export function imageUrl(noteRel: string, src: string): string {
  if (/^(https?:|data:)/.test(src)) return src;
  const parts = [...(dirOf(noteRel) ? dirOf(noteRel).split("/") : []), ...src.split("/")];
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return `/__notes/${out.map(encodeURIComponent).join("/")}`;
}

// ---- class notes ----------------------------------------------------------------------

/** The note for one class (event occurrence), created from the lecture template if missing. */
export async function classNote(eventId: string, date: string, title: string, course?: string): Promise<string> {
  const key = `${eventId}@${date}`;
  const found = Object.values(notes.files).find((e) => e.p.meta.event === key);
  if (found) return found.rel;
  const folder = course ? fileNameFor(course).replace(/\.md$/, "") : "Class notes";
  return createNote(folder, `${date} ${title}`, "lecture", { course, date, event: key });
}

export const noteHref = (rel: string) => `#/study/notes/${rel.split("/").map(encodeURIComponent).join("/")}`;

// ---- preview data (plain browser only) ---------------------------------------------------

function loadSample() {
  const s: [string, string][] = [
    [
      "Therapeutics IV/Heart failure.md",
      joinNote({ course: "Therapeutics IV", tags: ["exam5", "cardio"] }, `# Heart failure\n\n## GDMT for HFrEF\n- Four pillars: ARNI/ACEi/ARB, evidence-based beta-blocker, MRA, SGLT2i\n  - ARNI :: sacubitril/valsartan\n  - Start {{SGLT2i}} regardless of diabetes status\n- See [[Arrhythmias]] for rate control in AF\n\n## Monitoring\n- K+ and SCr 1–2 weeks after starting an MRA #high-yield\n`),
    ],
    ["Therapeutics IV/Arrhythmias.md", joinNote({ course: "Therapeutics IV", tags: ["exam5"] }, `# Arrhythmias\n\n- Rate vs rhythm control\n- Anticoagulate per CHA2DS2-VASc, see [[Anticoagulation]]\n- Related: [[Heart failure]]\n`)],
    ["Drugs/Apixaban.md", joinNote({ tags: ["drug"] }, TEMPLATES.drug.body("Apixaban"))],
    // one of every card type, for trying the review screen in the browser preview
    [
      "Therapeutics IV/Bipolar.md",
      joinNote({ course: "Therapeutics IV", tags: ["exam5"] }, `# Bipolar\n\n## Mood stabilisers\n- Lithium therapeutic range? :: **0.6–1.2** mEq/L (acute mania up to 1.5)\n- Longest half-life SSRI, no taper needed ::: Fluoxetine\n- Lithium <:: first line for classic euphoric mania\n- Four domains: genetics, environment, {{neuro/endocrine}}, and autoimmunity\n- Lithium toxicity signs ::\n  - Coarse tremor\n  - Confusion, ataxia\n  - Vomiting, diarrhoea\n\n## Concepts\nValproate ;; anticonvulsant mood stabiliser; great for mixed episodes\n  - Boxed warnings ;;; hepatotoxicity, pancreatitis, teratogenicity\n  - Monitor ;;; LFTs, CBC (platelets), levels 50–125\n\n## Pregnancy and lactation\n:: table\n| Agent | Pregnancy | Lactation | Notes |\n| --- | --- | --- | --- |\n| Lithium | Avoid in 1st trimester | Infant sx: floppy baby | check levels |\n| Lamotrigine | Preferred option | Monitor infant rash | |\n`),
    ],
  ];
  notes.files = Object.fromEntries(s.map(([rel, t], i) => [rel, entry(rel, Date.now() - i * 3.6e6, t.length, t)]));
  notes.dirs = ["Drugs", "Therapeutics IV"];
  notes.root = settings.notesRoot;
  notes.loaded = true;
}

/** Folders she sees (lists, tiles, pickers): everything but `attachments`, where pasted images
 *  and card pictures are kept. The folder still exists on disk; it's only hidden in the app. */
export const isHiddenDir = (d: string) => d === "attachments" || d.startsWith("attachments/");
export const noteDirs = (): string[] => notes.dirs.filter((d) => !isHiddenDir(d));
