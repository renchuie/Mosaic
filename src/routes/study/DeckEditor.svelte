<script lang="ts">
  // New / edit deck (F1): name and icon, which cards it takes (courses, folders or notes, the
  // card library, tags, an exam) and its daily limits. The count updates as rules change.
  import Icon from "../../lib/components/Icon.svelte";
  import IconPicker from "../../lib/components/IconPicker.svelte";
  import { exams } from "../../lib/stores/calendar.svelte";
  import { courses } from "../../lib/stores/courses.svelte";
  import { deckMatcher, decks, deleteDeck, family, getDeck, saveDeck, type Deck } from "../../lib/stores/decks.svelte";
  import { noteDirs, notes } from "../../lib/stores/notes.svelte";
  import { settings } from "../../lib/stores/settings.svelte";
  import { allCards, statusOf } from "../../lib/stores/srs.svelte";

  let { open = $bindable(false), id = null, parent = null, onsaved }: { open: boolean; id?: string | null; parent?: string | null; onsaved?: (id: string) => void } = $props();

  let dialog = $state<HTMLDialogElement>();
  let d = $state<Deck>({ name: "", order: 0 });
  let picking = $state(false);
  let q = $state("");
  let tagQ = $state("");
  let error = $state("");
  let confirmDel = $state(false);

  $effect(() => {
    if (open && dialog && !dialog.open) {
      const cur = id ? getDeck(id) : undefined;
      d = cur ? structuredClone($state.snapshot(cur) as Deck) : { name: "", icon: "i:layers:purple", order: decks().length, ...(parent ? { parent } : {}) };
      picking = false;
      q = tagQ = error = "";
      confirmDel = false;
      dialog.showModal();
    }
  });
  function close() {
    open = false;
    dialog?.close();
  }

  const toggle = (list: string[] | undefined, v: string) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);

  // folders and notes to add
  const places = $derived.by(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const dirs = noteDirs()
      .filter((x) => x.toLowerCase().includes(s) && !d.folders?.includes(x))
      .map((x) => ({ kind: "folder" as const, rel: x, label: x }));
    const files = Object.values(notes.files)
      .filter((e) => (e.p.title.toLowerCase().includes(s) || e.rel.toLowerCase().includes(s)) && !d.notes?.includes(e.rel))
      .map((e) => ({ kind: "note" as const, rel: e.rel, label: e.p.title }));
    return [...dirs, ...files].slice(0, 8);
  });
  const allTags = $derived.by(() => {
    const set = new Set<string>();
    for (const e of Object.values(notes.files)) for (const t of e.p.tags) set.add(t);
    for (const r of allCards()) if (r.item) for (const t of r.card.context ?? []) if (t.startsWith("#")) set.add(t.slice(1));
    return [...set].sort((a, b) => a.localeCompare(b));
  });
  const tagHits = $derived(tagQ.trim() ? allTags.filter((t) => t.toLowerCase().includes(tagQ.trim().toLowerCase().replace(/^#/, "")) && !d.tags?.includes(t)).slice(0, 8) : []);
  const examList = $derived(exams().filter((e) => e.days >= -30));

  const matched = $derived.by(() => {
    const m = deckMatcher($state.snapshot(d) as Deck, id ?? undefined);
    const list = allCards().filter((r) => r.card.lineId && m(r));
    const now = Date.now();
    return { total: list.length, due: list.filter((r) => ["review", "learning"].includes(statusOf(r.rec, now))).length, new: list.filter((r) => !r.rec).length };
  });

  const num = (v: string): number | null => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v)) || 0));

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!d.name.trim()) return (error = "Name the deck.");
    const clean: Deck = { ...($state.snapshot(d) as Deck), name: d.name.trim() };
    for (const k of ["courses", "folders", "notes", "tags"] as const) if (!clean[k]?.length) delete clean[k];
    if (!clean.library) delete clean.library;
    if (!clean.exam) delete clean.exam;
    if (!clean.parent) delete clean.parent;
    if (clean.newPerDay == null) delete clean.newPerDay;
    if (clean.reviewsPerDay == null) delete clean.reviewsPerDay;
    const key = saveDeck(id, clean);
    onsaved?.(key);
    close();
  }
  function remove() {
    if (!id) return;
    if (!confirmDel) return (confirmDel = true);
    deleteDeck(id);
    close();
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="dk-title">
  <form onsubmit={save}>
    <header>
      <button type="button" class="badge" aria-label="Icon" onclick={() => (picking = !picking)}><Icon name={d.icon || "i:layers"} size={22} /></button>
      <input class="input name" id="dk-title" bind:value={d.name} placeholder={id ? "Deck name" : "New deck"} aria-label="Deck name" />
      <button type="button" class="x" aria-label="Close" onclick={close}>×</button>
    </header>
    {#if picking}
      <div class="picker"><IconPicker value={d.icon} remove={false} onpick={(v, recoloured) => { if (v) d.icon = v; if (!recoloured) picking = false; }} /></div>
    {/if}

    <section>
      <label class="row"><span class="label">Inside</span>
        <select class="input" bind:value={d.parent}>
          <option value={undefined}>Top level</option>
          {#each decks().filter(([k]) => !id || !family(id).has(k)) as [k, x] (k)}<option value={k}>{x.name}</option>{/each}
        </select>
      </label>
    </section>

    <section>
      <h3 class="label">Courses</h3>
      <div class="chips">
        {#each courses() as [cid, c] (cid)}
          <button type="button" class="chip" class:on={d.courses?.includes(c.name)} style="--c: {c.color}" onclick={() => (d.courses = toggle(d.courses, c.name))}>{c.code || c.name}</button>
        {/each}
      </div>
    </section>

    <section>
      <h3 class="label">Folders and notes</h3>
      <div class="chips">
        {#each d.folders ?? [] as f (f)}<span class="chip on picked"><Icon name="folder" size={13} />{f}<button type="button" aria-label="Remove {f}" onclick={() => (d.folders = toggle(d.folders, f))}>×</button></span>{/each}
        {#each d.notes ?? [] as n (n)}<span class="chip on picked"><Icon name="i:file-text" size={13} />{notes.files[n]?.p.title ?? n}<button type="button" aria-label="Remove" onclick={() => (d.notes = toggle(d.notes, n))}>×</button></span>{/each}
        <button type="button" class="chip" class:on={d.library} onclick={() => (d.library = !d.library)}><Icon name="book" size={13} />Card library</button>
      </div>
      <div class="find">
        <input class="input" bind:value={q} placeholder="Add a folder or note" aria-label="Add a folder or note" />
        {#if places.length}
          <ul class="hits">
            {#each places as p (p.kind + p.rel)}
              <li><button type="button" onclick={() => { if (p.kind === "folder") d.folders = toggle(d.folders, p.rel); else d.notes = toggle(d.notes, p.rel); q = ""; }}>
                <Icon name={p.kind === "folder" ? "folder" : "i:file-text"} size={14} /><span>{p.label}</span>{#if p.kind === "note"}<small>{p.rel.split("/").slice(0, -1).join("/")}</small>{/if}
              </button></li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>

    <section>
      <h3 class="label">Tags</h3>
      <div class="chips">
        {#each d.tags ?? [] as t (t)}<span class="chip on picked">#{t}<button type="button" aria-label="Remove #{t}" onclick={() => (d.tags = toggle(d.tags, t))}>×</button></span>{/each}
      </div>
      <div class="find">
        <input class="input" bind:value={tagQ} placeholder="Add a tag" aria-label="Add a tag" />
        {#if tagHits.length}
          <ul class="hits">
            {#each tagHits as t (t)}<li><button type="button" onclick={() => { d.tags = toggle(d.tags, t); tagQ = ""; }}>#{t}</button></li>{/each}
          </ul>
        {/if}
      </div>
    </section>

    <section>
      <label class="row"><span class="label">Exam</span>
        <select class="input" bind:value={d.exam}>
          <option value={undefined}>None</option>
          {#each examList as x (x.key)}<option value={x.key}>{x.title} · {x.date}</option>{/each}
        </select>
      </label>
      {#if d.exam}<p class="hint">Notes dated since the course's previous exam.</p>{/if}
    </section>

    <section class="lims">
      <label class="row"><span class="label">New cards a day</span>
        <input class="input num" type="number" min="0" placeholder={String(settings.newPerDay)} value={d.newPerDay ?? ""} onchange={(e) => (d.newPerDay = num(e.currentTarget.value))} /></label>
      <label class="row"><span class="label">Reviews a day</span>
        <input class="input num" type="number" min="0" placeholder={settings.reviewsPerDay ? String(settings.reviewsPerDay) : "–"} value={d.reviewsPerDay ?? ""} onchange={(e) => (d.reviewsPerDay = num(e.currentTarget.value))} /></label>
    </section>

    <footer>
      <span class="count"><b>{matched.total}</b> cards · {matched.due} due · {matched.new} new</span>
      {#if error}<span class="err">{error}</span>{/if}
      {#if id}<button type="button" class="btn quiet danger" onclick={remove}>{confirmDel ? "Delete deck?" : "Delete"}</button>{/if}
      <button type="submit" class="btn primary">{id ? "Save" : "Create"}</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(600px, calc(100vw - 24px));
    max-height: calc(100vh - 32px);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface-float, var(--surface));
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  form {
    display: grid;
    gap: 14px;
    padding: 22px;
  }
  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: center;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border: 0;
    border-radius: 14px;
    background: var(--chip);
    color: var(--text);
    cursor: pointer;
  }
  .name {
    font-size: 19px;
    font-weight: 600;
  }
  .x {
    width: var(--hit);
    height: var(--hit);
    border: 0;
    border-radius: 50%;
    background: transparent;
    font-size: 24px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .picker {
    border-radius: 16px;
    background: var(--panel);
    padding: 8px;
  }
  section {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--hairline);
  }
  section > .label,
  .row > .label {
    font-size: 13px;
    font-weight: 600;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    --c: var(--accent);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: var(--chip);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .chip.on {
    background: color-mix(in srgb, var(--c) 32%, var(--white));
    font-weight: 600;
  }
  .chip.picked {
    cursor: default;
    padding-right: 4px;
  }
  .chip.picked button {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
  }
  .find {
    position: relative;
  }
  .hits {
    position: absolute;
    z-index: 5;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 6px;
    list-style: none;
    border-radius: 14px;
    background: var(--surface-float, var(--surface));
    box-shadow: var(--shadow-lift);
  }
  .hits button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
  }
  .hits button:hover {
    background: var(--chip);
  }
  .hits small {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 12px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .row select {
    max-width: 340px;
  }
  .num {
    width: 96px;
  }
  .hint {
    margin: 0;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding-top: 14px;
    border-top: 1px solid var(--hairline);
  }
  .count {
    margin-right: auto;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .count b {
    color: var(--text);
  }
  .err {
    font-size: 13px;
    color: var(--alert-ink);
  }
  .danger {
    color: var(--alert-ink);
  }
</style>
