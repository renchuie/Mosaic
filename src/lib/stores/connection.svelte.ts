// Is the notes folder there? (Nov 19, Week 2 "Trust": when Drive / Dropbox / … isn't mounted, some
// pages just looked empty, which is scary.) Checked at start, on window focus and every minute;
// App shows one calm banner while it's missing. Nothing is written while it's gone: the Rust side
// already refuses to create folders under a missing mount.
import { settings } from "./settings.svelte";
import { inTauri, invoke } from "../tauri";
import { refreshNotes } from "./notes.svelte";

export const connection = $state({ notesMissing: false, syncMissing: false, checked: 0 });

type PathInfo = { path: string; dir: boolean };
const parentOf = (p: string) => p.replace(/[\\/]+$/, "").replace(/[\\/][^\\/]*$/, "");

export async function checkFolders(): Promise<void> {
  if (!inTauri) return;
  const wasMissing = connection.notesMissing;
  const paths = [settings.notesRoot, settings.syncEnabled ? parentOf(settings.syncDir) : ""].filter(Boolean);
  try {
    const info = await invoke<PathInfo[]>("paths_info", { paths });
    const has = (p: string) => !!info.find((i) => i.path === p)?.dir;
    connection.notesMissing = !has(settings.notesRoot);
    connection.syncMissing = settings.syncEnabled && !has(parentOf(settings.syncDir));
    connection.checked = Date.now();
    if (wasMissing && !connection.notesMissing) void refreshNotes(); // back: catch up
  } catch {
    // leave the last answer
  }
}

export function initConnection() {
  if (!inTauri) return;
  setTimeout(() => void checkFolders(), 1500);
  window.addEventListener("focus", () => void checkFolders());
  setInterval(() => void checkFolders(), 60_000);
}
