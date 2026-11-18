<script lang="ts">
  import { probe, setKey } from "../lib/labStorage";
  import { labs, refreshProgress, rescan } from "../lib/stores/labs.svelte";
  import { ARROW_COLOURS, CLOZE_COLOURS, DEFAULT_SETTINGS, saveSettings, settings } from "../lib/stores/settings.svelte";
  import { styleManager } from "../lib/stores/blockStyles.svelte";
  import { FAMILIES, THEMES } from "../lib/themes";
  import { inTauri } from "../lib/tauri";
  import { sync, syncNow } from "../lib/stores/synced.svelte";
  import { refreshNotes } from "../lib/stores/notes.svelte";
  import { refreshPdfs } from "../lib/stores/pdfs.svelte";
  import StoragePanel from "./settings/StoragePanel.svelte";

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
    {#each FAMILIES as fam (fam.id)}
      <div class="tgroup">
        <div class="tgh"><b>{fam.name}</b><span class="muted small">{fam.note}</span></div>
        <div class="themes" role="radiogroup" aria-label="{fam.name} themes">
          {#each THEMES.filter((t) => t.family === fam.id) as th (th.id)}
            {@const p = th.preview}
            <button type="button" role="radio" aria-checked={settings.theme === th.id} class="theme" class:on={settings.theme === th.id} onclick={() => saveSettings({ theme: th.id })}>
              <span class="thumb" style="background: {p.bg}" aria-hidden="true">
                <span class="trail" style="background: {p.panel}"><i style="background: {p.text}"></i><i></i><i></i></span>
                <span class="tpanel" style="background: {p.panel}; --tx: {p.text}">
                  <b></b><i style="width: 80%"></i>
                  <span class="tcard"><i style="width: 34%"></i><em style="background: {p.accent}"></em><i style="width: 26%"></i></span>
                  <i style="width: 60%"></i><u style="background: {p.hl}"></u>
                </span>
              </span>
              <span class="tn"><b>{th.name}</b>{#if settings.theme === th.id}<span class="chk" aria-hidden="true">✓</span>{/if}</span>
              <span class="muted small">{th.note}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
    <div class="field">
      <span class="label" id="frame-l">Window</span>
      <div class="seg" role="radiogroup" aria-labelledby="frame-l">
        {#each [{ id: "curve", name: "Curve" }, { id: "sheet", name: "Glass rail" }, { id: "float", name: "Floating" }] as f}
          <button type="button" role="radio" aria-checked={(settings.frame ?? "curve") === f.id} class:on={(settings.frame ?? "curve") === f.id} onclick={() => saveSettings({ frame: f.id as "curve" | "sheet" | "float" })}>{f.name}</button>
        {/each}
      </div>
    </div>
    <div class="field">
      <span class="label" id="density-l">Spacing</span>
      <div class="seg" role="radiogroup" aria-labelledby="density-l">
        {#each [{ id: "spacious", name: "Spacious" }, { id: "original", name: "Original" }, { id: "compact", name: "Compact" }] as d}
          <button type="button" role="radio" aria-checked={settings.density === d.id} class:on={settings.density === d.id} onclick={() => saveSettings({ density: d.id as "spacious" | "original" | "compact" })}>{d.name}</button>
        {/each}
      </div>
    </div>
    <h3 class="sub">Notes</h3>
    <div class="field">
      <span class="label" id="nhead-l">Header</span>
      <div class="seg" role="radiogroup" aria-labelledby="nhead-l">
        <button type="button" role="radio" aria-checked={settings.noteHeader !== "full"} class:on={settings.noteHeader !== "full"} onclick={() => saveSettings({ noteHeader: "compact" })}>Compact</button>
        <button type="button" role="radio" aria-checked={settings.noteHeader === "full"} class:on={settings.noteHeader === "full"} onclick={() => saveSettings({ noteHeader: "full" })}>Full</button>
      </div>
      <span class="hint muted">Compact is one line: icon, title and chips. Full has a big icon and title with the chips and toolbar under it. A note can have its own in its ⋯ menu.</span>
    </div>
    <div class="field">
      <span class="label" id="nwidth-l">Page width</span>
      <div class="seg" role="radiogroup" aria-labelledby="nwidth-l">
        {#each [{ id: "readable", name: "Readable" }, { id: "wide", name: "Wide" }, { id: "full", name: "Full" }] as w}
          <button type="button" role="radio" aria-checked={(settings.noteWidth ?? "readable") === w.id} class:on={(settings.noteWidth ?? "readable") === w.id} onclick={() => saveSettings({ noteWidth: w.id as "readable" | "wide" | "full" })}>{w.name}</button>
        {/each}
      </div>
      <span class="hint muted">Notes you haven't set a width on use this. Picking a width in a note's top bar keeps it for that note.</span>
    </div>
    <div class="field">
      <span class="label" id="nopen-l">Open notes as</span>
      <div class="seg" role="radiogroup" aria-labelledby="nopen-l">
        <button type="button" role="radio" aria-checked={settings.noteOpen !== "markdown"} class:on={settings.noteOpen !== "markdown"} onclick={() => saveSettings({ noteOpen: "page" })}>Mosaic page</button>
        <button type="button" role="radio" aria-checked={settings.noteOpen === "markdown"} class:on={settings.noteOpen === "markdown"} onclick={() => saveSettings({ noteOpen: "markdown" })}>Markdown</button>
      </div>
      <span class="hint muted">The <code>&lt;&gt;</code> chip in a note still switches between them.</span>
    </div>
    <div class="field">
      <span class="label" id="ntools-l">Formatting toolbar</span>
      <div class="seg" role="radiogroup" aria-labelledby="ntools-l">
        <button type="button" role="radio" aria-checked={!settings.noteTools} class:on={!settings.noteTools} onclick={() => saveSettings({ noteTools: false })}>While I type</button>
        <button type="button" role="radio" aria-checked={!!settings.noteTools} class:on={!!settings.noteTools} onclick={() => saveSettings({ noteTools: true })}>Always</button>
      </div>
    </div>
    <h3 class="sub">Flashcard review</h3>
    <div class="field">
      <span class="label" id="calign-l">Card text</span>
      <div class="seg" role="radiogroup" aria-labelledby="calign-l">
        <button type="button" role="radio" aria-checked={settings.cardAlign !== "center"} class:on={settings.cardAlign !== "center"} onclick={() => saveSettings({ cardAlign: "left" })}>Left</button>
        <button type="button" role="radio" aria-checked={settings.cardAlign === "center"} class:on={settings.cardAlign === "center"} onclick={() => saveSettings({ cardAlign: "center" })}>Centred</button>
      </div>
    </div>
    <div class="field">
      <span class="label" id="cscratch-l">Scratchpad</span>
      <div class="seg" role="radiogroup" aria-labelledby="cscratch-l">
        <button type="button" role="radio" aria-checked={!settings.cardScratch} class:on={!settings.cardScratch} onclick={() => saveSettings({ cardScratch: false })}>Off</button>
        <button type="button" role="radio" aria-checked={!!settings.cardScratch} class:on={!!settings.cardScratch} onclick={() => saveSettings({ cardScratch: true })}>Write before I see the answer</button>
      </div>
    </div>
    <h3 class="sub">Flashcards in notes</h3>
    <div class="field">
      <span class="label" id="cardbg-l">Card lines</span>
      <div class="seg" role="radiogroup" aria-labelledby="cardbg-l">
        <button type="button" role="radio" aria-checked={settings.cardBg !== false} class:on={settings.cardBg !== false} onclick={() => saveSettings({ cardBg: true })}>Soft background</button>
        <button type="button" role="radio" aria-checked={settings.cardBg === false} class:on={settings.cardBg === false} onclick={() => saveSettings({ cardBg: false })}>Plain, arrow only</button>
      </div>
    </div>
    <div class="field">
      <span class="label" id="arrow-l">Arrow colour</span>
      <div class="swatches" role="radiogroup" aria-labelledby="arrow-l">
        {#each Object.entries(ARROW_COLOURS) as [k, [one, two]]}
          <button type="button" role="radio" aria-checked={settings.arrowColor === k} class:on={settings.arrowColor === k} title={k === "theme" ? "Follow the theme" : k === "mosaic" ? "Mosaic (pink and periwinkle)" : k} aria-label={k}
            onclick={() => saveSettings({ arrowColor: k })}>{#if k === "theme"}<i class="cz">Theme</i>{:else}<i style="background: {one}">→</i><i style="background: {two}">⇄</i>{/if}</button>
        {/each}
      </div>
    </div>
    <div class="field">
      <span class="label" id="cloze-l">Cloze colour</span>
      <div class="swatches" role="radiogroup" aria-labelledby="cloze-l">
        {#each Object.entries(CLOZE_COLOURS) as [k, [fill, line]]}
          <button type="button" role="radio" aria-checked={settings.clozeColor === k} class:on={settings.clozeColor === k} title={k} aria-label={k}
            onclick={() => saveSettings({ clozeColor: k })}>{#if k === "theme"}<i class="cz">Theme</i>{:else}<i class="cz" style="background: {fill}; box-shadow: inset 0 -2px 0 {line}">cloze</i>{/if}</button>
        {/each}
      </div>
    </div>
    <h3 class="sub">Callouts, quotes and highlights</h3>
    <div class="field">
      <span class="hint muted">Your callout types (colours, icons, your own), how quotes look, and your highlight colours and palettes.</span>
      <div class="row-btns">
        <button type="button" class="btn quiet" onclick={() => { styleManager.tab = "callouts"; styleManager.open = true; }}>Callouts…</button>
        <button type="button" class="btn quiet" onclick={() => { styleManager.tab = "quotes"; styleManager.open = true; }}>Quotes…</button>
        <button type="button" class="btn quiet" onclick={() => { styleManager.tab = "highlights"; styleManager.open = true; }}>Highlights…</button>
      </div>
    </div>
  </section>

  <StoragePanel onchanged={() => { root = settings.labsRoot; notesRoot = settings.notesRoot; pdfRoot = settings.pdfRoot; syncOn = settings.syncEnabled; }} />

  <form class="card" onsubmit={save}>
    <h2 class="h2">You and your labs</h2>
    <label class="field">
      <span class="label">Your name</span>
      <input bind:value={name} autocomplete="given-name" />
    </label>
    <label class="field">
      <span class="label">Materials folder</span>
      <input bind:value={root} spellcheck="false" />
      <span class="hint muted">Recall labs and everything else you make live here. Every folder inside becomes a dashboard. “~” means your home folder.</span>
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
  .tgroup {
    display: grid;
    gap: 10px;
  }
  .tgh {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .tgh b {
    font-size: 15px;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  .theme {
    display: grid;
    gap: 5px;
    padding: 8px 8px 10px;
    border: 0;
    border-radius: 18px;
    background: var(--chip);
    text-align: left;
    color: var(--text);
    cursor: pointer;
  }
  .theme:hover {
    transform: translateY(-2px);
  }
  .theme.on {
    background: var(--surface);
    box-shadow: 0 0 0 2px var(--primary), var(--shadow);
  }
  .small {
    font-size: 12.5px;
  }
  .thumb {
    display: flex;
    gap: 6px;
    height: 96px;
    padding: 8px;
    border-radius: 12px;
    box-sizing: border-box;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.15);
  }
  .trail {
    width: 16px;
    border-radius: 7px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 5px 0;
    box-shadow: 0 0 0 1px rgba(127, 127, 127, 0.15);
  }
  .trail i {
    width: 8px;
    height: 8px;
    border-radius: 3px;
    background: rgba(127, 127, 127, 0.35);
  }
  .tpanel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px;
    border-radius: 8px;
    box-shadow: 0 0 0 1px rgba(127, 127, 127, 0.15);
  }
  .tpanel b {
    width: 50%;
    height: 7px;
    border-radius: 3px;
    background: var(--tx);
  }
  .tpanel i {
    display: block;
    height: 4px;
    border-radius: 2px;
    background: var(--tx);
    opacity: 0.35;
  }
  .tcard {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .tcard em {
    width: 14px;
    height: 8px;
    border-radius: 999px;
  }
  .tpanel u {
    display: block;
    width: 40%;
    height: 7px;
    border-radius: 2px;
  }
  .tn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px;
    font-size: 14px;
  }
  .theme > .small {
    padding: 0 4px;
  }
  .chk {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--on-primary);
    font-size: 11px;
  }
  .row-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .sub {
    margin: 18px 0 4px;
    font-size: 15px;
    font-weight: 600;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .swatches button {
    display: inline-flex;
    gap: 3px;
    padding: 5px;
    border: 0;
    border-radius: 12px;
    background: var(--panel);
    cursor: pointer;
    transition: transform 0.2s var(--spring, ease);
  }
  .swatches button:hover {
    transform: translateY(-2px);
  }
  .swatches button.on {
    box-shadow: inset 0 0 0 2px var(--text);
  }
  .swatches i {
    display: grid;
    place-items: center;
    width: 30px;
    height: 20px;
    border-radius: 999px;
    color: #fff;
    font-size: 12px;
    font-style: normal;
    font-weight: 700;
  }
  .swatches i.cz {
    width: auto;
    padding: 0 8px;
    border-radius: 5px;
    color: var(--text);
    font-weight: 600;
  }
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
    color: var(--alert-ink);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
  }
  .result {
    background: var(--sage-soft);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
  }
</style>
