<script lang="ts">
  import { probe, setKey } from "../lib/labStorage";
  import { labs, refreshProgress, rescan } from "../lib/stores/labs.svelte";
  import { DEFAULT_SETTINGS, saveSettings, settings } from "../lib/stores/settings.svelte";
  import { inTauri } from "../lib/tauri";
  import { sync, syncNow } from "../lib/stores/synced.svelte";
  import { refreshNotes } from "../lib/stores/notes.svelte";
  import { refreshPdfs } from "../lib/stores/pdfs.svelte";

  let name = $state(settings.name);
  let root = $state(settings.labsRoot);
  let depth = $state(settings.scanDepth);
  let keywords = $state(settings.examKeywords);
  let syncOn = $state(settings.syncEnabled);
  let syncDir = $state(settings.syncDir);
  let notesRoot = $state(settings.notesRoot);
  let pdfRoot = $state(settings.pdfRoot);
  let pdfDepth = $state(settings.pdfDepth);
  let saved = $state(false);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const rootChanged = root.trim() !== settings.labsRoot || depth !== settings.scanDepth;
    const syncChanged = syncOn !== settings.syncEnabled || syncDir.trim() !== settings.syncDir;
    await saveSettings({
      name: name.trim() || DEFAULT_SETTINGS.name,
      labsRoot: root.trim() || DEFAULT_SETTINGS.labsRoot,
      scanDepth: depth,
      examKeywords: keywords.trim() || DEFAULT_SETTINGS.examKeywords,
      syncEnabled: syncOn,
      syncDir: syncDir.trim() || DEFAULT_SETTINGS.syncDir,
      notesRoot: notesRoot.trim() || DEFAULT_SETTINGS.notesRoot,
      pdfRoot: pdfRoot.trim() || DEFAULT_SETTINGS.pdfRoot,
      pdfDepth: Math.max(1, Math.min(12, Number(pdfDepth) || DEFAULT_SETTINGS.pdfDepth)),
    });
    void refreshNotes();
    void refreshPdfs();
    if (syncChanged) void syncNow();
    saved = true;
    setTimeout(() => (saved = false), 2000);
    if (rootChanged) await rescan();
  }

  let probeResult = $state<string | null>(null);
  async function checkStorage() {
    try {
      const prev = probe();
      probeResult = prev
        ? `Lab storage is working and kept its data from ${new Date(Number(prev)).toLocaleString()}.`
        : "Lab storage is working. Run this check again after restarting the app to confirm it keeps data.";
    } catch (e) {
      probeResult = `Lab storage problem: ${e instanceof Error ? e.message : e}`;
    }
  }

  const snippet = `copy(JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith("recallLab.")))))`;
  let importText = $state("");
  let importResult = $state<string | null>(null);
  async function importProgress() {
    importResult = null;
    try {
      const data = JSON.parse(importText);
      const keys = Object.keys(data).filter((k) => k.startsWith("recallLab."));
      if (!keys.length) throw new Error("No recallLab.* keys found in what you pasted.");
      const existing = keys.filter((k) => labs.storage[k] !== undefined);
      if (existing.length && !confirm(`${existing.length} of these labs already have progress in the app. Replace it with the pasted progress?`)) return;
      for (const k of keys) setKey(k, typeof data[k] === "string" ? data[k] : JSON.stringify(data[k]));
      refreshProgress();
      importResult = `Imported progress for ${keys.length} ${keys.length === 1 ? "lab" : "labs"}.`;
      importText = "";
    } catch (e) {
      importResult = `Couldn’t import: ${e instanceof Error ? e.message : e}`;
    }
  }
</script>

