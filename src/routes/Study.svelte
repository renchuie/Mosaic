<script lang="ts">
  import { route } from "../lib/router.svelte";
  import NotesView from "./study/NotesView.svelte";
  import StudyHome from "./study/StudyHome.svelte";
  import StudyNav from "./study/StudyNav.svelte";
  import CardsView from "./study/CardsView.svelte";
  import ReviewSession from "./study/ReviewSession.svelte";
  import type { Scope } from "../lib/stores/srs.svelte";
  import Library from "./study/library/Library.svelte";
  import PdfsHome from "./study/pdfs/PdfsHome.svelte";
  import PdfViewer from "./study/pdfs/PdfViewer.svelte";
  import { parsePdfRoute } from "../lib/stores/pdfs.svelte";

  const noteRel = $derived(route.rest.startsWith("notes/") ? route.rest.slice(6) : null);
  // the Notes pages draw their own top bar (same strip) and fill the panel
  const notesPages = $derived(/^notes(\/|$)/.test(route.rest));
  // #/study/cards/review/<scope> or #/study/cards/cram/<scope>; scope = all | library | course:<name> | note:<rel>
  const cram = $derived(route.rest.startsWith("cards/cram"));
  const scope = $derived.by((): Scope | null => {
    if (!route.rest.startsWith("cards/review") && !cram) return null;
    const s = route.rest.replace(/^cards\/(review|cram)\/?/, "");
    if (s.startsWith("course:")) return { kind: "course", name: s.slice(7) };
    if (s.startsWith("note:")) return { kind: "note", rel: s.slice(5) };
    if (s === "library") return { kind: "library" };
    return { kind: "all" };
  });
  // #/study/pdfs/<rel>?p=<page>
  const pdf = $derived(route.rest.startsWith("pdfs/") ? parsePdfRoute(route.rest.slice(5)) : null);
  const libItem = $derived(route.rest.startsWith("cards/library/") ? route.rest.slice("cards/library/".length) : null);
</script>

<div class="study" class:fill={notesPages || !!scope}>
  {#if !scope && !notesPages}<StudyNav />{/if}
  {#if scope}
    {#key route.rest}<ReviewSession {scope} {cram} />{/key}
  {:else if route.rest.startsWith("cards/library")}
    <Library open={libItem} />
  {:else if route.rest.startsWith("cards")}
    <CardsView />
  {:else if pdf}
    {#key pdf.rel}<PdfViewer rel={pdf.rel} startPage={pdf.page} />{/key}
  {:else if route.rest.startsWith("pdfs")}
    <PdfsHome />
  {:else if route.rest.startsWith("notes")}
    <NotesView rel={noteRel} />
  {:else}
    <StudyHome />
  {/if}
</div>

<style>
  .study {
    display: grid;
    min-width: 0;
  }
  /* an open note fills the (flush) main panel */
  .study.fill {
    height: 100%;
    grid-template-rows: minmax(0, 1fr);
  }
</style>
