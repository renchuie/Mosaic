// The parts of start-up that read or create the user's folders (notes, PDFs, backups, the
// "folder isn't connected" check). On a fresh install they wait until onboarding has picked
// where the files live, so no empty ~/Mosaic is made for someone who chooses a synced folder.
import { initNotes } from "./notes.svelte";
import { initPdfs } from "./pdfs.svelte";
import { initBackups } from "./backup.svelte";
import { initConnection } from "./connection.svelte";
import { rescan } from "./labs.svelte";

let started = false;
export async function startFiles(afterSetup = false) {
  if (started) return;
  started = true;
  if (afterSetup) void rescan();
  await initNotes().catch((e) => console.error("notes", e));
  void initPdfs().catch((e) => console.error("pdfs", e));
  initBackups();
  initConnection();
}
