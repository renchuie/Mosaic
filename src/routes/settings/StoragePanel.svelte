<script lang="ts">
  // "Where your files live" (Nov 18; Nov 19 "a synced folder" for any service): a Mosaic folder in
  // a folder that a sync service keeps in step (Google Drive, Dropbox, OneDrive, iCloud Drive or any
  // other), or a vault on this computer only. Both hold Notes / Materials / PDFs; the synced one
  // also holds Sync (app data) and Backups. "Your own folders" = the original custom Drive paths.
  // Switching asks each time whether to copy the files over (never overwriting, never deleting)
  // and whether the app data (flashcard progress, calendar, tasks, courses) keeps syncing.
  import { DEFAULT_SETTINGS, saveSettings, settings } from "../../lib/stores/settings.svelte";
  import { inTauri, invoke } from "../../lib/tauri";
  import { refreshNotes } from "../../lib/stores/notes.svelte";
  import { refreshPdfs } from "../../lib/stores/pdfs.svelte";
  import { rescan } from "../../lib/stores/labs.svelte";
  import { syncNow } from "../../lib/stores/synced.svelte";
  import Icon from "../../lib/components/Icon.svelte";

  let { onchanged }: { onchanged: () => void } = $props();

  type DirList = { path: string; parent: string | null; home: string; dirs: string[] };
  type Report = { copied: number; skipped: number; failed: number };

  const local = $derived(settings.storage === "local" && !!settings.vault);
  const synced = $derived(settings.storage === "synced" && !!settings.vault);
  const custom = $derived(!local && !synced);
  let dialog = $state<HTMLDialogElement>();
  let to = $state<"local" | "drive" | "synced">("local");

  // ---- a synced folder: where each service keeps its folder, first match wins ----
  const SERVICES: { id: string; name: string; paths: string[] }[] = [
    { id: "gdrive", name: "Google Drive", paths: ["~/GoogleDrive", "~/Google Drive", "~/My Drive", "G:\\My Drive", "~/Library/CloudStorage/GoogleDrive"] },
    { id: "dropbox", name: "Dropbox", paths: ["~/Dropbox", "~/Library/CloudStorage/Dropbox"] },
    { id: "onedrive", name: "OneDrive", paths: ["~/OneDrive", "~/Library/CloudStorage/OneDrive"] },
    { id: "icloud", name: "iCloud Drive", paths: ["~/iCloudDrive", "~/Library/Mobile Documents/com~apple~CloudDocs"] },
    { id: "other", name: "Other", paths: [] },
  ];
  let service = $state("gdrive");
  let notFound = $state(false);
  let existing = $state(false);
  async function pickService(id: string) {
    service = id;
    notFound = false;
    const s = SERVICES.find((x) => x.id === id)!;
    if (!s.paths.length) {
      picking = true;
      return void browse(place);
    }
    const info = inTauri ? await invoke<{ path: string; dir: boolean }[]>("paths_info", { paths: s.paths }).catch(() => []) : [];
    const hit = info.find((i) => i.dir);
    if (hit) place = hit.path;
    else notFound = true;
  }
  // a folder that already has Mosaic in it (the other computer made it): use what's there
  $effect(() => {
    const t = target;
    if (to !== "synced" || !inTauri) return void (existing = false);
    void invoke<{ path: string; dir: boolean }[]>("paths_info", { paths: [`${t}/Notes`] }).then((r) => {
      existing = !!r[0]?.dir;
      if (existing) copy = false;
    });
  });
  let name = $state("Mosaic");
  let place = $state("~");
  let copy = $state(true);
  let keepSync = $state(true);
  let busy = $state("");
  let done = $state("");
  let error = $state("");

  // the in-app folder picker (no native dialog needed, same on Windows)
  let picking = $state(false);
  let list = $state<DirList | null>(null);
  let home = $state("");
  const tilde = (p: string) => (home && (p === home || p.startsWith(home + "/") || p.startsWith(home + "\\")) ? "~" + p.slice(home.length) : p);
  const SAMPLE: DirList = { path: "/home/you", parent: "/home", home: "/home/you", dirs: ["Desktop", "Documents", "Downloads", "GoogleDrive", "Pictures"] };
  async function browse(p: string) {
    error = "";
    try {
      list = inTauri ? await invoke<DirList>("vault_dirs", { path: p }) : { ...SAMPLE, path: p === "~" || !p ? SAMPLE.path : p };
      home = list.home;
      place = tilde(list.path);
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
    }
  }
  const join = (dir: string, n: string) => (dir.endsWith("/") || dir.endsWith("\\") ? dir + n : `${dir}/${n}`);
  const cleanName = $derived(name.replace(/[\\/:*?"<>|]+/g, " ").trim());
  const target = $derived(join(place, cleanName || "Mosaic"));
  const drive = $derived(settings.driveRoots ?? { notesRoot: DEFAULT_SETTINGS.notesRoot, labsRoot: DEFAULT_SETTINGS.labsRoot, pdfRoot: DEFAULT_SETTINGS.pdfRoot, syncEnabled: true });

  function start(where: "local" | "drive" | "synced") {
    // learn the home folder so paths show as "~/…" (and are saved that way)
    if (!home && inTauri) void invoke<DirList>("vault_dirs", { path: "~" }).then((l) => (home = l.home)).catch(() => {});
    to = where;
    busy = done = error = "";
    picking = false;
    copy = true;
    keepSync = where === "drive" ? true : settings.syncEnabled;
    if (where === "synced") {
      name = "Mosaic";
      place = "~";
      void pickService(service === "other" ? "gdrive" : service);
    } else if (where === "local") {
      const v = settings.vault;
      if (v) {
        const i = Math.max(v.lastIndexOf("/"), v.lastIndexOf("\\"));
        place = i > 0 ? v.slice(0, i) : "~";
        name = v.slice(i + 1) || "Mosaic";
      } else {
        place = "~";
        name = "Mosaic";
      }
    }
    dialog?.showModal();
  }

  async function copyAll(pairs: [string, string, boolean][]) {
    const total: Report = { copied: 0, skipped: 0, failed: 0 };
    for (const [from, dest, onlyPdf] of pairs) {
      busy = `Copying ${dest.split(/[\\/]/).pop()}… (big Drive folders can take a while)`;
      if (!inTauri) continue;
      const r = await invoke<Report>("vault_copy", { from, to: dest, onlyPdf });
      total.copied += r.copied;
      total.skipped += r.skipped;
      total.failed += r.failed;
    }
    return total;
  }
  const summary = (r: Report) =>
    `Copied ${r.copied} ${r.copied === 1 ? "file" : "files"}` +
    (r.skipped ? `, ${r.skipped} already there (kept as they were)` : "") +
    (r.failed ? `, ${r.failed} couldn't be copied` : "") + ".";

  /** the folders in use now, to copy from (and to come back to) */
  const roots = () => ({ notesRoot: settings.notesRoot, labsRoot: settings.labsRoot, pdfRoot: settings.pdfRoot, syncEnabled: settings.syncEnabled });
  async function go() {
    error = done = "";
    try {
      if (to === "synced") {
        if (!cleanName) return (error = "Give the folder a name.");
        busy = "Setting up the folder…";
        const made = inTauri ? await invoke<string>("vault_create", { path: target }) : target;
        const v = tilde(made);
        let report: Report | null = null;
        if (copy && !existing) {
          report = await copyAll([
            [settings.notesRoot, `${v}/Notes`, false],
            [settings.labsRoot, `${v}/Materials`, false],
            [settings.pdfRoot, `${v}/PDFs`, true],
          ]);
        }
        await saveSettings({
          driveRoots: custom ? roots() : settings.driveRoots,
          storage: "synced",
          vault: v,
          notesRoot: `${v}/Notes`,
          labsRoot: `${v}/Materials`,
          pdfRoot: `${v}/PDFs`,
          syncEnabled: true,
          syncDir: `${v}/Sync`,
          backupDrive: settings.backupDrive ? `${v}/Backups` : "",
        });
        done = (report ? summary(report) + " " : "") + `Using ${v}. On your other computer, pick the same folder.`;
      } else if (to === "local") {
        if (!cleanName) return (error = "Give the vault folder a name.");
        busy = "Making the vault…";
        const made = inTauri ? await invoke<string>("vault_create", { path: target }) : target;
        const v = tilde(made);
        let report: Report | null = null;
        if (copy) {
          report = await copyAll([
            [settings.notesRoot, `${v}/Notes`, false],
            [settings.labsRoot, `${v}/Materials`, false],
            [settings.pdfRoot, `${v}/PDFs`, true],
          ]);
        }
        await saveSettings({
          driveRoots: custom ? roots() : settings.driveRoots,
          storage: "local",
          vault: v,
          notesRoot: `${v}/Notes`,
          labsRoot: `${v}/Materials`,
          pdfRoot: `${v}/PDFs`,
          syncEnabled: keepSync,
        });
        done = (report ? summary(report) + " " : "") + `Your vault is ${v}.`;
      } else {
        let report: Report | null = null;
        if (copy && settings.vault) {
          const v = settings.vault;
          report = await copyAll([
            [`${v}/Notes`, drive.notesRoot, false],
            [`${v}/Materials`, drive.labsRoot, false],
            [`${v}/PDFs`, drive.pdfRoot, true],
          ]);
        }
        await saveSettings({ storage: "drive", notesRoot: drive.notesRoot, labsRoot: drive.labsRoot, pdfRoot: drive.pdfRoot, syncEnabled: keepSync });
        done = (report ? summary(report) + " " : "") + "Back to your own folders.";
      }
      busy = "";
      onchanged();
      void refreshNotes();
      void refreshPdfs();
      void rescan();
      if (settings.syncEnabled) void syncNow();
    } catch (e) {
      busy = "";
      error = String(e instanceof Error ? e.message : e);
    }
  }
  function openVault() {
    if (inTauri && settings.vault) void invoke("vault_open", { path: settings.vault }).catch((e) => (error = String(e)));
  }
</script>

<section class="card storage">
  <h2 class="h2">Where your files live</h2>
  <div class="opts">
    <div class="opt" class:on={!local}>
      <span class="ic" aria-hidden="true"><Icon name="cloud" size={20} /></span>
      <div class="txt">
        <b>A synced folder</b>
        <span>Google Drive, Dropbox, OneDrive, iCloud or any synced folder.</span>
        {#if synced}<span class="path">{settings.vault}</span>{:else if custom}<span class="path">Your own folders · {settings.notesRoot}</span>{/if}
      </div>
      {#if !local}<span class="pill">In use</span>{:else}<button type="button" class="btn quiet sm" onclick={() => start("synced")}>Set up…</button>{/if}
    </div>
    <div class="opt" class:on={local}>
      <span class="ic" aria-hidden="true"><Icon name="laptop" size={20} /></span>
      <div class="txt">
        <b>This computer only</b>
        <span>Nothing leaves this computer.</span>
        {#if local}<span class="path">{settings.vault} · app data {settings.syncEnabled ? "syncs" : "stays here"}</span>{/if}
      </div>
      {#if local}
        <span class="pill">In use</span>
      {:else}
        <button type="button" class="btn quiet sm" onclick={() => start("local")}>Switch…</button>
      {/if}
    </div>
  </div>
  {#if !local}
    <div class="row-btns">
      {#if settings.vault && synced}<button type="button" class="btn quiet sm" onclick={openVault} disabled={!inTauri}>Open the folder</button>{/if}
      <button type="button" class="btn quiet sm" onclick={() => start("synced")}>{synced ? "Use another synced folder…" : "Use one Mosaic folder…"}</button>
      {#if synced && settings.driveRoots}<button type="button" class="btn quiet sm" onclick={() => start("drive")}>Back to my own folders</button>{/if}
    </div>
  {/if}
  {#if local}
    <div class="row-btns">
      <button type="button" class="btn quiet sm" onclick={openVault} disabled={!inTauri}>Open the vault folder</button>
      <button type="button" class="btn quiet sm" onclick={() => start("local")}>Use another folder…</button>
      <button type="button" class="btn quiet sm" onclick={() => start(settings.driveRoots ? "drive" : "synced")}>{settings.driveRoots ? "Back to my own folders" : "Use a synced folder…"}</button>
    </div>
  {/if}
</section>

<dialog bind:this={dialog} aria-labelledby="st-h" onclose={() => (picking = false)}>
  <div class="dlg">
    {#if to === "synced"}
      <h2 id="st-h" class="h2">Use a synced folder</h2>
      <div class="svc" role="radiogroup" aria-label="Service">
        {#each SERVICES as sv}
          <button type="button" role="radio" aria-checked={service === sv.id} class:on={service === sv.id} disabled={!!busy || !!done} onclick={() => pickService(sv.id)}>{sv.name}</button>
        {/each}
      </div>
      {#if notFound}<p class="hint muted">Couldn't find a {SERVICES.find((x) => x.id === service)?.name} folder. Pick it below.</p>{/if}
      <label class="field"><span class="label">Folder name</span><input class="input" bind:value={name} placeholder="Mosaic" disabled={!!busy || !!done} /></label>
      <div class="field">
        <span class="label">Inside</span>
        <div class="where">
          <code>{tilde(place)}</code>
          <button type="button" class="btn quiet sm" disabled={!!busy || !!done} onclick={() => { picking = !picking; if (picking) void browse(place); }}>{picking ? "Done" : "Change…"}</button>
        </div>
        {#if picking && list}
          <div class="picker">
            <div class="pbar">
              <button type="button" class="pb" disabled={!list.parent} onclick={() => list?.parent && browse(list.parent)}>‹ Up</button>
              <button type="button" class="pb" onclick={() => browse("~")}>Home</button>
              <span class="cur">{tilde(list.path)}</span>
            </div>
            <ul>
              {#each list.dirs as d}<li><button type="button" onclick={() => list && browse(join(list.path, d))}><Icon name="folder" size={15} /> {d}</button></li>{:else}<li class="muted none">No folders in here.</li>{/each}
            </ul>
          </div>
        {/if}
        <span class="hint muted"><b>{tilde(target)}</b>{existing ? " already has Mosaic files: they'll be used." : ""}</span>
      </div>
      {#if !existing}
        <fieldset class="field" disabled={!!busy || !!done}>
          <span class="label">Your files</span>
          <label class="radio"><input type="radio" bind:group={copy} value={true} /> <span><b>Copy them in</b><em>The old folders keep theirs.</em></span></label>
          <label class="radio"><input type="radio" bind:group={copy} value={false} /> <span><b>Start empty</b></span></label>
        </fieldset>
      {/if}
    {:else if to === "local"}
      <h2 id="st-h" class="h2">{local ? "Use another vault folder" : "Make a local vault"}</h2>
      <label class="field"><span class="label">Folder name</span><input class="input" bind:value={name} placeholder="Mosaic" disabled={!!busy || !!done} /></label>
      <div class="field">
        <span class="label">Inside</span>
        <div class="where">
          <code>{place}</code>
          <button type="button" class="btn quiet sm" disabled={!!busy || !!done} onclick={() => { picking = !picking; if (picking) void browse(place); }}>{picking ? "Done" : "Change…"}</button>
        </div>
        {#if picking && list}
          <div class="picker">
            <div class="pbar">
              <button type="button" class="pb" disabled={!list.parent} onclick={() => list?.parent && browse(list.parent)}>‹ Up</button>
              <button type="button" class="pb" onclick={() => browse("~")}>Home</button>
              <span class="cur">{tilde(list.path)}</span>
            </div>
            <ul>
              {#each list.dirs as d}<li><button type="button" onclick={() => list && browse(join(list.path, d))}><Icon name="folder" size={15} /> {d}</button></li>{:else}<li class="muted none">No folders in here.</li>{/each}
            </ul>
          </div>
        {/if}
        <span class="hint muted">The vault will be <b>{target}</b></span>
      </div>
      <fieldset class="field" disabled={!!busy || !!done}>
        <span class="label">Your files</span>
        <label class="radio"><input type="radio" bind:group={copy} value={true} /> <span><b>Copy my notes, materials and PDFs into the vault</b><em>{local ? "Your current vault keeps its copy." : "The old folders keep theirs."}</em></span></label>
        <label class="radio"><input type="radio" bind:group={copy} value={false} /> <span><b>Start empty</b><em>The old files stay where they are.</em></span></label>
      </fieldset>
    {:else}
      <h2 id="st-h" class="h2">Back to your own folders</h2>
      <p class="muted"><code>{drive.notesRoot}</code>, <code>{drive.labsRoot}</code> and <code>{drive.pdfRoot}</code>.</p>
      <fieldset class="field" disabled={!!busy || !!done}>
        <span class="label">What you made in the vault</span>
        <label class="radio"><input type="radio" bind:group={copy} value={true} /> <span><b>Copy it into Drive</b><em>Nothing is overwritten.</em></span></label>
        <label class="radio"><input type="radio" bind:group={copy} value={false} /> <span><b>Just switch</b><em>The vault folder stays on this computer untouched.</em></span></label>
      </fieldset>
    {/if}
    {#if to !== "synced"}
      <label class="check"><input type="checkbox" bind:checked={keepSync} disabled={!!busy || !!done} /> Keep syncing app data</label>
    {/if}
    {#if busy}<p class="busy">{busy}</p>{/if}
    {#if done}<p class="ok">{done}</p>{/if}
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <footer>
      {#if done}
        <button type="button" class="btn primary" onclick={() => dialog?.close()}>Done</button>
      {:else}
        <button type="button" class="btn quiet" disabled={!!busy} onclick={() => dialog?.close()}>Cancel</button>
        <button type="button" class="btn primary" disabled={!!busy} onclick={go}>{to === "drive" ? "Switch back" : "Use this folder"}</button>
      {/if}
    </footer>
  </div>
</dialog>

<style>
  .svc {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .svc button {
    min-height: 34px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: var(--chip);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }
  .svc button.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .opts {
    display: grid;
    gap: 10px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 18px;
    background: var(--panel);
  }
  .opt.on {
    background: color-mix(in srgb, var(--accent) 16%, var(--white));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .ic {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: 13px;
    background: var(--chip);
    color: var(--text-muted);
  }
  .opt.on .ic {
    background: var(--surface);
    color: var(--text);
  }
  .txt {
    flex: 1;
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .txt span {
    font-size: 13.5px;
    color: var(--muted-on-tint);
  }
  .txt .path {
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }
  .pill {
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--ink-on-color);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  .sm {
    min-height: 36px;
    padding: 0 14px;
    font-size: 13.5px;
  }
  .row-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  dialog {
    width: min(540px, calc(100vw - 24px));
    border: 0;
    border-radius: var(--radius);
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  .dlg {
    display: grid;
    gap: 14px;
    padding: 22px;
  }
  .dlg .h2,
  .dlg p {
    margin: 0;
  }
  .field {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .where {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .where code {
    flex: 1;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--field);
    overflow-wrap: anywhere;
  }
  .picker {
    border-radius: 14px;
    background: var(--panel);
    padding: 6px;
  }
  .pbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 2px 6px;
  }
  .pb {
    min-height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: var(--surface);
    font: inherit;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
  }
  .pb:disabled {
    opacity: 0.4;
  }
  .cur {
    font-size: 12.5px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .picker ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
  }
  .picker li button {
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: none;
    font: inherit;
    font-size: 14px;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .picker li button:hover {
    background: var(--surface);
  }
  .none {
    padding: 8px 10px;
    font-size: 13px;
  }
  .radio {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--panel);
    cursor: pointer;
  }
  .radio:has(input:checked) {
    background: color-mix(in srgb, var(--accent) 16%, var(--white));
  }
  .radio input {
    margin-top: 3px;
  }
  .radio span {
    display: grid;
    gap: 2px;
    font-size: 14px;
  }
  .radio em {
    font-style: normal;
    font-size: 12.5px;
    color: var(--muted-on-tint);
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 14px;
  }
  .check input {
    margin-top: 3px;
  }
  .hint {
    font-size: 12.5px;
  }
  .busy {
    color: var(--text-muted);
  }
  .ok {
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--sage-soft);
    color: var(--text);
  }
  .err {
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--rose-soft);
    color: var(--alert-ink);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
