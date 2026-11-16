<script lang="ts">
  import { probe, setKey } from "../lib/labStorage";
  import { labs, refreshProgress, rescan } from "../lib/stores/labs.svelte";
  import { DEFAULT_SETTINGS, saveSettings, settings } from "../lib/stores/settings.svelte";
  import { inTauri } from "../lib/tauri";

  let name = $state(settings.name);
  let root = $state(settings.labsRoot);
  let depth = $state(settings.scanDepth);
  let saved = $state(false);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const rootChanged = root.trim() !== settings.labsRoot || depth !== settings.scanDepth;
    await saveSettings({ name: name.trim() || DEFAULT_SETTINGS.name, labsRoot: root.trim() || DEFAULT_SETTINGS.labsRoot, scanDepth: depth });
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
    <div class="row">
      <button class="btn primary" type="submit">Save</button>
      {#if saved}<span class="muted">Saved</span>{/if}
    </div>
  </form>

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
  .result {
    background: var(--sage-soft);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
  }
</style>
