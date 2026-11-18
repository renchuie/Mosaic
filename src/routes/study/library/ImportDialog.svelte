<script lang="ts">
  import { guessMapping, parseDelimited } from "../../../lib/cardTypes";
  import { courseNames } from "../../../lib/stores/courses.svelte";
  import { ankiItems, cardTypes, getType, importAnki, importRows } from "../../../lib/stores/library.svelte";
  import { plan as ankiPlan, type AnkiRead } from "../../../lib/anki";
  import { courses } from "../../../lib/stores/courses.svelte";
  import { inTauri, invoke } from "../../../lib/tauri";

  let { open = $bindable(false), type: initialType = "basic" }: { open: boolean; type?: string } = $props();
  let dialog = $state<HTMLDialogElement>();
  let text = $state("");
  let type = $state("basic");
  let header = $state(true);
  let map = $state<Record<string, number>>({});
  let course = $state("");
  let tags = $state("");
  let done = $state<number | null>(null);

  // ---- Anki packages (.apkg / .colpkg) ----
  let anki = $state<{ name: string; read: AnkiRead } | null>(null);
  let ankiErr = $state("");
  let reading = $state(false);
  let history = $state(true);
  let makeDecks = $state(true);
  let ankiDone = $state<ReturnType<typeof importAnki> | null>(null);
  const known = $derived(anki ? ankiItems() : new Map<string, string>());
  const ap = $derived(anki ? ankiPlan(anki.read, { existingTypes: cardTypes(), history, known: new Set(known.keys()) }) : null);
  const again = $derived(ap ? ap.items.filter((i) => known.has(i.guid)).length : 0);
  const typeName = (id: string) => (id === "new" ? "new card type" : (getType(id)?.name ?? id));
  /** the course whose name or short name is a part of the deck path */
  function guessCourse(read: AnkiRead): string {
    const parts = read.decks.flatMap((d) => d.path).map((x) => x.toLowerCase());
    const hit = courses().find(([, c]) => parts.includes(c.name.toLowerCase()) || (c.code && parts.includes(c.code.toLowerCase())));
    return hit ? hit[1].name : "";
  }
  async function pickAnki(f: File) {
    ankiErr = "";
    reading = true;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      // browser preview: UI tests hand the read result in through window.__ankiRead
      const test = (window as unknown as { __ankiRead?: AnkiRead }).__ankiRead;
      const read = inTauri ? await invoke<AnkiRead>("anki_read", bytes) : test;
      if (!read) throw new Error("Anki packages open in the app.");
      anki = { name: f.name, read };
      course = guessCourse(read);
    } catch (e) {
      ankiErr = e instanceof Error ? e.message : String(e);
    } finally {
      reading = false;
    }
  }
  function goAnki() {
    if (!ap) return;
    ankiDone = importAnki(ap, { course: course || undefined, makeDecks });
  }

  $effect(() => {
    if (open && dialog && !dialog.open) {
      text = "";
      type = initialType;
      done = null;
      anki = null;
      ankiDone = null;
      ankiErr = "";
      dialog.showModal();
    }
  });
  const parsed = $derived(text.trim() ? parseDelimited(text) : null);
  const cols = $derived(parsed?.rows[0]?.map((h, i) => (header ? h || `Column ${i + 1}` : `Column ${i + 1}`)) ?? []);
  const rows = $derived(parsed ? (header ? parsed.rows.slice(1) : parsed.rows) : []);
  const t = $derived(getType(type));
  $effect(() => {
    if (t && cols.length) map = guessMapping(cols, t.fields);
  });

  async function pick(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f && /\.(apkg|colpkg)$/i.test(f.name)) await pickAnki(f);
    else if (f) text = await f.text();
  }
  function go() {
    if (!parsed || !t) return;
    done = importRows(rows, type, $state.snapshot(map), { course: course || undefined, tags: tags.split(",").map((x) => x.trim()).filter(Boolean), html: parsed.html || /<[a-z][^>]*>/i.test(text) });
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="im-title">
  <div class="wrap">
    <header><h2 id="im-title" class="h2">Import cards</h2><button type="button" class="x" aria-label="Close" onclick={() => dialog?.close()}>×</button></header>
    {#if ankiDone}
      <p class="ok">Added {ankiDone.added}{ankiDone.updated ? ` · updated ${ankiDone.updated}` : ""}{ankiDone.scheduled ? ` · ${ankiDone.scheduled} with their schedule` : ""}{ankiDone.decks ? ` · ${ankiDone.decks} ${ankiDone.decks === 1 ? "deck" : "decks"} made` : ""}.</p>
      <button type="button" class="btn primary" onclick={() => dialog?.close()}>Done</button>
    {:else if anki && ap}
      <div class="apkg">
        <b>{anki.name}</b>
        <span class="muted small">{ap.items.length} notes · {ap.items.reduce((n, i) => n + i.cards.length, 0)} cards{ap.reviews ? ` · ${ap.reviews.toLocaleString()} reviews` : ""}</span>
      </div>
      {#if ap.decks.length}
        <div class="lst"><span class="label">Decks</span>
          {#each ap.decks as d}<span>{d.path.join(" › ")} <i class="muted">{d.notes}</i></span>{/each}
        </div>
      {/if}
      <div class="lst"><span class="label">Note types</span>
        {#each ap.types as t}<span>{t.name} → {typeName(t.target)} <i class="muted">{t.notes}</i></span>{/each}
      </div>
      <div class="two">
        <label class="field"><span class="label">Course</span><select class="input" bind:value={course}><option value="">None</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}</select></label>
        <div class="opts">
          {#if ap.scheduled || ap.reviews || !history}<label class="chk"><input type="checkbox" bind:checked={history} /> Review history</label>
          {:else}<span class="muted small">No review history in this file.</span>{/if}
          {#if ap.decks.length}<label class="chk"><input type="checkbox" bind:checked={makeDecks} /> Make {ap.decks.length === 1 ? "a deck" : "decks"}</label>{/if}
        </div>
      </div>
      {#if again}<p class="muted small">{again} already imported: their text is updated, their schedule kept.</p>{/if}
      <div class="row end">
        <button type="button" class="btn quiet" onclick={() => (anki = null)}>Back</button>
        <button type="button" class="btn primary" onclick={goAnki}>Import {ap.items.length} {ap.items.length === 1 ? "note" : "notes"}</button>
      </div>
    {:else if done !== null}
      <p class="ok">Imported {done} {done === 1 ? "item" : "items"}. </p>
      <button type="button" class="btn primary" onclick={() => dialog?.close()}>Done</button>
    {:else}
      <p class="muted small">
        Anki package (.apkg), CSV, TSV, or Anki's Notes in Plain Text.
      </p>
      <div class="row">
        <label class="btn quiet file">Choose file<input type="file" accept=".apkg,.colpkg,.csv,.tsv,.txt,text/plain,text/csv" onchange={pick} /></label>
        <span class="muted small">{reading ? "Reading…" : "or paste below"}</span>
      </div>
      {#if ankiErr}<p class="err small">{ankiErr}</p>{/if}
      <textarea class="input mono" rows="5" bind:value={text} placeholder={"Generic,Brand,Class\napixaban,Eliquis,Factor Xa inhibitor"}></textarea>
      {#if parsed}
        <div class="two">
          <label class="field"><span class="label">Card type</span>
            <select class="input" bind:value={type}>{#each cardTypes().filter(([, x]) => x.kind !== "occlusion") as [id, x]}<option value={id}>{x.name}</option>{/each}</select></label>
          <label class="chk"><input type="checkbox" bind:checked={header} /> First row is a header</label>
        </div>
        {#if t}
          <div class="map">
            {#each t.fields as f}
              <label><span>{f}</span>
                <select class="input" value={map[f] ?? -1} onchange={(e) => (map = { ...map, [f]: Number(e.currentTarget.value) })}>
                  <option value={-1}>(leave empty)</option>{#each cols as c, i}<option value={i}>{c}</option>{/each}
                </select></label>
            {/each}
          </div>
        {/if}
        <div class="two">
          <label class="field"><span class="label">Course</span><select class="input" bind:value={course}><option value="">None</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}</select></label>
          <label class="field"><span class="label">Tags</span><input class="input" bind:value={tags} placeholder="e.g. top300" /></label>
        </div>
        <div class="pre">
          <span class="label">{rows.length} rows · first ones:</span>
          {#each rows.slice(0, 3) as r}
            <div class="pr">{#each t?.fields ?? [] as f}{#if (map[f] ?? -1) >= 0 && r[map[f]]}<span><b>{f}:</b> {r[map[f]].slice(0, 60)}</span>{/if}{/each}</div>
          {/each}
        </div>
        <button type="button" class="btn primary" onclick={go} disabled={!rows.length}>Import {rows.length} {rows.length === 1 ? "item" : "items"}</button>
      {/if}
    {/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(640px, calc(100vw - 24px));
    max-height: calc(100vh - 32px);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  .wrap {
    display: grid;
    gap: 12px;
    padding: 22px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .x {
    width: var(--hit);
    height: var(--hit);
    border: 0;
    border-radius: 50%;
    background: none;
    font-size: 24px;
    color: var(--text-muted);
  }
  .small {
    font-size: 13.5px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .file {
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 13px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: end;
  }
  .chk {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: var(--hit);
    font-size: 14px;
  }
  .chk input {
    width: 18px;
    height: 18px;
    accent-color: var(--sage-deep);
  }
  .map {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
    padding: 12px;
    border-radius: 14px;
    background: var(--panel);
  }
  .map label {
    display: grid;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
  }
  .map .input {
    background: var(--surface);
    min-height: 38px;
    padding: 4px 10px;
    font-weight: 400;
  }
  .pre {
    display: grid;
    gap: 6px;
  }
  .pr {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--panel);
    font-size: 13px;
  }
  .apkg {
    display: grid;
    gap: 2px;
  }
  .lst {
    display: grid;
    gap: 4px;
    padding: 12px;
    border-radius: 14px;
    background: var(--panel);
    font-size: 14px;
  }
  .lst i {
    font-style: normal;
    margin-left: 4px;
  }
  .opts {
    display: grid;
  }
  .end {
    justify-content: flex-end;
  }
  .err {
    color: var(--alert-ink);
  }
  .ok {
    padding: 12px;
    border-radius: 12px;
    background: var(--sage-soft);
  }
</style>
