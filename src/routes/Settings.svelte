<script lang="ts">
  // Settings (Nov 18, her pick "A · Side list" on canvas "A cleaner Settings page"): a short list of
  // groups on the left (line icons, no emoji), one group at a time on the right, every setting a
  // row (what it is on the left, the control on the right). Route `#/settings/<group>`. The search
  // box finds a setting in any group and jumps to its row.
  import Icon from "../lib/components/Icon.svelte";
  import { probe, setKey } from "../lib/labStorage";
  import { labs, refreshProgress, rescan } from "../lib/stores/labs.svelte";
  import { ARROW_COLOURS, CLOZE_COLOURS, DEFAULT_SETTINGS, saveSettings, settings } from "../lib/stores/settings.svelte";
  import { styleManager } from "../lib/stores/blockStyles.svelte";
  import { FAMILIES, THEMES, themeById } from "../lib/themes";
  import { inTauri } from "../lib/tauri";
  import { sync, syncNow } from "../lib/stores/synced.svelte";
  import { refreshNotes } from "../lib/stores/notes.svelte";
  import { refreshPdfs } from "../lib/stores/pdfs.svelte";
  import { route } from "../lib/router.svelte";
  import StoragePanel from "./settings/StoragePanel.svelte";

  const GROUPS = [
    { id: "you", name: "You", icon: "user", note: "Your name in Mosaic." },
    { id: "appearance", name: "Appearance", icon: "palette", note: "How Mosaic looks on this computer." },
    { id: "notes", name: "Notes", icon: "note", note: "How notes open, and the colours inside them." },
    { id: "flashcards", name: "Flashcards", icon: "cards", note: "Reviewing and scheduling." },
    { id: "files", name: "Files & storage", icon: "folder", note: "Where your notes, materials and PDFs live." },
    { id: "sync", name: "Sync", icon: "refresh", note: "Keeping your PC and laptop in step." },
    { id: "calendar", name: "Calendar", icon: "calendar", note: "Exams and events." },
    { id: "advanced", name: "Labs & advanced", icon: "labs", note: "Lab storage and bringing over old progress." },
  ] as const;
  type GroupId = (typeof GROUPS)[number]["id"];
  const group = $derived<GroupId>((GROUPS.find((g) => g.id === route.rest.split("/")[0])?.id ?? "appearance") as GroupId);
  const current = $derived(GROUPS.find((g) => g.id === group)!);
  /** a small live note beside some groups in the list */
  function badge(id: GroupId): string {
    if (id === "files") return settings.storage === "local" ? "This computer" : "Drive";
    if (id === "sync") {
      if (!settings.syncEnabled) return "Off";
      if (sync.status === "error") return "Problem";
      if (!sync.lastSync) return "";
      const m = Math.round((Date.now() - sync.lastSync) / 60000);
      return m < 1 ? "Just now" : m < 60 ? `${m} min ago` : "On";
    }
    if (id === "appearance") return themeById(settings.theme).name;
    return "";
  }

  // ---- search: every setting, so it can be found from any group ----
  const INDEX: { id: string; g: GroupId; label: string; words: string }[] = [
    { id: "name", g: "you", label: "Your name", words: "name profile avatar" },
    { id: "theme", g: "appearance", label: "Theme", words: "theme colour color dark light glass neutral catppuccin gruvbox" },
    { id: "window", g: "appearance", label: "Window", words: "window frame curve glass rail floating border" },
    { id: "spacing", g: "appearance", label: "Spacing", words: "spacing density compact spacious roomy" },
    { id: "nhead", g: "notes", label: "Note header", words: "header compact full title" },
    { id: "nwidth", g: "notes", label: "Page width", words: "width readable wide full page" },
    { id: "nopen", g: "notes", label: "Open notes as", words: "markdown source page editor view" },
    { id: "ntools", g: "notes", label: "Formatting toolbar", words: "toolbar formatting always typing" },
    { id: "cardbg", g: "notes", label: "Card lines in notes", words: "flashcard background tint card lines" },
    { id: "arrow", g: "notes", label: "Arrow colour", words: "arrow colour color flashcard" },
    { id: "cloze", g: "notes", label: "Cloze colour", words: "cloze colour color" },
    { id: "styles", g: "notes", label: "Highlights, callouts and quotes", words: "highlight callout quote palette styles colours" },
    { id: "calign", g: "flashcards", label: "Card text", words: "align centre center left review text" },
    { id: "scratch", g: "flashcards", label: "Scratchpad", words: "scratchpad write answer type" },
    { id: "newday", g: "flashcards", label: "New cards a day", words: "new cards per day limit" },
    { id: "retention", g: "flashcards", label: "Target retention", words: "retention fsrs remember" },
    { id: "examaware", g: "flashcards", label: "Exam-aware scheduling", words: "exam aware before cram schedule" },
    { id: "storage", g: "files", label: "Where your files live", words: "vault local drive google storage computer" },
    { id: "folders", g: "files", label: "Folders", words: "notes folder materials labs pdf folder path scan depth" },
    { id: "synconoff", g: "sync", label: "Sync between computers", words: "sync drive laptop pc folder" },
    { id: "syncstatus", g: "sync", label: "Sync status", words: "sync now last synced status" },
    { id: "examwords", g: "calendar", label: "Words that mark an exam", words: "exam keywords quiz final calendar" },
    { id: "labstorage", g: "advanced", label: "Lab storage", words: "lab storage rescan check scan" },
    { id: "import", g: "advanced", label: "Bring over progress", words: "import browser progress recall lab paste" },
  ];
  let q = $state("");
  const hits = $derived.by(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return INDEX.filter((e) => `${e.label} ${e.words}`.toLowerCase().includes(t));
  });
  let flash = $state("");
  function jump(id: string, g: GroupId) {
    q = "";
    location.hash = `#/settings/${g}`;
    setTimeout(() => {
      document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      flash = id;
      setTimeout(() => (flash = ""), 1600);
    }, 60);
  }

  // ---- values that save with a button or on leaving the field ----
  let name = $state(settings.name);
  let root = $state(settings.labsRoot);
  let depth = $state(settings.scanDepth);
  let keywords = $state(settings.examKeywords);
  let syncOn = $state(settings.syncEnabled);
  let syncDir = $state(settings.syncDir);
  let notesRoot = $state(settings.notesRoot);
  let pdfRoot = $state(settings.pdfRoot);
  let pdfDepth = $state(settings.pdfDepth);
  let saved = $state("");
  function done(what: string) {
    saved = what;
    setTimeout(() => (saved = ""), 2000);
  }
  const saveName = () => name.trim() !== settings.name && saveSettings({ name: name.trim() || DEFAULT_SETTINGS.name });
  const saveWords = () => keywords.trim() !== settings.examKeywords && saveSettings({ examKeywords: keywords.trim() || DEFAULT_SETTINGS.examKeywords });

  async function saveFolders(e: SubmitEvent) {
    e.preventDefault();
    const rootChanged = root.trim() !== settings.labsRoot || depth !== settings.scanDepth;
    await saveSettings({
      labsRoot: root.trim() || DEFAULT_SETTINGS.labsRoot,
      scanDepth: depth,
      notesRoot: notesRoot.trim() || DEFAULT_SETTINGS.notesRoot,
      pdfRoot: pdfRoot.trim() || DEFAULT_SETTINGS.pdfRoot,
      pdfDepth: Math.max(1, Math.min(12, Number(pdfDepth) || DEFAULT_SETTINGS.pdfDepth)),
    });
    void refreshNotes();
    void refreshPdfs();
    done("folders");
    if (rootChanged) await rescan();
  }
  async function saveSync(e: SubmitEvent) {
    e.preventDefault();
    await saveSettings({ syncEnabled: syncOn, syncDir: syncDir.trim() || DEFAULT_SETTINGS.syncDir });
    void syncNow();
    done("sync");
  }

  // the theme tabs open on the family of the theme in use
  let fam = $state(themeById(settings.theme).family);

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

