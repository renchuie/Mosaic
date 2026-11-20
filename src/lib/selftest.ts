// Prints what the app sees to stdout, for checking a build without clicking around.
import { probe, readAll } from "./labStorage";
import { adoptMaterials, findFolder, labs, labsIn, rescan } from "./stores/labs.svelte";
import { settings } from "./stores/settings.svelte";
import { invoke, log } from "./tauri";
import { entries, sync, syncNow } from "./stores/synced.svelte";
import { exams } from "./stores/calendar.svelte";
import { addBlock, clock, completeBlock, getPlan, spent, startBlock } from "./stores/plan.svelte";
import { todayKey } from "./calendar";
import { notes, refreshNotes } from "./stores/notes.svelte";
import { counts, ensureIds } from "./stores/srs.svelte";
import { pdfs, readPdf, refreshPdfs, writePdf } from "./stores/pdfs.svelte";
import { newAnnotId, readAnnots, writeAnnots, type Rect } from "./pdfAnnots";

/** Run 1 starts a timer and quits; run 2 shows it kept counting across the restart, then finishes it. */
export async function timerTest() {
  const d = todayKey();
  const b = getPlan(d).blocks.find((x) => x.title === "Selftest block" && !x.done);
  if (!b) {
    const id = addBlock(d, { title: "Selftest block", minutes: 25 });
    startBlock(d, id);
    log(`timer started on ${id}`);
  } else {
    log(`timer after restart: running=${!!clock.timer?.startedAt} spent=${Math.round(spent(d, b) / 1000)}s`);
    completeBlock(d, b.id);
    log(`completed; done=${getPlan(d).blocks.find((x) => x.id === b.id)?.done} spentMs=${getPlan(d).blocks.find((x) => x.id === b.id)?.spentMs}`);
  }
  setTimeout(() => void invoke("debug_quit"), 6000);
}

export async function selfTest() {
  const t0 = performance.now();
  const ms = () => `${Math.round(performance.now() - t0)}ms`;
  try {
    log(`storage probe previous=${probe()} (${ms()})`);
    await rescan();
    log(`root=${labs.root} error=${labs.error}`);
    for (const l of labsIn(labs.tree)) {
      log(`lab "${l.lab.title}" slug=${l.lab.slug} guessed=${l.lab.slug_guessed} rel=${l.item.rel}`);
    }
    const all = readAll();
    for (const [k, v] of Object.entries(all)) log(`storage ${k} = ${v.slice(0, 120)}`);
    await syncNow();
    log(`sync status=${sync.status} error=${sync.error} machine=${sync.machine} others=${JSON.stringify(sync.others)}`);
    log(`events=${entries("events").length} folders=${JSON.stringify(entries("folders"))} days=${entries("days").length} labOpens=${entries("labOpens").length}`);
    log(`exams=${exams().map((e) => `${e.title}@${e.date}`).join(", ")}`);
    log(`storage keys after sync=${Object.keys(readAll()).join(", ")}`);
    await refreshNotes();
    log(`notes root=${notes.root} error=${notes.error} files=${Object.keys(notes.files).join(" | ")} dirs=${notes.dirs.join(" | ")}`);
    const hf = Object.values(notes.files).find((n) => n.p.title === "Heart failure");
    if (hf) log(`HF links=${hf.p.links.join(",")} tags=${hf.p.tags.join(",")} course=${hf.p.meta.course}`);
    const added = await ensureIds();
    const k = counts();
    log(`cards: ids added=${added} total=${k.total} new=${k.new} due=${k.due} newToday=${k.newToday}`);
    log(`selftest done (${ms()})`);
  } catch (e) {
    log(`selftest error: ${e} (${ms()})`);
  }
  setTimeout(() => void invoke("debug_quit"), 1500);
}

/** PDFs: list, read through /__pdfs/, save a highlight into the file (raw IPC), read it back, conflict check. */
export async function pdfTest() {
  try {
    await refreshPdfs();
    log(`pdfs: root=${pdfs.root} files=${pdfs.files.length} error=${pdfs.error}`);
    const f = pdfs.files.find((x) => x.rel.includes("Controlled")) ?? pdfs.files[0];
    if (!f) throw new Error("no PDFs");
    const r = await readPdf(f.rel);
    const a = await readAnnots(r.bytes);
    log(`read ${f.rel}: ${r.bytes.length} bytes, mtime ${r.mtime}, backed=${r.backed}, pages=${a.pages}, marks=${a.annots.length}`);
    const mark = { id: newAnnotId(), page: 0, kind: "highlight" as const, color: "#ffe17a", rects: [[50, 690, 300, 705]] as Rect[], text: "selftest", created: Date.now() };
    const bytes = await writeAnnots(r.bytes, [...a.annots, mark]);
    const m2 = await writePdf(f.rel, bytes, r.mtime);
    const back = await readPdf(f.rel);
    const a2 = await readAnnots(back.bytes);
    log(`saved: mtime ${m2}, backed=${back.backed}, marks now=${a2.annots.length}, has selftest=${a2.annots.some((x) => x.id === mark.id)}`);
    const conflict = await writePdf(f.rel, bytes, r.mtime).then(() => "no conflict!", (e) => String(e));
    log(`stale write: ${conflict}`);
  } catch (e) {
    log(`pdf test failed: ${e}`);
  }
  setTimeout(() => void invoke("debug_quit"), 800);
}