<div class="settings">
  <h1 class="display">Settings</h1>
  <p class="muted about">Mosaic · your student life in full view</p>

  <section class="card look" aria-labelledby="look-h">
    <h2 class="h2" id="look-h">Appearance</h2>
    <div class="themes" role="radiogroup" aria-label="Theme">
      {#each [{ id: "glass", name: "Frosted glass", note: "Soft colour behind frosted panels" }, { id: "pastel", name: "Pastel", note: "The original solid pastel look" }] as th}
        <button type="button" role="radio" aria-checked={settings.theme === th.id} class="theme" class:on={settings.theme === th.id} onclick={() => saveSettings({ theme: th.id as "glass" | "pastel" })}>
          <span class="swatch {th.id}" aria-hidden="true"><i></i><i></i><i></i></span>
          <b>{th.name}</b>
          <span class="muted small">{th.note}</span>
        </button>
      {/each}
    </div>
    <div class="field">
      <span class="label" id="density-l">Spacing</span>
      <div class="seg" role="radiogroup" aria-labelledby="density-l">
        {#each [{ id: "spacious", name: "Spacious" }, { id: "original", name: "Original" }, { id: "compact", name: "Compact" }] as d}
          <button type="button" role="radio" aria-checked={settings.density === d.id} class:on={settings.density === d.id} onclick={() => saveSettings({ density: d.id as "spacious" | "original" | "compact" })}>{d.name}</button>
        {/each}
      </div>
    </div>
  </section>

  <form class="card" onsubmit={save}>
    <h2 class="h2">You and your labs</h2>
    <label class="field">
      <span class="label">Your name</span>
      <input bind:value={name} autocomplete="given-name" />
    </label>
    <label class="field">
      <span class="label">Recall Labs folder</span>
      <input bind:value={root} spellcheck="false" />
      <span class="hint muted">Every folder inside becomes a dashboard. “~” means your home folder.</span>
    </label>
    <label class="field">
      <span class="label">How many folder levels to scan</span>
      <input type="number" min="1" max="8" bind:value={depth} />
      <span class="hint muted">Lower is faster on the Drive mount.</span>
    </label>
    <label class="field">
      <span class="label">Notes folder</span>
      <input bind:value={notesRoot} spellcheck="false" />
      <span class="hint muted">Your notes are Markdown files here, so they also open in any other app.</span>
    </label>
    <label class="field">
      <span class="label">PDF folder</span>
      <input bind:value={pdfRoot} spellcheck="false" />
      <span class="hint muted">Study → PDFs lists every PDF in here and its subfolders. Annotations are saved into the PDF; the untouched original is kept once in a hidden “.studydesk-originals” folder.</span>
    </label>
    <label class="field">
      <span class="label">How many folder levels to search for PDFs</span>
      <input type="number" min="1" max="12" bind:value={pdfDepth} />
    </label>
    <label class="field">
      <span class="label">Words that mark an exam</span>
      <input bind:value={keywords} spellcheck="false" />
      <span class="hint muted">Separate with commas, e.g. “Exam, Quiz, Final”. Events of type Other with these words count as exams.</span>
    </label>

    <h2 class="h2">Sync between your computers</h2>
    <label class="check"><input type="checkbox" bind:checked={syncOn} /> Sync through Google Drive</label>
    <label class="field">
      <span class="label">Sync folder</span>
      <input bind:value={syncDir} spellcheck="false" disabled={!syncOn} />
      <span class="hint muted">Use the same folder on your PC and laptop. Each computer writes its own file here and reads the others.</span>
    </label>
    <div class="row">
      <button class="btn primary" type="submit">Save</button>
      {#if saved}<span class="muted">Saved</span>{/if}
    </div>
  </form>

  <section class="card">
    <h2 class="h2">Sync status</h2>
    {#if !settings.syncEnabled}
      <p class="muted">Sync is off. Everything stays on this computer.</p>
    {:else}
      <p class:bad={sync.status === "error"}>
        {#if sync.status === "error"}
          Couldn’t sync: {sync.error}
        {:else if sync.status === "syncing"}
          Syncing…
        {:else if sync.lastSync}
          Last synced {new Date(sync.lastSync).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
        {:else}
          Not synced yet.
        {/if}
      </p>
      <p class="muted">
        This computer: <b>{sync.host || "—"}</b>.
        {#if sync.others.length}
          Also syncing: {sync.others.map((o) => `${o.host} (last saved ${new Date(o.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})`).join(", ")}.
        {:else}
          No other computer has synced yet.
        {/if}
      </p>
      <p class="muted hint">Syncs your calendar, Recall Lab progress, folder links and study days. Changes made on the other computer can take a minute or two to appear, depending on rclone.</p>
      <div class="row">
        <button class="btn" type="button" onclick={() => syncNow()} disabled={!inTauri || sync.status === "syncing"}>Sync now</button>
      </div>
    {/if}
  </section>

  <section class="card">
    <h2 class="h2">Lab storage</h2>
    <p class="muted">
      Last scan: {labs.scannedAt ? new Date(labs.scannedAt * 1000).toLocaleString() : "never"}.
      {Object.keys(labs.storage).length} labs have saved progress in the app.
    </p>
    <div class="row">
      <button class="btn" type="button" onclick={() => rescan()} disabled={!inTauri || labs.scanning}>{labs.scanning ? "Scanning…" : "Rescan now"}</button>
      <button class="btn" type="button" onclick={checkStorage} disabled={!inTauri}>Check lab storage</button>
    </div>
    {#if probeResult}<p class="result">{probeResult}</p>{/if}
  </section>

  <section class="card">
    <h2 class="h2">Bring over progress from your browser</h2>
    <p class="muted">
      If you used your labs in a web browser before, that progress lives in the browser. To copy it here: open a lab in the
      browser, press F12, choose Console, paste this line and press Enter. It copies your progress to the clipboard.
    </p>
    <pre><code>{snippet}</code></pre>
    <label class="field">
      <span class="label">Paste it here</span>
      <textarea bind:value={importText} rows="4" spellcheck="false"></textarea>
    </label>
    <div class="row">
      <button class="btn primary" type="button" onclick={importProgress} disabled={!inTauri || !importText.trim()}>Import progress</button>
    </div>
    {#if importResult}<p class="result">{importResult}</p>{/if}
  </section>
</div>

<style>
  .about {
    margin: -8px 0 4px;
  }
  .look {
    display: grid;
    gap: 16px;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }
  .theme {
    display: grid;
    gap: 4px;
    justify-items: start;
    padding: 14px;
    border: 0;
    border-radius: 20px;
    background: var(--chip);
    text-align: left;
  }
  .theme:hover {
    transform: translateY(-2px);
  }
  .theme.on {
    background: var(--surface);
    box-shadow: 0 0 0 2px var(--primary), var(--shadow);
  }
  .small {
    font-size: 13px;
  }
  .swatch {
    position: relative;
    width: 100%;
    height: 64px;
    border-radius: 14px;
    margin-bottom: 6px;
    overflow: hidden;
  }
  .swatch.glass {
    background: radial-gradient(60% 80% at 15% 20%, #ffd6e4, transparent 70%), radial-gradient(60% 80% at 90% 10%, #d5e1ff, transparent 70%), radial-gradient(60% 80% at 80% 100%, #cff2e6, transparent 70%), #f2f1f8;
  }
  .swatch.pastel {
    background: linear-gradient(135deg, #ecd2cf, #f1e2d6 48%, #d9e6de);
  }
  .swatch i {
    position: absolute;
    top: 14px;
    width: 30%;
    height: 36px;
    border-radius: 10px;
  }
  .swatch.glass i {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.85);
  }
  .swatch.pastel i {
    background: #fffdfb;
  }
  .swatch i:nth-child(1) { left: 6%; }
  .swatch i:nth-child(2) { left: 38%; }
  .swatch i:nth-child(3) { left: 70%; }
  .seg {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--chip);
    justify-self: start;
  }
  .seg button {
    min-height: 40px;
    padding: 0 18px;
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    font-weight: 500;
    color: var(--text-muted);
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .settings {
    display: grid;
    gap: var(--gap);
    max-width: 720px;
  }
  h1 {
    font-size: 34px;
    font-weight: 600;
    padding: 0 4px;
  }
  .card {
    display: grid;
    gap: 14px;
  }
  .field {
    display: grid;
    gap: 6px;
  }
  input,
  textarea {
    min-height: var(--hit);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--panel);
    padding: 10px 14px;
    font: inherit;
    color: inherit;
  }
  .hint {
    font-size: 13.5px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  pre {
    margin: 0;
    background: var(--panel);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 13px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: var(--hit);
    cursor: pointer;
  }
  .check input {
    width: 20px;
    height: 20px;
    min-height: 0;
    accent-color: var(--sage-deep);
  }
  input:disabled {
    opacity: 0.6;
  }
  .bad {
    background: var(--rose-soft);
    color: #8f3b45;
    border-radius: var(--radius-sm);
    padding: 10px 14px;
  }
  .result {
    background: var(--sage-soft);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
  }
</style>
