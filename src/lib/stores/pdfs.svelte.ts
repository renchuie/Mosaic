// PDFs (Study → PDFs): every PDF under the PDF folder (default the whole school folder
// on Drive), listed by Rust and cached locally so the list shows instantly. Per-PDF
// reading state (last page, when opened, how many annotations) is in the synced
// collection "pdfState", so the laptop opens a PDF where the PC left it.
import { fileNameFor } from "../notes";
import { inTauri, invoke, loadDoc, saveDoc } from "../tauri";
import { courses } from "./courses.svelte";
import { createNote, getNote, notes, saveNote } from "./notes.svelte";
import { entries, get, put } from "./synced.svelte";
import { settings } from "./settings.svelte";

export type PdfEntry = { rel: string; mtime: number; size: number };
export type PdfInfo = { page: number; opened: number; annots: number; pages?: number };

export const pdfs = $state({
  root: "",
  files: [] as PdfEntry[],
  loaded: false,
  loading: false,
  error: null as string | null,
});

export const pdfName = (rel: string) => rel.split("/").pop()!.replace(/\.pdf$/i, "");
export const pdfDir = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
const enc = (rel: string) => rel.split("/").map(encodeURIComponent).join("/");
export const pdfUrl = (rel: string) => `/__pdfs/${enc(rel)}`;
export const pdfHref = (rel: string, page?: number) => `#/study/pdfs/${enc(rel)}${page ? `?p=${page}` : ""}`;
/** "#/study/pdfs/<rel>?p=3" → rel and page (route.rest is already decoded). */
export function parsePdfRoute(rest: string): { rel: string; page?: number } {
  const m = /\?p=(\d+)$/.exec(rest);
  return m ? { rel: rest.slice(0, m.index), page: Number(m[1]) } : { rel: rest };
}
/** Text for a note link to a page: [[folder/file.pdf#p3|file, p. 3]] */
export const pdfLink = (rel: string, page?: number) => `[[${rel}${page ? `#p${page}` : ""}|${pdfName(rel)}${page ? `, p. ${page}` : ""}]]`;
/** A [[…pdf#p3]] link target → its PDF and page. A bare file name finds the PDF anywhere. */
export function resolvePdfLink(target: string): { rel: string; page?: number } | null {
  const m = /^(.*?\.pdf)\s*(?:#p?(\d+))?$/i.exec(target.trim());
  if (!m) return null;
  const want = m[1].toLowerCase();
  const hit = pdfs.files.find((f) => f.rel.toLowerCase() === want) ?? pdfs.files.find((f) => f.rel.toLowerCase().endsWith("/" + want.split("/").pop()));
  return { rel: hit?.rel ?? m[1], page: m[2] ? Number(m[2]) : undefined };
}

export async function initPdfs() {
  if (inTauri) {
    const c = await loadDoc<{ root: string; files: PdfEntry[] }>("pdfs-cache");
    if (c?.files) {
      pdfs.root = c.root;
      pdfs.files = c.files;
      pdfs.loaded = true;
    }
  }
  void refreshPdfs();
}

let running: Promise<void> | null = null;
export function refreshPdfs(): Promise<void> {
  running ??= doRefresh().finally(() => (running = null));
  return running;
}
async function doRefresh() {
  pdfs.loading = true;
  try {
    const r = inTauri
      ? await invoke<{ root: string; files: PdfEntry[] }>("pdfs_list", { root: settings.pdfRoot, depth: settings.pdfDepth })
      : await fetch("/__pdfs-list").then((x) => (x.ok ? x.json() : { root: "", files: [] }));
    pdfs.root = r.root;
    pdfs.files = r.files;
    pdfs.error = null;
    pdfs.loaded = true;
    if (inTauri) void saveDoc("pdfs-cache", r);
  } catch (e) {
    pdfs.error = String(e);
    pdfs.loaded = true;
  } finally {
    pdfs.loading = false;
  }
}

export const pdfInfo = (rel: string) => get<PdfInfo>("pdfState", rel);
export function setPdfInfo(rel: string, patch: Partial<PdfInfo>) {
  const cur = pdfInfo(rel) ?? { page: 1, opened: 0, annots: 0 };
  const next = { ...cur, ...patch };
  if (JSON.stringify(next) !== JSON.stringify(cur)) put("pdfState", rel, next);
}
export const recentPdfs = (n = 8) =>
  entries<PdfInfo>("pdfState")
    .filter(([rel, i]) => i.opened && pdfs.files.some((f) => f.rel === rel))
    .sort((a, b) => b[1].opened - a[1].opened)
    .slice(0, n);

/** A PDF belongs to a course when a folder on its path is named after it (name or short name). */
export function courseOfPdf(rel: string): string | undefined {
  const parts = rel.toLowerCase().split("/").slice(0, -1);
  for (const [, c] of courses(true)) {
    const keys = [c.name, c.code].filter(Boolean).map((k) => k!.toLowerCase());
    if (parts.some((p) => keys.some((k) => p === k || p.startsWith(k + " ") || p.endsWith(" " + k)))) return c.name;
  }
  return undefined;
}
export const pdfsForCourse = (name: string) => pdfs.files.filter((f) => courseOfPdf(f.rel) === name);

// ---- reading and writing -------------------------------------------------------------------

/** In a plain-browser preview there's no disk: saved PDFs live in memory. */
const memory = new Map<string, Uint8Array>();

export async function readPdf(rel: string): Promise<{ bytes: Uint8Array; mtime: number; backed: boolean }> {
  const mem = memory.get(rel);
  if (mem) return { bytes: mem, mtime: 0, backed: true };
  const res = await fetch(pdfUrl(rel), { cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 404 ? "This PDF isn't there any more." : `Could not open the PDF (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const [mtime, backed] = inTauri ? await invoke<[number, boolean]>("pdfs_stat", { rel }) : [0, false];
  return { bytes, mtime, backed };
}

/** Write the PDF; "conflict" if it changed on disk since `expected`. Returns the new mtime. */
export async function writePdf(rel: string, bytes: Uint8Array, expected: number): Promise<number> {
  if (!inTauri) {
    memory.set(rel, bytes);
    return 0;
  }
  return invoke<number>("pdfs_write", bytes, {
    headers: { "x-rel": encodeURIComponent(rel), "x-expected": String(expected) },
  });
}

/** Add a new PDF at `rel` (never over an existing file); the list is refreshed after. */
export async function addPdf(rel: string, bytes: Uint8Array): Promise<void> {
  if (!inTauri) {
    memory.set(rel, bytes);
    pdfs.files = [...pdfs.files, { rel, mtime: Date.now(), size: bytes.length }];
    return;
  }
  await invoke<number>("pdfs_add", bytes, { headers: { "x-rel": encodeURIComponent(rel) } });
  await refreshPdfs();
}

export async function restorePdf(rel: string): Promise<void> {
  if (!inTauri) {
    memory.delete(rel);
    return;
  }
  await invoke("pdfs_restore", { rel });
}

// ---- notes about a PDF -----------------------------------------------------------------------

/** The note for a PDF (front matter `pdf: <rel>`), created on first use next to its course's notes. */
export async function pdfNote(rel: string): Promise<string> {
  const found = Object.values(notes.files).find((e) => e.p.meta.pdf === rel);
  if (found) return found.rel;
  const course = courseOfPdf(rel);
  const folder = course ? fileNameFor(course).replace(/\.md$/, "") : "PDF notes";
  const r = await createNote(folder, `${pdfName(rel)} notes`, "blank", { course, pdf: rel });
  const e = getNote(r);
  if (e) await saveNote(r, e.text.trimEnd() + `\n\nNotes on ${pdfLink(rel)}.\n`, e.mtime);
  return r;
}

/** Add text to the end of a note (with the usual conflict check). */
export async function appendToNote(noteRel: string, text: string): Promise<void> {
  const e = getNote(noteRel);
  if (!e) throw new Error("That note isn't there any more.");
  await saveNote(noteRel, e.text.replace(/\s*$/, "") + "\n\n" + text.trim() + "\n", e.mtime);
}

/** A highlight as a Markdown quote with a link back to its page. */
export function quoteFor(rel: string, page: number, text: string, comment?: string): string {
  const q = text.replace(/\s+/g, " ").trim();
  return `> ${q}\n> — ${pdfLink(rel, page)}${comment ? `\n\n${comment.trim()}` : ""}`;
}
