<script lang="ts">
  // A folder tile (from the mockups): a tab on top and a frosted body. The open folder
  // (`open`, e.g. the one used last) takes its colour and shows a few sheets peeking out;
  // any folder shows its sheets when hovered. Sheets are note snippets or PDF page sketches.
  type Sheet = { title?: string; text?: string; head?: string };
  let {
    name,
    color = "#C9B5F5",
    lines = [],
    href,
    onclick,
    open = false,
    sheets = [],
    pages = false,
    icon = "",
    over = false,
  }: {
    name: string;
    color?: string;
    lines?: string[];
    href?: string;
    onclick?: () => void;
    open?: boolean;
    sheets?: Sheet[];
    /** draw sheets as little PDF pages instead of note snippets */
    pages?: boolean;
    /** an emoji in place of the colour dot */
    icon?: string;
    /** something is being dragged over it and would drop here */
    over?: boolean;
  } = $props();
</script>

<div class="fold" class:open class:over class:has={sheets.length > 0} style="--c: {color}">
  <span class="back" aria-hidden="true"></span>
  {#each sheets.slice(0, 2) as s, i}
    <span class="sheet s{i}" class:page={pages} aria-hidden="true">
      {#if pages}
        <em style="background: {s.head ?? 'color-mix(in srgb, var(--c) 45%, var(--white))'}"></em><i></i><i class="short"></i><i class="hl"></i><i></i><i class="short"></i>
      {:else}
        <b>{s.title}</b>{#if s.text}<span>{s.text}</span>{/if}
      {/if}
    </span>
  {/each}
  {#if href}
    <a class="front" {href}>
      <span class="name">{#if icon}<span class="ico">{icon}</span>{:else}<span class="dot"></span>{/if}{name}</span>
      {#each lines as l}<span class="line">{l}</span>{/each}
    </a>
  {:else}
    <button type="button" class="front" {onclick}>
      <span class="name">{#if icon}<span class="ico">{icon}</span>{:else}<span class="dot"></span>{/if}{name}</span>
      {#each lines as l}<span class="line">{l}</span>{/each}
    </button>
  {/if}
</div>

<style>
  .ico {
    flex: none;
    font-size: 17px;
    line-height: 1;
  }
  .fold.over {
    transform: scale(1.04);
    transition: transform 0.25s var(--spring);
  }
  .fold.over :is(.front, .back) {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 70%, var(--white)), var(--shadow-lift);
  }
  .front {
    -webkit-user-drag: none;
  }
  .fold {
    position: relative;
    height: 196px;
    min-width: 0;
    animation: pop-in var(--t-slow) var(--spring) backwards;
  }
  .back {
    position: absolute;
    inset: 16px 0 0;
    border-radius: 22px;
    background: color-mix(in srgb, var(--c) 22%, var(--surface));
    transition: background-color var(--t) ease;
  }
  .back::before {
    content: "";
    position: absolute;
    left: 0;
    top: -16px;
    width: 44%;
    height: 34px;
    border-radius: 16px 16px 0 0;
    background: inherit;
  }
  .sheet {
    position: absolute;
    left: 6%;
    right: 26%;
    top: 30px;
    height: 118px;
    padding: 10px 12px;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 6px 16px -8px rgba(40, 44, 80, 0.35);
    font-size: 11.5px;
    line-height: 1.35;
    color: #3b3f55;
    overflow: hidden;
    opacity: 0;
    transform: translateY(26px) rotate(0deg);
    transition: transform 0.5s var(--spring), opacity var(--t-fast) ease;
  }
  .sheet b {
    display: block;
    font-weight: 600;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sheet.s1 {
    left: 28%;
    right: 5%;
    top: 40px;
  }
  .sheet.page {
    left: 16%;
    right: auto;
    width: 92px;
    height: 124px;
    padding: 0 0 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .sheet.page.s1 {
    left: 46%;
  }
  .sheet.page em {
    display: block;
    height: 24px;
    margin-bottom: 4px;
  }
  .sheet.page i {
    display: block;
    height: 5px;
    margin: 0 9px;
    border-radius: 3px;
    background: #e6e7ef;
  }
  .sheet.page i.short {
    margin-right: 28px;
  }
  .sheet.page i.hl {
    background: #ffe17a;
  }
  .front {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: 44px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 2px;
    padding: 16px 18px;
    border: var(--edge);
    border-radius: 22px;
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text);
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition: top 0.5s var(--spring), transform var(--t) var(--spring), box-shadow var(--t) var(--ease-out), background var(--t) ease;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.25;
  }
  .dot {
    width: 10px;
    height: 10px;
    flex: none;
    border-radius: 50%;
    background: var(--c);
  }
  .line {
    font-size: 13px;
    color: var(--text-muted);
  }

  /* open: coloured, sheets out */
  .fold.open .back {
    background: color-mix(in srgb, var(--c) 70%, var(--white));
  }
  .fold.open .front {
    top: 86px;
    background: linear-gradient(165deg, color-mix(in srgb, var(--c) 40%, color-mix(in srgb, var(--white) 80%, transparent)), color-mix(in srgb, var(--c) 75%, var(--white)));
  }
  .fold.open .line {
    color: var(--text);
  }
  .fold.open .dot {
    background: var(--text);
  }
  .fold.open .sheet,
  .fold.has:hover .sheet,
  .fold.has:focus-within .sheet {
    opacity: 1;
    transform: translateY(0) rotate(-4deg);
  }
  .fold.open .sheet.s1,
  .fold.has:hover .sheet.s1,
  .fold.has:focus-within .sheet.s1 {
    transform: translateY(0) rotate(3deg);
    transition-delay: 40ms;
  }
  .fold.has:hover .front,
  .fold.has:focus-within .front {
    top: 86px;
  }
  .fold:hover .front {
    box-shadow: var(--shadow-lift);
  }
  .fold:active .front {
    transform: scale(0.98);
  }
</style>
