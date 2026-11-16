<script lang="ts" module>
  export type Panel = "outline" | "cards" | "backlinks" | "links";
  export const PANELS: { id: Panel; label: string; icon: string }[] = [
    { id: "outline", label: "Outline", icon: "list" },
    { id: "cards", label: "Cards in this note", icon: "cards" },
    { id: "backlinks", label: "Backlinks", icon: "backlink" },
    { id: "links", label: "Links", icon: "link" },
  ];
</script>

<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import { fromKey } from "../../lib/calendar";
  import { cardHtml, extractCards } from "../../lib/cards";
  import { plainText, splitNote, type Meta } from "../../lib/notes";
  import { courseByName } from "../../lib/stores/courses.svelte";
  import { backlinks, imageUrl, noteHref, resolveLink, type NoteEntry } from "../../lib/stores/notes.svelte";
  import { pdfHref, pdfName } from "../../lib/stores/pdfs.svelte";
  import { fmtInterval, statusOf, type SrsRec } from "../../lib/stores/srs.svelte";
  import { get } from "../../lib/stores/synced.svelte";

  let {
    which,
    note,
    meta,
    titleLines,
    ongotoline,
    ongotoheading,
    onopenlink,
  }: {
    which: Panel;
    note: NoteEntry;
    meta: Meta;
    titleLines: number;
    ongotoline: (line: number) => void;
    ongotoheading: (text: string, nth: number) => void;
    onopenlink: (name: string) => void;
  } = $props();

  const outline = $derived.by(() => {
    const hs = note.p.headings.filter((h, i) => !(i === 0 && h.level === 1 && h.line < titleLines));
    const seen = new Map<string, number>();
    return hs.map((h) => {
      const n = seen.get(h.text) ?? 0;
      seen.set(h.text, n + 1);
      return { ...h, nth: n };
    });
  });
  const minLevel = $derived(Math.min(6, ...outline.map((h) => h.level)));

  const cards = $derived.by(() => {
    const now = Date.now();
    return extractCards(splitNote(note.text).body).map((c) => {
      const rec = c.lineId ? get<SrsRec>("srs", c.key) : undefined;
      const st = statusOf(rec, now);
      return { c, st, when: st === "later" && rec ? fmtInterval(rec.due - now) : "" };
    });
  });
  const tally = $derived({
    due: cards.filter((x) => x.st === "review" || x.st === "learning").length,
    fresh: cards.filter((x) => x.st === "new").length,
    later: cards.filter((x) => x.st === "later").length,
  });
  const back = $derived(backlinks(note.rel));
  const outLinks = $derived(note.p.links.map((l) => ({ name: l, to: resolveLink(l) })));
  const course = $derived(meta.course ? courseByName(String(meta.course)) : undefined);
  const img = (s: string) => imageUrl(note.rel, s);
  const LABEL: Record<string, string> = { new: "New", learning: "Learning", review: "Due", later: "", suspended: "Paused" };
</script>

