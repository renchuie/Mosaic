<script lang="ts">
  // Deck rows (canvas "Flashcards tab: A + C"): Deck · New · Learn · Due, group headings, ▸ / ▾ for
  // sub-decks, an icon tile, an exam pill; hovering a row shows Study, ＋ (add a card) and ⚙ (her
  // own decks). The name opens the deck's page. Used on the Cards home and a parent deck's page.
  import Icon from "../../lib/components/Icon.svelte";
  import { deckOpen, toggleOpen, type DeckGroup, type DeckRow } from "../../lib/stores/deckTree.svelte";

  let { groups, head = "Deck", onoptions }: { groups: DeckGroup[]; head?: string; onoptions?: (deckId: string) => void } = $props();
  const enc = (s: string) => encodeURIComponent(s);
  const due = (r: DeckRow) => Math.max(0, r.k.due - r.k.learning);
</script>

{#snippet row(r: DeckRow, depth: number)}
  {@const open = deckOpen.keys.includes(r.key)}
  <div class="drow" class:top={depth === 0} style="--tint: {r.tint}; --depth: {depth}">
    <span class="nm">
      {#if r.kids.length}
        <button type="button" class="tw" class:on={open} aria-label={open ? `Close ${r.name}` : `Open ${r.name}`} aria-expanded={open} onclick={() => toggleOpen(r.key)}><Icon name="i:chevron-right" size={14} /></button>
      {:else}<span class="tw"></span>{/if}
      <span class="ic"><Icon name={r.icon} size={16} /></span>
      <a class="name" href="#/study/cards/deck/{enc(r.key)}">{r.name}</a>
      {#if r.pill}<span class="lk" class:ex={r.pill.exam}>{r.pill.text}</span>{/if}
    </span>
    <span class="c n new" class:zero={!r.k.newToday}>{r.k.newToday}</span>
    <span class="c n learn" class:zero={!r.k.learning}>{r.k.learning}</span>
    <span class="c n due" class:zero={!due(r)}>{due(r)}</span>
    <span class="acts">
      {#if r.k.due + r.k.newToday}<a class="btn sm dark" href="#/study/cards/review/{enc(r.key)}">Study</a>{/if}
      <a class="btn sm ib" href="#/study/cards/library" title="Add card" aria-label="Add card to {r.name}"><Icon name="i:plus" size={14} /></a>
      {#if r.deck && onoptions}<button type="button" class="btn sm ib" title="Options" aria-label="Options for {r.name}" onclick={() => onoptions?.(r.deck!)}><Icon name="i:settings" size={14} /></button>{/if}
    </span>
  </div>
  {#if open}{#each r.kids as kid (kid.key)}{@render row(kid, depth + 1)}{/each}{/if}
{/snippet}

<div class="decks">
  <div class="drow head" aria-hidden="true"><span>{head}</span><span class="c">New</span><span class="c">Learn</span><span class="c">Due</span><span></span></div>
  {#each groups as g (g.title)}
    {#if g.title}<div class="grp">{g.title}</div>{/if}
    {#each g.rows as r (r.key)}{@render row(r, 0)}{/each}
  {/each}
</div>

<style>
  .decks {
    display: grid;
    gap: 2px;
    container-type: inline-size;
  }
  .drow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px 56px 56px 128px;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 4px 12px;
    border-radius: 14px;
    font-size: 15px;
  }
  .drow.head {
    min-height: 0;
    padding-block: 4px;
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .drow:not(.head):hover,
  .drow:not(.head):focus-within {
    background: color-mix(in srgb, var(--text) 4.5%, transparent);
  }
  .nm {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding-left: calc(var(--depth) * 26px);
  }
  .tw {
    flex: none;
    display: grid;
    place-items: center;
    width: 18px;
    height: 24px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tw :global(svg) {
    transition: transform 0.18s var(--ease-out, ease);
  }
  .tw.on :global(svg) {
    transform: rotate(90deg);
  }
  .ic {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--tint) 32%, var(--white));
    color: var(--text);
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    text-decoration: none;
  }
  .top .name {
    font-weight: 700;
  }
  .name:hover {
    text-decoration: underline;
  }
  .lk {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .lk.ex {
    background: color-mix(in srgb, var(--rose) 30%, var(--white));
    color: var(--alert-ink);
  }
  .c {
    text-align: right;
  }
  .n {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .n.new {
    color: var(--link-ink);
  }
  .n.learn {
    color: var(--alert-ink);
  }
  .n.due {
    color: var(--go-ink);
  }
  .n.zero {
    color: var(--text-muted);
    opacity: 0.45;
    font-weight: 500;
  }
  .acts {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .drow:hover .acts,
  .drow:focus-within .acts {
    opacity: 1;
  }
  .btn.sm {
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }
  .btn.ib {
    width: 32px;
    padding: 0;
    justify-content: center;
  }
  .btn.dark {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
  }
  .grp {
    padding: 14px 12px 4px;
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  @container (max-width: 560px) {
    .drow {
      grid-template-columns: minmax(0, 1fr) 40px 40px 40px;
    }
    .acts,
    .drow.head span:last-child {
      display: none;
    }
    .lk {
      display: none;
    }
  }
  @media (hover: none) {
    .acts {
      opacity: 1;
    }
  }
</style>
