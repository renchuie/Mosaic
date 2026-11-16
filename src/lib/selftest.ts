// Prints what the app sees to stdout, for checking a build without clicking around.
import { probe, readAll } from "./labStorage";
import { labs, labsIn, rescan } from "./stores/labs.svelte";
import { invoke, log } from "./tauri";
import { entries, sync, syncNow } from "./stores/synced.svelte";
import { exams } from "./stores/calendar.svelte";
import { addBlock, clock, completeBlock, getPlan, spent, startBlock } from "./stores/plan.svelte";
import { todayKey } from "./calendar";
import { notes, refreshNotes } from "./stores/notes.svelte";

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
    log(`selftest done (${ms()})`);
  } catch (e) {
    log(`selftest error: ${e} (${ms()})`);
  }
  setTimeout(() => void invoke("debug_quit"), 1500);
}