{#if which === "outline"}
  {#if outline.length}
    <ul class="outline">
      {#each outline as h}
        <li style="--l: {h.level - minLevel}"><button type="button" onclick={() => ongotoheading(h.text, h.nth)}>{h.text}</button></li>
      {/each}
    </ul>
  {:else}
    <p class="empty">Headings you add show up here. Type <kbd>#</kbd> and a space at the start of a line.</p>
  {/if}
{:else if which === "cards"}
  {#if cards.length}
    <div class="tally">
      {#if tally.due}<span class="pill due">{tally.due} due</span>{/if}
      {#if tally.fresh}<span class="pill new">{tally.fresh} new</span>{/if}
      {#if tally.later}<span class="pill ok">{tally.later} learned</span>{/if}
    </div>
    <ul class="cards">
      {#each cards as { c, st, when } (c.key)}
        <li>
          <button type="button" onclick={() => ongotoline(c.line)} title="Show it in the note">
            <span class="q">{@html cardHtml(c.front, img)}</span>
            <span class="a"><b>{c.kind === "reverse" ? "⇠" : "→"}</b> {@html cardHtml(c.back, img)}</span>
            <span class="st {st}">{LABEL[st] || `in ${when}`}</span>
          </button>
        </li>
      {/each}
    </ul>
    <a class="btn primary review" href="#/study/cards/review/note:{encodeURIComponent(note.rel)}">Review this note</a>
  {:else}
    <p class="empty">No flashcards yet. Type <kbd>::</kbd> between a question and its answer, select a word and press <b>Cloze</b>, or add a table of flashcards from the <kbd>/</kbd> menu.</p>
  {/if}
{:else if which === "backlinks"}
  {#if back.length}
    <ul class="bl">
      {#each back as b (b.e.rel)}<li><a href={noteHref(b.e.rel)}><b>{b.e.p.title}</b>{#if b.context}<span>{plainText(b.context)}</span>{/if}</a></li>{/each}
    </ul>
  {:else}
    <p class="empty">No notes link here yet. Type <kbd>[[</kbd> in another note and pick this one.</p>
  {/if}
{:else}
  {#if course || meta.date || typeof meta.pdf === "string"}
    <h4>Linked to</h4>
    <div class="lto">
      {#if course}<a class="lk" href="#/courses/{course[0]}" style="--c: {course[1].color}"><span class="cd"></span>{course[1].name}</a>{/if}
      {#if meta.date}<a class="lk" href="#/calendar/day"><Icon name="calendar" size={14} /> {fromKey(String(meta.date)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{meta.event ? " · class" : ""}</a>{/if}
      {#if typeof meta.pdf === "string"}<a class="lk" href={pdfHref(meta.pdf)}><Icon name="file" size={14} /> {pdfName(meta.pdf)}</a>{/if}
    </div>
  {/if}
  <h4>This note links to</h4>
  {#if outLinks.length || note.p.pdfs?.length}
    <ul class="ol">
      {#each outLinks as l}<li><button type="button" class:missing={!l.to} onclick={() => onopenlink(l.name)}>{l.name}{#if !l.to}<small> · create</small>{/if}</button></li>{/each}
      {#each note.p.pdfs ?? [] as p}<li><button type="button" onclick={() => onopenlink(p)}><Icon name="file" size={13} /> {pdfName(p)}</button></li>{/each}
    </ul>
  {:else}
    <p class="empty">Nothing yet. Type <kbd>[[</kbd> to link a note.</p>
  {/if}
{/if}

<style>
  .empty {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  kbd {
    font: inherit;
    font-weight: 700;
    padding: 0 5px;
    border-radius: 5px;
    background: var(--chip);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
  }
  .outline button,
  .ol button {
    width: 100%;
    min-height: 32px;
    padding: 0 8px 0 calc(8px + var(--l, 0) * 14px);
    border: 0;
    border-radius: 9px;
    background: none;
    font: inherit;
    font-size: 13.5px;
    text-align: left;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .outline li[style*="--l: 0"] button {
    font-weight: 600;
  }
  .outline button:hover,
  .ol button:hover {
    background: var(--panel);
  }
  .ol .missing {
    color: var(--text-muted);
    font-style: italic;
  }
  .tally {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .pill {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  .pill.due {
    background: color-mix(in srgb, var(--rose, #f2b8b5) 55%, transparent);
  }
  .pill.new {
    background: var(--panel);
  }
  .pill.ok {
    background: color-mix(in srgb, var(--sage, #a9cdc3) 50%, transparent);
  }
  .cards {
    gap: 6px;
  }
  .cards button {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 9px 11px;
    border: 0;
    border-radius: 12px;
    background: color-mix(in srgb, var(--text) 4%, var(--panel));
    font: inherit;
    font-size: 13px;
    text-align: left;
    color: var(--text);
    cursor: pointer;
    transition: transform 0.2s var(--spring, ease);
  }
  .cards button:hover {
    transform: translateX(2px);
  }
  .q {
    font-weight: 600;
  }
  .a {
    color: var(--text-muted);
  }
  .q :global(p),
  .a :global(p),
  .a :global(ul) {
    margin: 0;
  }
  .a :global(ul) {
    padding-left: 16px;
  }
  .q :global(.gap) {
    padding: 0 4px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--butter, #f7e3b0) 85%, #ffd66e);
  }
  .st {
    justify-self: start;
    margin-top: 3px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    background: var(--surface);
  }
  .st.review,
  .st.learning {
    background: color-mix(in srgb, var(--rose, #f2b8b5) 50%, transparent);
  }
  .st.later {
    background: color-mix(in srgb, var(--sage, #a9cdc3) 45%, transparent);
  }
  .review {
    display: flex;
    justify-content: center;
    margin-top: 12px;
    min-height: 40px;
  }
  .bl a {
    display: grid;
    gap: 2px;
    padding: 9px 11px;
    border-radius: 12px;
    background: var(--panel);
    text-decoration: none;
    color: var(--text);
  }
  .bl b {
    font-size: 13.5px;
    font-weight: 600;
  }
  .bl span {
    font-size: 12.5px;
    color: var(--text-muted);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  h4 {
    margin: 4px 0 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .lto {
    display: grid;
    gap: 4px;
    margin-bottom: 12px;
  }
  .lk {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 12px;
    background: var(--panel);
    text-decoration: none;
    color: var(--text);
    font-size: 13.5px;
    font-weight: 500;
  }
  .cd {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
  }
</style>
