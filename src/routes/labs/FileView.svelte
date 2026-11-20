<script lang="ts">
  // A file in Materials that Mosaic doesn't open itself (slides, documents, spreadsheets, pictures,
  // anything): name, kind, size, where it is, Open (in the computer's own app), Show in file
  // manager, Star, Lecture. Pictures are shown right here.
  import Icon from "../../lib/components/Icon.svelte";
  import LectureMenu from "../../lib/components/LectureMenu.svelte";
  import { encodeRel, folderHref, inherited, parentRel, type Item } from "../../lib/stores/labs.svelte";
  import { fileType } from "../../lib/stores/linkInfo.svelte";
  import { openFile, reveal } from "../../lib/stores/fileOps.svelte";
  import { isStarred, toggleStar } from "../../lib/stores/outline.svelte";
  import { inTauri } from "../../lib/tauri";

  let { item }: { item: Item } = $props();
  const t = $derived(fileType(item.name));
  const link = $derived({ kind: "file" as const, ref: item.rel });
  const course = $derived(inherited(parentRel(item.rel), "course") ?? "");
  const size = $derived(item.size > 1e6 ? `${(item.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(item.size / 1e3))} KB`);
  const folder = $derived(parentRel(item.rel));
</script>

<section class="fv">
  <a class="back" href={folderHref(folder)}><Icon name="back" size={16} /> {folder ? folder.split("/").pop() : "Files"}</a>
  <header class="card head">
    <span class="tile g-{t.group}"><Icon name={t.icon} size={30} /></span>
    <div class="who">
      <h1>{item.name.replace(/\.[^.]+$/, "")}</h1>
      <span class="meta">{t.name} · {size}{folder ? ` · ${folder.split("/").join(" › ")}` : ""}</span>
    </div>
    <div class="acts">
      {#if course}<LectureMenu {link} {course} />{/if}
      <button type="button" class="btn quiet" onclick={() => toggleStar(link)}><Icon name="star" size={15} /> {isStarred(link) ? "Starred" : "Star"}</button>
      <button type="button" class="btn quiet" onclick={() => reveal("mat", item.rel)} disabled={!inTauri}><Icon name="external" size={15} /> Show in folder</button>
      <button type="button" class="btn primary" onclick={() => openFile("mat", item.rel)} disabled={!inTauri}><Icon name="i:chevron-right" size={15} /> Open</button>
    </div>
  </header>
  {#if t.group === "image"}
    <div class="card pic"><img src="/__labs/{encodeRel(item.rel)}" alt={item.name} /></div>
  {/if}
</section>

<style>
  .fv {
    display: grid;
    gap: 16px;
    align-content: start;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: start;
    min-height: 36px;
    padding: 0 14px 0 10px;
    border-radius: var(--radius-pill);
    background: var(--chip);
    color: var(--text);
    text-decoration: none;
    font-size: 14px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    padding: 20px 22px;
  }
  .tile {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--chip);
  }
  .g-slides { background: color-mix(in srgb, var(--peach) 45%, var(--white)); }
  .g-doc { background: color-mix(in srgb, var(--lavender) 40%, var(--white)); }
  .g-sheet { background: color-mix(in srgb, var(--sage) 40%, var(--white)); }
  .g-image { background: color-mix(in srgb, var(--rose) 35%, var(--white)); }
  .who {
    flex: 1;
    min-width: 200px;
    display: grid;
    gap: 4px;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .meta {
    font-size: 14px;
    color: var(--text-muted);
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .pic {
    padding: 12px;
    display: grid;
    place-items: center;
  }
  .pic img {
    max-width: 100%;
    max-height: 70vh;
    border-radius: 14px;
  }
</style>