<!-- one segmented choice, used by most rows -->
{#snippet seg(id: string, opts: { v: string; name: string }[], cur: string, set: (v: string) => void)}
  <div class="seg" role="radiogroup" aria-labelledby="{id}-l">
    {#each opts as o}
      <button type="button" role="radio" aria-checked={cur === o.v} class:on={cur === o.v} onclick={() => set(o.v)}>{o.name}</button>
    {/each}
  </div>
{/snippet}

<div class="settings">
  <nav class="side" aria-label="Settings">
    <h1 class="display">Settings</h1>
    <label class="search">
      <Icon name="search" size={16} />
      <input bind:value={q} placeholder="Search settings" aria-label="Search settings" onkeydown={(e) => { if (e.key === "Enter" && hits[0]) jump(hits[0].id, hits[0].g); if (e.key === "Escape") q = ""; }} />
    </label>
    {#if q.trim()}
      <ul class="hits">
        {#each hits as h (h.id)}
          <li><button type="button" onclick={() => jump(h.id, h.g)}><b>{h.label}</b><span>{GROUPS.find((g) => g.id === h.g)?.name}</span></button></li>
        {:else}
          <li class="none">Nothing matches “{q}”.</li>
        {/each}
      </ul>
    {:else}
      <ul class="groups">
        {#each GROUPS as g, i (g.id)}
          {#if i === 4 || i === 7}<li class="sep" aria-hidden="true"></li>{/if}
          <li>
            <a href="#/settings/{g.id}" class:on={group === g.id} aria-current={group === g.id ? "page" : undefined}>
              <span class="gi"><Icon name={g.icon} size={17} /></span>{g.name}{#if badge(g.id)}<small>{badge(g.id)}</small>{/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </nav>

  {#key group}
  <section class="pane" aria-labelledby="pane-h">
    <header class="ph">
      <h2 id="pane-h">{current.name}</h2>
      <p class="muted">{current.note}</p>
    </header>

    {#if group === "you"}
      <div class="scard">
        <div class="srow" id="set-name" class:flash={flash === "name"}>
          <div class="rl"><b id="name-l">Your name</b><span>Shown on the dashboard and in the avatar at the bottom of the rail.</span></div>
          <input class="input short" bind:value={name} aria-labelledby="name-l" autocomplete="given-name" onblur={saveName} onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
        </div>
        <div class="srow">
          <div class="rl"><b>Mosaic</b><span>Your student life in full view.</span></div>
        </div>
      </div>

    {:else if group === "appearance"}
      <div class="scard" id="set-theme" class:flash={flash === "theme"}>
        <h3>Theme</h3>
        <div class="famrow">
          {@render seg("fam", FAMILIES.map((f) => ({ v: f.id, name: f.name })), fam, (v) => (fam = v as typeof fam))}
          <span class="muted small">{FAMILIES.find((f) => f.id === fam)?.note}</span>
        </div>
        <div class="themes" role="radiogroup" aria-label="Themes">
          {#each THEMES.filter((t) => t.family === fam) as th (th.id)}
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
              <span class="tn"><b>{th.name}</b>{#if settings.theme === th.id}<span class="chk" aria-hidden="true"><Icon name="check" size={12} /></span>{/if}</span>
              <span class="muted small tnote">{th.note}</span>
            </button>
          {/each}
        </div>
      </div>
      <div class="scard">
        <h3>Layout</h3>
        <div class="srow" id="set-window" class:flash={flash === "window"}>
          <div class="rl"><b id="frame-l">Window</b><span>{(settings.frame ?? "curve") === "curve" ? "The page touches the window edges, with a curve beside the rail." : settings.frame === "sheet" ? "A frosted rail column and a straight page." : "The rail and page float inside a glass border."}</span></div>
          {@render seg("frame", [{ v: "curve", name: "Curve" }, { v: "sheet", name: "Glass rail" }, { v: "float", name: "Floating" }], settings.frame ?? "curve", (v) => saveSettings({ frame: v as "curve" | "sheet" | "float" }))}
        </div>
        <div class="srow" id="set-spacing" class:flash={flash === "spacing"}>
          <div class="rl"><b id="density-l">Spacing</b><span>How roomy cards and lists are.</span></div>
          {@render seg("density", [{ v: "spacious", name: "Spacious" }, { v: "original", name: "Original" }, { v: "compact", name: "Compact" }], settings.density, (v) => saveSettings({ density: v as "spacious" | "original" | "compact" }))}
        </div>
      </div>

    {:else if group === "notes"}
      <div class="scard">
        <h3>Every note</h3>
        <div class="srow" id="set-nhead" class:flash={flash === "nhead"}>
          <div class="rl"><b id="nhead-l">Header</b><span>Compact is one line. Full has a big icon and title. A note can have its own in its ⋯ menu.</span></div>
          {@render seg("nhead", [{ v: "compact", name: "Compact" }, { v: "full", name: "Full" }], settings.noteHeader ?? "compact", (v) => saveSettings({ noteHeader: v as "compact" | "full" }))}
        </div>
        <div class="srow" id="set-nwidth" class:flash={flash === "nwidth"}>
          <div class="rl"><b id="nwidth-l">Page width</b><span>For notes you haven't set a width on.</span></div>
          {@render seg("nwidth", [{ v: "readable", name: "Readable" }, { v: "wide", name: "Wide" }, { v: "full", name: "Full" }], settings.noteWidth ?? "readable", (v) => saveSettings({ noteWidth: v as "readable" | "wide" | "full" }))}
        </div>
        <div class="srow" id="set-nopen" class:flash={flash === "nopen"}>
          <div class="rl"><b id="nopen-l">Open notes as</b><span>The &lt;&gt; chip in a note still switches.</span></div>
          {@render seg("nopen", [{ v: "page", name: "Mosaic page" }, { v: "markdown", name: "Markdown" }], settings.noteOpen ?? "page", (v) => saveSettings({ noteOpen: v as "page" | "markdown" }))}
        </div>
        <div class="srow" id="set-ntools" class:flash={flash === "ntools"}>
          <div class="rl"><b id="ntools-l">Formatting toolbar</b><span>The ✎ button in a note flips this too.</span></div>
          {@render seg("ntools", [{ v: "typing", name: "While I type" }, { v: "always", name: "Always" }], settings.noteTools ? "always" : "typing", (v) => saveSettings({ noteTools: v === "always" }))}
        </div>
      </div>
      <div class="scard">
        <h3>Flashcards in notes</h3>
        <div class="srow" id="set-cardbg" class:flash={flash === "cardbg"}>
          <div class="rl"><b id="cardbg-l">Card lines</b><span>How a line that makes a flashcard looks.</span></div>
          {@render seg("cardbg", [{ v: "on", name: "Soft background" }, { v: "off", name: "Plain, arrow only" }], settings.cardBg === false ? "off" : "on", (v) => saveSettings({ cardBg: v === "on" }))}
        </div>
        <div class="srow col" id="set-arrow" class:flash={flash === "arrow"}>
          <div class="rl"><b id="arrow-l">Arrow colour</b></div>
          <div class="swatches" role="radiogroup" aria-labelledby="arrow-l">
            {#each Object.entries(ARROW_COLOURS) as [k, [one, two]]}
              <button type="button" role="radio" aria-checked={settings.arrowColor === k} class:on={settings.arrowColor === k} title={k === "theme" ? "Follow the theme" : k === "mosaic" ? "Mosaic (pink and periwinkle)" : k} aria-label={k}
                onclick={() => saveSettings({ arrowColor: k })}>{#if k === "theme"}<i class="cz">Theme</i>{:else}<i style="background: {one}">→</i><i style="background: {two}">⇄</i>{/if}</button>
            {/each}
          </div>
        </div>
        <div class="srow col" id="set-cloze" class:flash={flash === "cloze"}>
          <div class="rl"><b id="cloze-l">Cloze colour</b></div>
          <div class="swatches" role="radiogroup" aria-labelledby="cloze-l">
            {#each Object.entries(CLOZE_COLOURS) as [k, [fill, line]]}
              <button type="button" role="radio" aria-checked={settings.clozeColor === k} class:on={settings.clozeColor === k} title={k} aria-label={k}
                onclick={() => saveSettings({ clozeColor: k })}>{#if k === "theme"}<i class="cz">Theme</i>{:else}<i class="cz" style="background: {fill}; box-shadow: inset 0 -2px 0 {line}">cloze</i>{/if}</button>
            {/each}
          </div>
        </div>
      </div>
      <div class="scard">
        <h3>Styles</h3>
        <div class="srow" id="set-styles" class:flash={flash === "styles"}>
          <div class="rl"><b>Highlights, callouts and quotes</b><span>Your callout types, how quotes look, your highlight colours and palettes.</span></div>
          <div class="btns">
            <button type="button" class="btn quiet sm" onclick={() => { styleManager.tab = "callouts"; styleManager.open = true; }}>Callouts</button>
            <button type="button" class="btn quiet sm" onclick={() => { styleManager.tab = "quotes"; styleManager.open = true; }}>Quotes</button>
            <button type="button" class="btn quiet sm" onclick={() => { styleManager.tab = "highlights"; styleManager.open = true; }}>Highlights</button>
          </div>
        </div>
      </div>

    {:else if group === "flashcards"}
      <div class="scard">
        <h3>Review</h3>
        <div class="srow" id="set-calign" class:flash={flash === "calign"}>
          <div class="rl"><b id="calign-l">Card text</b><span>Lists and tables stay left-aligned either way.</span></div>
          {@render seg("calign", [{ v: "left", name: "Left" }, { v: "center", name: "Centred" }], settings.cardAlign === "center" ? "center" : "left", (v) => saveSettings({ cardAlign: v as "left" | "center" }))}
        </div>
        <div class="srow" id="set-scratch" class:flash={flash === "scratch"}>
          <div class="rl"><b id="scratch-l">Scratchpad</b><span>Write your answer before you see the card's, then rate yourself.</span></div>
          {@render seg("scratch", [{ v: "off", name: "Off" }, { v: "on", name: "On" }], settings.cardScratch ? "on" : "off", (v) => saveSettings({ cardScratch: v === "on" }))}
        </div>
      </div>
      <div class="scard">
        <h3>Scheduling</h3>
        <div class="srow" id="set-newday" class:flash={flash === "newday"}>
          <div class="rl"><b id="newday-l">New cards a day</b><span>Cards you haven't seen yet, introduced each day.</span></div>
          <input class="input num" type="number" min="0" max="500" aria-labelledby="newday-l" value={settings.newPerDay} onchange={(e) => saveSettings({ newPerDay: Math.max(0, Number(e.currentTarget.value) || 0) })} />
        </div>
        <div class="srow" id="set-retention" class:flash={flash === "retention"}>
          <div class="rl"><b id="ret-l">Target retention</b><span>Higher means you remember more, with more reviews (FSRS, like modern Anki).</span></div>
          {@render seg("ret", [0.85, 0.9, 0.93, 0.95].map((r) => ({ v: String(r), name: `${Math.round(r * 100)}%` })), String(settings.retention), (v) => saveSettings({ retention: Number(v) }))}
        </div>
        <div class="srow" id="set-examaware" class:flash={flash === "examaware"}>
          <div class="rl"><b id="exam-l">Exam-aware</b><span>Before an exam, that course's cards come up by the evening before.</span></div>
          {@render seg("exam", [{ v: "off", name: "Off" }, { v: "on", name: "On" }], settings.examAware ? "on" : "off", (v) => saveSettings({ examAware: v === "on" }))}
        </div>
      </div>

    {:else if group === "files"}
      <div id="set-storage" class:flash={flash === "storage"}>
        <StoragePanel onchanged={() => { root = settings.labsRoot; notesRoot = settings.notesRoot; pdfRoot = settings.pdfRoot; syncOn = settings.syncEnabled; }} />
      </div>
      <form class="scard" id="set-folders" class:flash={flash === "folders"} onsubmit={saveFolders}>
        <h3>Folders</h3>
        <label class="srow col"><span class="rl"><b>Notes</b><span>Markdown files, so they open in any other app too. “~” is your home folder.</span></span><input class="input" bind:value={notesRoot} spellcheck="false" /></label>
        <label class="srow col"><span class="rl"><b>Materials</b><span>Recall labs, quizzes and everything else; every folder inside becomes a dashboard.</span></span><input class="input" bind:value={root} spellcheck="false" /></label>
        <label class="srow"><span class="rl"><b>Materials: folder levels to scan</b><span>Lower is faster on the Drive mount.</span></span><input class="input num" type="number" min="1" max="8" bind:value={depth} /></label>
        <label class="srow col"><span class="rl"><b>PDFs</b><span>Study → PDFs lists every PDF in here. Annotations go into the PDF; the original is kept once in a hidden “.studydesk-originals” folder.</span></span><input class="input" bind:value={pdfRoot} spellcheck="false" /></label>
        <label class="srow"><span class="rl"><b>PDFs: folder levels to search</b></span><input class="input num" type="number" min="1" max="12" bind:value={pdfDepth} /></label>
        <div class="srow end"><button class="btn primary" type="submit">Save folders</button>{#if saved === "folders"}<span class="muted">Saved</span>{/if}</div>
      </form>

    {:else if group === "sync"}
      <form class="scard" id="set-synconoff" class:flash={flash === "synconoff"} onsubmit={saveSync}>
        <h3>Sync</h3>
        <div class="srow">
          <div class="rl"><b id="sync-l">Sync through Google Drive</b><span>Flashcard progress, calendar, tasks, courses, lab progress and study days.</span></div>
          {@render seg("sync", [{ v: "off", name: "Off" }, { v: "on", name: "On" }], syncOn ? "on" : "off", (v) => (syncOn = v === "on"))}
        </div>
        <label class="srow col"><span class="rl"><b>Sync folder</b><span>The same folder on your PC and laptop. Each computer writes its own file here and reads the others.</span></span><input class="input" bind:value={syncDir} spellcheck="false" disabled={!syncOn} /></label>
        <div class="srow end"><button class="btn primary" type="submit">Save</button>{#if saved === "sync"}<span class="muted">Saved</span>{/if}</div>
      </form>
      <div class="scard" id="set-syncstatus" class:flash={flash === "syncstatus"}>
        <h3>Status</h3>
        {#if !settings.syncEnabled}
          <div class="srow"><div class="rl"><b>Sync is off</b><span>Everything stays on this computer.</span></div></div>
        {:else}
          <div class="srow">
            <div class="rl">
              <b class:bad={sync.status === "error"}>
                {#if sync.status === "error"}Couldn’t sync{:else if sync.status === "syncing"}Syncing…{:else if sync.lastSync}Last synced {new Date(sync.lastSync).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{:else}Not synced yet{/if}
              </b>
              <span>{#if sync.status === "error"}{sync.error}{:else}Changes from the other computer can take a minute or two to show, depending on rclone.{/if}</span>
            </div>
            <button class="btn quiet sm" type="button" onclick={() => syncNow()} disabled={!inTauri || sync.status === "syncing"}>Sync now</button>
          </div>
          <div class="srow">
            <div class="rl"><b>This computer</b><span>{sync.host || "—"}</span></div>
          </div>
          <div class="srow">
            <div class="rl"><b>Other computers</b>
              <span>{#if sync.others.length}{sync.others.map((o) => `${o.host} (last saved ${new Date(o.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})`).join(", ")}{:else}None has synced yet.{/if}</span>
            </div>
          </div>
        {/if}
      </div>

    {:else if group === "calendar"}
      <div class="scard">
        <div class="srow col" id="set-examwords" class:flash={flash === "examwords"}>
          <div class="rl"><b id="words-l">Words that mark an exam</b><span>Separate with commas, e.g. “Exam, Quiz, Final”. Events tagged Other with these words count as exams.</span></div>
          <input class="input" bind:value={keywords} aria-labelledby="words-l" spellcheck="false" onblur={saveWords} onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
        </div>
      </div>

    {:else if group === "advanced"}
      <div class="scard" id="set-labstorage" class:flash={flash === "labstorage"}>
        <h3>Lab storage</h3>
        <div class="srow">
          <div class="rl"><b>Last scan</b><span>{labs.scannedAt ? new Date(labs.scannedAt * 1000).toLocaleString() : "never"} · {Object.keys(labs.storage).length} labs have saved progress in the app.</span></div>
          <button class="btn quiet sm" type="button" onclick={() => rescan()} disabled={!inTauri || labs.scanning}>{labs.scanning ? "Scanning…" : "Rescan now"}</button>
        </div>
        <div class="srow">
          <div class="rl"><b>Check lab storage</b><span>Proves lab progress survives a restart.</span></div>
          <button class="btn quiet sm" type="button" onclick={checkStorage} disabled={!inTauri}>Check</button>
        </div>
        {#if probeResult}<p class="result">{probeResult}</p>{/if}
      </div>
      <div class="scard" id="set-import" class:flash={flash === "import"}>
        <h3>Bring over progress from your browser</h3>
        <div class="srow col">
          <div class="rl"><span>If you used your labs in a web browser before, that progress lives in the browser. Open a lab there, press F12, choose Console, paste this line and press Enter. It copies your progress to the clipboard.</span></div>
          <pre><code>{snippet}</code></pre>
          <textarea class="input" bind:value={importText} rows="4" spellcheck="false" placeholder="Paste it here" aria-label="Paste your progress here"></textarea>
          <div class="btns"><button class="btn primary" type="button" onclick={importProgress} disabled={!inTauri || !importText.trim()}>Import progress</button></div>
          {#if importResult}<p class="result">{importResult}</p>{/if}
        </div>
      </div>
    {/if}
  </section>
  {/key}
</div>

<style>
  .settings {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 28px;
    align-items: start;
    max-width: 1180px;
  }
  /* ---- the list of groups ---- */
  .side {
    position: sticky;
    top: 0;
    display: grid;
    gap: 10px;
    align-content: start;
  }
  .side h1 {
    margin: 4px 8px 4px;
    font-size: 30px;
    font-weight: 600;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border-radius: 14px;
    background: var(--field, var(--surface));
    color: var(--text-muted);
  }
  .search input {
    flex: 1;
    min-width: 0;
    min-height: 42px;
    border: 0;
    background: none;
    font: inherit;
    font-size: 14.5px;
    color: var(--text);
    outline: none;
  }
  .groups,
  .hits {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .groups a {
    display: flex;
    align-items: center;
    gap: 11px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 14px;
    color: var(--text);
    text-decoration: none;
    font-size: 15px;
  }
  .groups a:hover {
    background: var(--chip);
  }
  .groups a.on {
    background: var(--surface);
    font-weight: 600;
    box-shadow: var(--shadow);
  }
  .gi {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 10px;
    background: var(--chip);
    color: var(--text-muted);
  }
  .groups a.on .gi {
    background: color-mix(in srgb, var(--accent) 22%, var(--white));
    color: var(--text);
  }
  .groups small {
    margin-left: auto;
    font-size: 12px;
    font-weight: 400;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .sep {
    height: 1px;
    margin: 6px 12px;
    background: var(--hairline);
  }
  .hits button {
    display: grid;
    gap: 1px;
    width: 100%;
    padding: 9px 12px;
    border: 0;
    border-radius: 12px;
    background: none;
    font: inherit;
    text-align: left;
    color: var(--text);
    cursor: pointer;
  }
  .hits button:hover {
    background: var(--chip);
  }
  .hits b {
    font-size: 14.5px;
    font-weight: 600;
  }
  .hits span,
  .none {
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .none {
    padding: 8px 12px;
  }
  /* ---- one group ---- */
  .pane {
    display: grid;
    gap: 16px;
    min-width: 0;
    animation: pane-in 0.35s var(--spring-soft, ease) backwards;
  }
  @keyframes pane-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .ph h2 {
    margin: 6px 0 2px;
    font-size: 28px;
    font-weight: 600;
  }
  .ph p {
    margin: 0;
    font-size: 14.5px;
  }
  .scard,
  .pane :global(.card.storage) {
    display: grid;
    padding: 6px 0;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .pane :global(.card.storage) {
    padding: 14px 22px 20px;
    gap: 8px;
  }
  .pane :global(.card.storage .h2) {
    margin: 0;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .scard h3 {
    margin: 0;
    padding: 14px 22px 4px;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .srow {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 14px 22px;
    border-top: 1px solid var(--hairline);
    transition: background-color 0.4s ease;
  }
  .scard > h3 + .srow,
  .scard > .famrow + .themes,
  .scard > .srow:first-child {
    border-top: 0;
  }
  .srow.col {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .srow.end {
    justify-content: flex-start;
  }
  .flash,
  .flash :global(.card.storage) {
    background: color-mix(in srgb, var(--accent) 16%, var(--surface)) !important;
  }
  .rl {
    flex: 1;
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .rl b {
    font-size: 15px;
    font-weight: 600;
  }
  .rl span {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.45;
  }
  .rl b.bad {
    color: var(--alert-ink);
  }
  .input {
    min-height: 42px;
    padding: 8px 14px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--field, var(--panel));
    font: inherit;
    font-size: 14.5px;
    color: var(--text);
  }
  .input.short {
    width: 240px;
  }
  .input.num {
    width: 90px;
    text-align: center;
  }
  .input:disabled {
    opacity: 0.6;
  }
  textarea.input {
    resize: vertical;
  }
  .btns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .sm {
    min-height: 38px;
    padding: 0 16px;
    font-size: 13.5px;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .result {
    margin: 0 22px 14px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    background: var(--sage-soft);
  }
  .srow .result {
    margin: 0;
  }
  pre {
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    background: var(--panel);
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 13px;
  }
  /* segmented choices */
  .seg {
    display: inline-flex;
    flex: none;
    gap: 3px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--chip);
  }
  .seg button {
    min-height: 36px;
    padding: 0 16px;
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    box-shadow: var(--shadow);
  }
  /* themes */
  .famrow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding: 6px 22px 4px;
  }
  .small {
    font-size: 12.5px;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    padding: 10px 22px 20px;
  }
  .theme {
    display: grid;
    gap: 5px;
    align-content: start;
    padding: 7px 7px 10px;
    border: 0;
    border-radius: 18px;
    background: var(--chip);
    text-align: left;
    font: inherit;
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
  .thumb {
    display: flex;
    gap: 6px;
    height: 84px;
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
  .tnote {
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
  }
  /* flashcard colours */
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
  /* narrow windows: the groups become a strip of chips on top, rows stack */
  @media (max-width: 860px) {
    .settings {
      grid-template-columns: 1fr;
      gap: 16px;
    }
    .side {
      position: static;
    }
    .groups {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .groups .sep {
      display: none;
    }
    .groups a {
      min-height: 38px;
      background: var(--chip);
    }
    .groups small {
      display: none;
    }
    .srow {
      flex-wrap: wrap;
    }
  }
</style>
