<script lang="ts">
  // A note's version history (Nov 19, her ask): earlier versions kept on this computer while she
  // edits (notes store `snapshot`, Rust history.rs). Pick one to see what changed since, or the
  // whole version, and put it back. Restoring keeps the current text as a version first.
  import { diffCounts, lineDiff, type DiffLine } from "../../lib/lineDiff";
  import { inTauri, invoke } from "../../lib/tauri";

  let {
    open = $bindable(false),
    rel,
    current,
    onrestore,
  }: { open: boolean; rel: string; current: string; onrestore: (text: string) => Promise<void> | void } = $props();

  type Version = { t: number; size: number };
  let dialog = $state<HTMLDialogElement>();
  let list = $state<Version[]>([]);
  let loading = $state(false);
  let sel = $state<number | null>(null);
  let text = $state("");
  let view = $state<"changes" | "whole">("changes");
  let busy = $state(false);

  $effect(() => {
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      void load();
    }
  });

  async function load() {
    loading = true;
    sel = null;
    text = "";
    list = inTauri ? await invoke<Version[]>("history_list", { rel }).catch(() => []) : [];
    loading = false;
    if (list[0]) await pick(list[0].t);
  }
  async function pick(t: number) {
    sel = t;
    text = await invoke<string>("history_get", { rel, t }).catch(() => "");
  }

  // hidden card ids (<!--sd:…-->) are left out of what's shown; the rest is the file as written
  const clean = (t: string) => t.replace(/\s*<!--sd:[a-z0-9]+-->/g, "");
  const diff = $derived<DiffLine[]>(sel !== null ? lineDiff(clean(text), clean(current)) : []);
  const counts = $derived(diffCounts(diff));
  /** only the changed lines with two lines around each; long unchanged runs fold to one row */
  const shown = $derived.by(() => {
    const keep = diff.map((d, i) => d.t !== "same" || diff.slice(Math.max(0, i - 2), i + 3).some((x) => x.t !== "same"));
    const out: (DiffLine | { t: "gap"; n: number })[] = [];
    let gap = 0;
    diff.forEach((d, i) => {
      if (keep[i]) {
        if (gap) out.push({ t: "gap", n: gap });
        gap = 0;
        out.push(d);
      } else gap++;
    });
    if (gap) out.push({ t: "gap", n: gap });
    return out;
  });

  const day = (t: number) => {
    const d = new Date(t);
    const today = new Date();
    const y = new Date(Date.now() - 86_400_000);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return same(d, today) ? `Today, ${time}` : same(d, y) ? `Yesterday, ${time}` : `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
  };

  async function restore() {
    if (sel === null) return;
    busy = true;
    try {
      await onrestore(text);
      close();
    } finally {
      busy = false;
    }
  }
  function close() {
    open = false;
    dialog?.close();
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="nh-title">
  <div class="hist">
    <header>
      <h2 id="nh-title">Version history</h2>
      <button type="button" class="x" aria-label="Close" onclick={close}>×</button>
    </header>
    <div class="body">
      <ul class="vers" aria-label="Versions">
        {#if loading}
          <li class="empty">Loading…</li>
        {:else}
          {#each list as v (v.t)}
            <li><button type="button" class:on={sel === v.t} onclick={() => pick(v.t)}>{day(v.t)}</button></li>
          {:else}
            <li class="empty">No earlier versions yet. One is kept every 10 minutes while you edit.</li>
          {/each}
        {/if}
      </ul>
      <div class="pane">
        {#if sel !== null}
          <div class="bar">
            <div class="seg" role="radiogroup" aria-label="Show">
              <button type="button" role="radio" aria-checked={view === "changes"} class:on={view === "changes"} onclick={() => (view = "changes")}>Changes</button>
              <button type="button" role="radio" aria-checked={view === "whole"} class:on={view === "whole"} onclick={() => (view = "whole")}>Whole version</button>
            </div>
            {#if view === "changes"}<span class="cnt"><b class="add">+{counts.add}</b> <b class="del">−{counts.del}</b> since</span>{/if}
          </div>
          {#if view === "changes"}
            <div class="lines">
              {#each shown as l, i (i)}
                {#if l.t === "gap"}<div class="gap">{l.n} unchanged line{l.n === 1 ? "" : "s"}</div>
                {:else}<div class="ln {l.t}" class:blank={!l.text.trim()}><span class="mk">{l.t === "add" ? "+" : l.t === "del" ? "−" : ""}</span>{l.text.trim() ? l.text : "\u00a0"}</div>{/if}
              {:else}
                <div class="gap">Same as now.</div>
              {/each}
            </div>
          {:else}
            <pre class="lines whole">{clean(text)}</pre>
          {/if}
        {/if}
      </div>
    </div>
    <footer>
      <span class="hint">Kept on this computer.</span>
      <button type="button" class="btn quiet" onclick={close}>Close</button>
      <button type="button" class="btn primary" disabled={sel === null || busy || !counts.add && !counts.del} onclick={restore}>{busy ? "Restoring…" : "Restore this version"}</button>
    </footer>
  </div>
</dialog>

<style>
  dialog {
    width: min(980px, calc(100vw - 32px));
    height: min(680px, calc(100vh - 48px));
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
  .hist {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
  }
  header {
    border-bottom: 1px solid var(--hairline);
  }
  footer {
    border-top: 1px solid var(--hairline);
    justify-content: flex-end;
  }
  h2 {
    margin: 0;
    flex: 1;
    font-size: 18px;
    font-weight: 600;
  }
  .x {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
  }
  .hint {
    margin-right: auto;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .body {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    min-height: 0;
  }
  .vers {
    margin: 0;
    padding: 10px;
    list-style: none;
    overflow-y: auto;
    border-right: 1px solid var(--hairline);
  }
  .vers button {
    width: 100%;
    padding: 9px 12px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
  }
  .vers button:hover {
    background: var(--chip);
  }
  .vers button.on {
    background: color-mix(in srgb, var(--accent) 20%, var(--white));
    font-weight: 600;
  }
  .empty {
    padding: 10px 12px;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .pane {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px 8px;
  }
  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--chip);
  }
  .seg button {
    padding: 5px 12px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--surface, var(--white));
    color: var(--text);
  }
  .cnt {
    font-size: 13px;
    color: var(--text-muted);
  }
  .cnt .add {
    color: var(--go-ink);
  }
  .cnt .del {
    color: var(--alert-ink);
  }
  .lines {
    margin: 0 16px 16px;
    padding: 8px 0;
    overflow: auto;
    border-radius: 12px;
    background: var(--panel);
    font: 13px/1.6 ui-monospace, "JetBrains Mono", monospace;
    font-variant-ligatures: none;
  }
  .whole {
    padding: 12px 16px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .ln {
    padding: 0 14px 0 8px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .mk {
    display: inline-block;
    width: 18px;
    color: var(--text-muted);
  }
  .ln.add {
    background: color-mix(in srgb, var(--sage) 35%, transparent);
  }
  .ln.del {
    background: color-mix(in srgb, var(--rose) 35%, transparent);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--alert-ink) 50%, transparent);
  }
  .ln.blank {
    text-decoration: none;
  }
  .gap {
    padding: 2px 34px;
    font-size: 12px;
    color: var(--text-muted);
    font-family: inherit;
  }
  @media (max-width: 700px) {
    .body {
      grid-template-columns: 1fr;
      grid-template-rows: 160px 1fr;
    }
    .vers {
      border-right: 0;
      border-bottom: 1px solid var(--hairline);
    }
  }
</style>
