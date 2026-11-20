// Adding files from outside (drop or Upload) on Files or a lecture page. PDFs go to the PDF folder,
// plain notes to the notes folder (both under a folder named after the course when there is one),
// and quizzes (.md with `mosaic:` front matter) and interactive pages (.html) are handed back for
// the Materials upload dialog, which checks them and asks about replacing.
import { addPdf, pdfs } from "./pdfs.svelte";
import { importNote } from "./notes.svelte";
import { fileNameFor, joinNote, splitNote } from "../notes";
import { safeName } from "../materials";
import type { Link } from "./outline.svelte";

export type Added = { links: Link[]; toUpload: File[]; skipped: string[] };

export async function addFiles(list: File[], course?: { name: string; code?: string }): Promise<Added> {
  const out: Added = { links: [], toUpload: [], skipped: [] };
  const dir = course ? safeName(course.code || course.name) : "";
  for (const f of list) {
    if (/\.pdf$/i.test(f.name)) {
      const taken = new Set(pdfs.files.map((x) => x.rel));
      const base = safeName(f.name.replace(/\.pdf$/i, "")) || "PDF";
      const at = (n: number) => `${dir ? dir + "/" : ""}${base}${n > 1 ? ` (${n})` : ""}.pdf`;
      let n = 1;
      while (taken.has(at(n))) n++;
      await addPdf(at(n), new Uint8Array(await f.arrayBuffer()));
      out.links.push({ kind: "pdf", ref: at(n) });
    } else if (/\.(md|markdown|txt)$/i.test(f.name)) {
      const text = await f.text();
      const { meta, body } = splitNote(text);
      if (meta.mosaic) out.toUpload.push(f);
      else {
        const withCourse = course && !meta.course ? joinNote({ ...meta, course: course.name }, body) : text;
        const rel = await importNote(course ? fileNameFor(course.name).replace(/\.md$/, "") : "", f.name, withCourse);
        out.links.push({ kind: "note", ref: rel });
      }
    } else if (/\.html?$/i.test(f.name)) out.toUpload.push(f);
    else out.skipped.push(f.name);
  }
  return out;
}

export const addedMessage = (r: Added, where?: string) =>
  [r.links.length ? `Added ${r.links.length}${where ? ` to ${where}` : ""}` : "", r.skipped.length ? `Skipped ${r.skipped.join(", ")}` : ""].filter(Boolean).join(". ");
