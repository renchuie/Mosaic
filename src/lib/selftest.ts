// Prints what the app sees to stdout, for checking a build without clicking around.
import { probe, readAll } from "./labStorage";
import { labs, labsIn, rescan } from "./stores/labs.svelte";
import { invoke, log } from "./tauri";
import { entries, sync, syncNow } from "./stores/synced.svelte";
import { exams } from "./stores/calendar.svelte";

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
    log(`selftest done (${ms()})`);
  } catch (e) {
    log(`selftest error: ${e} (${ms()})`);
  }
  setTimeout(() => void invoke("debug_quit"), 1500);
}
