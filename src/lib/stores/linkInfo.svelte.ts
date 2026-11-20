// What the course hub shows for a linked item: its kind, name, a short progress line and where it
// opens. Also every item that can be linked, for the Add picker. Kept apart from outline.svelte.ts
// (which only stores links) so the srs store can import that one without loops.
import { allCards } from "./srs.svelte";
import { notes, noteHref } from "./notes.svelte";
import { courseOfPdf, pdfHref, pdfInfo, pdfName, pdfs } from "./pdfs.svelte";
import { folderHref, inherited, labHref, labs, parentRel, progressOf, type Folder, type Item } from "./labs.svelte";
import { quizSummary } from "./quizzes.svelte";
import { decks, getDeck } from "./decks.svelte";
import type { Link } from "./outline.svelte";

/** quiz and interactive page are files in Materials, told apart for the hub */
export type ShowKind = "note" | "pdf" | "quiz" | "page" | "file" | "deck";
export type Shown = { link: Link; kind: ShowKind; name: string; sub: string; href: string; course?: string; tone?: "rose" | "sage" | "peach"; gone?: boolean; done?: number; mtime?: number };

export const KIND_NAMES: Record<ShowKind, string> = { note: "Note", pdf: "PDF", quiz: "Quiz", page: "Interactive page", file: "File", deck: "Deck" };
export const KIND_ICONS: Record<ShowKind, string> = { note: "note", pdf: "file", quiz: "i:circle-help", page: "i:app-window", file: "folder", deck: "cards" };

/** cards per note in one pass: total and due now (new ones count as to learn) */
export function noteCardStats() {
  const now = Date.now();
  const m = new Map<string, { total: number; due: number }>();
  for (const r of allCards()) {
    if (!r.note) continue;
    const s = m.get(r.note.rel) ?? { total: 0, due: 0 };
    s.total++;
    if (r.rec && !r.rec.suspended && r.rec.due <= now) s.due++;
    m.set(r.note.rel, s);
  }
  return m;
}

/** every Materials file by path */
function materialItems(): Map<string, Item> {
  const m = new Map<string, Item>();
  const walk = (f: Folder) => {
    for (const i of f.items) m.set(i.rel, i);
    f.folders.forEach(walk);
  };
  if (labs.tree) walk(labs.tree);
  return m;
}
const fileKind = (i: Item): ShowKind => (i.kind === "lab" ? "page" : i.mat?.kind === "quiz" ? "quiz" : /\.html?$/i.test(i.name) ? "page" : "file");
const stripExt = (n: string) => n.replace(/\.[^.]+$/, "");

export function describe(link: Link, stats = noteCardStats(), mats = materialItems()): Shown {
  if (link.kind === "note") {
    const e = notes.files[link.ref];
    if (!e) return { link, kind: "note", name: stripExt(link.ref.split("/").pop() ?? link.ref), sub: "Not found", href: "", gone: true };
    const s = stats.get(link.ref);
    return {
      link, kind: "note", name: e.p.title, href: noteHref(link.ref), mtime: e.mtime, course: e.p.meta.course ? String(e.p.meta.course) : undefined,
      sub: s?.due ? `${s.due} due` : s?.total ? `${s.total} ${s.total === 1 ? "card" : "cards"}` : "",
      tone: s?.due ? "rose" : undefined,
    };
  }
  if (link.kind === "pdf") {
    const i = pdfInfo(link.ref);
    const f = pdfs.files.find((x) => x.rel === link.ref);
    const here = !!f;
    const sub = !here ? "Not found" : i?.opened && i.pages ? `p. ${i.page} of ${i.pages}` : i?.opened ? `p. ${i.page}` : "Not opened";
    return { link, kind: "pdf", name: pdfName(link.ref), sub, href: here ? pdfHref(link.ref, i?.page) : "", course: courseOfPdf(link.ref), gone: !here, mtime: f?.mtime, done: i?.pages ? i.page / i.pages : undefined };
  }
  if (link.kind === "deck") {
    const d = getDeck(link.ref);
    return { link, kind: "deck", name: d?.name ?? "Deleted deck", sub: d ? "" : "Not found", href: d ? `#/study/cards/deck/deck:${link.ref}` : "", gone: !d, course: d?.courses?.length === 1 ? d.courses[0] : undefined };
  }
  const it = mats.get(link.ref);
  if (!it) return { link, kind: /\.html?$/i.test(link.ref) ? "page" : "file", name: stripExt(link.ref.split("/").pop() ?? link.ref), sub: "Not found", href: "", gone: true };
  const kind = fileKind(it);
  const mtime = it.mtime;
  const course = it.mat?.course ?? inherited(parentRel(it.rel), "course") ?? undefined;
  if (kind === "quiz" && it.mat) {
    const q = quizSummary(it.mat.id);
    return { link, kind, name: it.mat.title || stripExt(it.name), href: labHref(it.rel), course, mtime, sub: q.best !== null ? `best ${q.best}%` : q.attempts ? `last ${q.last}%` : `${it.mat.count} questions`, tone: q.best !== null ? (q.best >= 80 ? "sage" : "peach") : undefined };
  }
  if (kind === "page") {
    const p = progressOf(it.lab);
    return { link, kind, name: it.lab?.title || stripExt(it.name), href: labHref(it.rel), course, mtime, sub: p.avgBest !== null ? `${p.avgBest}%` : "Not tried", tone: p.avgBest !== null ? (p.avgBest >= 80 ? "sage" : "peach") : undefined };
  }
  return { link, kind, name: it.name, href: folderHref(parentRel(it.rel)), course, mtime, sub: "" };
}

/** Everything that can be linked, newest first per kind (for the Add picker). */
export function candidates(): Shown[] {
  const stats = noteCardStats();
  const mats = materialItems();
  const out: Shown[] = [];
  for (const e of Object.values(notes.files).sort((a, b) => b.mtime - a.mtime)) if (!e.rel.startsWith("attachments/")) out.push(describe({ kind: "note", ref: e.rel }, stats, mats));
  for (const f of [...pdfs.files].sort((a, b) => b.mtime - a.mtime)) out.push(describe({ kind: "pdf", ref: f.rel }, stats, mats));
  for (const i of [...mats.values()].sort((a, b) => b.mtime - a.mtime)) out.push(describe({ kind: "file", ref: i.rel }, stats, mats));
  for (const [id] of decks()) out.push(describe({ kind: "deck", ref: id }, stats, mats));
  return out;
}
export { materialItems };