/** Materials: is the old Recall Labs folder found, does moving it keep labs and progress keys? */
export async function materialsTest() {
  try {
    const before = labsIn(labs.tree).map((l) => l.lab.slug).sort();
    log(`materials: root=${settings.labsRoot} legacy=${labs.legacy} labs=${before.length}`);
    if (labs.legacy) {
      const r = await adoptMaterials();
      const after = labsIn(labs.tree).map((l) => l.lab.slug).sort();
      log(`moved=${r.moved} skipped=${r.skipped.join("|") || "none"} root now=${settings.labsRoot} labs=${after.length} same slugs=${JSON.stringify(before) === JSON.stringify(after)}`);
    }
    const info = await invoke<{ path: string; dir: boolean; marker: boolean }[]>("paths_info", { paths: [settings.labsRoot] });
    log(`marker in Materials: ${info[0]?.marker}`);
    await invoke("materials_write", { rel: "Selftest/upload.html", content: '<meta name="recall-lab-version" content="1"><title>Selftest upload</title>', replace: true });
    await rescan();
    log(`upload found after rescan: ${!!findFolder("Selftest")?.items.some((i) => i.lab?.title === "Selftest upload")}`);
    const clash = await invoke("materials_write", { rel: "Selftest/upload.html", content: "x" }).then(() => "overwrote!", (e) => String(e));
    log(`second write without replace: ${clash}`);
  } catch (e) {
    log(`materials test failed: ${e}`);
  }
  setTimeout(() => void invoke("debug_quit"), 800);
}

/** Files (Nov 20): rename / move / duplicate / delete in the PDF and Materials folders, and that
 *  PDF state, lecture links and stars follow. STUDYDESK_ROUTE=selftest-files */
export async function filesTest() {
  const ops = await import("./stores/fileOps.svelte");
  const outline = await import("./stores/outline.svelte");
  const { get, put } = await import("./stores/synced.svelte");
  try {
    await refreshPdfs();
    await rescan();
    const pdf = pdfs.files[0]?.rel;
    log(`files: pdfs=${pdfs.files.length} dirs=${pdfs.dirs.length} first=${pdf}`);
    if (pdf) {
      put("pdfState", pdf, { page: 3, opened: Date.now(), annots: 0, pages: 9 });
      const lec = outline.addLecture("Selftest", "", "Selftest lecture");
      outline.addLinks(lec, [{ kind: "pdf", ref: pdf }]);
      outline.toggleStar({ kind: "pdf", ref: pdf });
      const made = await ops.newFolder("pdf", "", "Selftest folder");
      log(`new folder: ${made} in dirs=${pdfs.dirs.includes(made ?? "")}`);
      await ops.moveItem("pdf", pdf, "Selftest folder");
      const moved = `Selftest folder/${ops.baseName(pdf)}`;
      log(`moved: listed=${pdfs.files.some((f) => f.rel === moved)} state page=${(get("pdfState", moved) as { page?: number })?.page} link=${outline.getLecture(lec)?.links[0]?.ref === moved} star=${outline.isStarred({ kind: "pdf", ref: moved })}`);
      await ops.renameItem("pdf", moved, "Renamed selftest");
      const renamed = "Selftest folder/Renamed selftest.pdf";
      log(`renamed: listed=${pdfs.files.some((f) => f.rel === renamed)} link=${outline.getLecture(lec)?.links[0]?.ref}`);
      const dup = await ops.duplicateItem("pdf", renamed);
      log(`duplicate: ${dup} listed=${pdfs.files.some((f) => f.rel === dup)}`);
      await ops.renameFolder("pdf", "Selftest folder", "Selftest folder 2");
      log(`folder renamed: ${pdfs.files.filter((f) => f.rel.startsWith("Selftest folder 2/")).length} files inside, link=${outline.getLecture(lec)?.links[0]?.ref}`);
      await ops.moveItem("pdf", "Selftest folder 2/Renamed selftest.pdf", "");
      await ops.renameItem("pdf", "Renamed selftest.pdf", ops.baseName(pdf).replace(/\.pdf$/i, ""));
      log(`back home: ${pdfs.files.some((f) => f.rel === ops.baseName(pdf))} link=${outline.getLecture(lec)?.links[0]?.ref}`);
      await ops.trashFolder("pdf", "Selftest folder 2");
      log(`folder deleted: dirs has it=${pdfs.dirs.includes("Selftest folder 2")}`);
      outline.deleteLecture(lec);
    }
    await invoke("materials_write", { rel: "Selftest/page.html", content: '<meta name="recall-lab-version" content="1"><title>Selftest page</title>', replace: true });
    await rescan();
    await ops.moveItem("mat", "Selftest/page.html", "");
    log(`mat moved: ${!!findFolder("")?.items.some((i) => i.rel === "page.html")}`);
    await ops.trashItem("mat", "page.html");
    await ops.trashFolder("mat", "Selftest");
    log(`mat deleted: ${!findFolder("")?.items.some((i) => i.rel === "page.html")}`);
    const clash = await invoke("files_move", { area: "pdf", from: "nope.pdf", to: "../x.pdf" }).then(() => "allowed!", (e) => String(e));
    log(`escape refused: ${clash}`);
    log(`message: ${ops.files.msg}`);
  } catch (e) {
    log(`files test failed: ${e}`);
  }
  setTimeout(() => void invoke("debug_quit"), 800);
}
