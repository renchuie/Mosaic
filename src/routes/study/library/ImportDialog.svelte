<script lang="ts">
  import { guessMapping, parseDelimited } from "../../../lib/cardTypes";
  import { courseNames } from "../../../lib/stores/courses.svelte";
  import { cardTypes, getType, importRows } from "../../../lib/stores/library.svelte";

  let { open = $bindable(false), type: initialType = "basic" }: { open: boolean; type?: string } = $props();
  let dialog = $state<HTMLDialogElement>();
  let text = $state("");
  let type = $state("basic");
  let header = $state(true);
  let map = $state<Record<string, number>>({});
  let course = $state("");
  let tags = $state("");
  let done = $state<number | null>(null);

  $effect(() => {
    if (open && dialog && !dialog.open) {
      text = "";
      type = initialType;
      done = null;
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
    if (f) text = await f.text();
  }
  function go() {
    if (!parsed || !t) return;
    done = importRows(rows, type, $state.snapshot(map), { course: course || undefined, tags: tags.split(",").map((x) => x.trim()).filter(Boolean), html: parsed.html || /<[a-z][^>]*>/i.test(text) });
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="im-title">
  <div class="wrap">
    <header><h2 id="im-title" class="h2">Import cards</h2><button type="button" class="x" aria-label="Close" onclick={() => dialog?.close()}>×</button></header>
    {#if done !== null}
      <p class="ok">Imported {done} {done === 1 ? "item" : "items"}. They're in the card library and start as new cards.</p>
      <button type="button" class="btn primary" onclick={() => dialog?.close()}>Done</button>
    {:else}
      <p class="muted small">
        A CSV or TSV file (a spreadsheet saved as CSV works), or Anki's <b>File → Export → Notes in Plain Text</b>.
        Anki's .apkg packages aren't read directly; the plain-text export carries the same notes.
      </p>
      <div class="row">
        <label class="btn quiet file">Choose file<input type="file" accept=".csv,.tsv,.txt,text/plain,text/csv" onchange={pick} /></label>
        <span class="muted small">or paste below</span>
      </div>
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
  .ok {
    padding: 12px;
    border-radius: 12px;
    background: var(--sage-soft);
  }
</style>
