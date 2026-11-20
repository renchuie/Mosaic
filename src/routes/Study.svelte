<script lang="ts">
  import { route } from "../lib/router.svelte";
  import NotesView from "./study/NotesView.svelte";
  import StudyHome from "./study/StudyHome.svelte";
  import StudyNav from "./study/StudyNav.svelte";
  import CardBrowser from "./study/CardBrowser.svelte";
  import CardStats from "./study/CardStats.svelte";
  import DeckPage from "./study/DeckPage.svelte";
  import AddCard from "./study/AddCard.svelte";
  import PlayView from "./study/PlayView.svelte";
  import CardsView from "./study/CardsView.svelte";
  import ReviewSession from "./study/ReviewSession.svelte";
  import { parseScope, type Scope } from "../lib/stores/srs.svelte";
  import Library from "./study/library/Library.svelte";
  import PdfsHome from "./study/pdfs/PdfsHome.svelte";
  import FilesView from "./study/FilesView.svelte";
  import PdfViewer from "./study/pdfs/PdfViewer.svelte";
  import { parsePdfRoute } from "../lib/stores/pdfs.svelte";

  const noteRel = $derived(route.rest.startsWith("notes/") ? route.rest.slice(6) : null);
  // the Notes pages draw their own top bar (same strip) and fill the panel
  const notesPages = $derived(/^notes(\/|$)/.test(route.rest));
  // #/study/cards/review/<scope> or #/study/cards/cram/<scope>; scope = all | library | deck:<id> | course:<name> | note:<rel>
  const cram = $derived(route.rest.startsWith("cards/cram"));
  const scope = $derived.by((): Scope | null => {
    if (!route.rest.startsWith("cards/review") && !cram) return null;
    return parseScope(route.rest.replace(/^cards\/(review|cram)\/?/, ""));
  });
  // #/study/cards/play/<type|test|match>/<scope>
  const play = $derived.by(() => {
    const m = /^cards\/play\/(type|test|match)\/(.*)$/.exec(route.rest);
    return m ? { mode: m[1] as "type" | "test" | "match", scope: parseScope(m[2]) } : null;
  });
  // #/study/pdfs/<rel>?p=<page>
  const pdf = $derived(route.rest.startsWith("pdfs/") ? parsePdfRoute(route.rest.slice(5)) : null);
  // the PDFs tab is gone (Nov 20): its home is Files, showing PDFs
  $effect(() => {
    if (route.rest === "pdfs") location.replace("#/study/files?kind=pdf");
  });
  const libItem = $derived(route.rest.startsWith("cards/library/") ? route.rest.slice("cards/library/".length) : null);
</script>

<div class="study" class:fill={notesPages || !!scope || !!play}>
  {#if !scope && !notesPages && !play}<StudyNav />{/if}
  {#if play}
    {#key route.rest}<PlayView mode={play.mode} scope={play.scope} />{/key}
  {:else if scope}
    {#key route.rest}<ReviewSession {scope} {cram} />{/key}
  {:else if route.rest.startsWith("cards/browse")}
    <CardBrowser />
  {:else if route.rest.startsWith("cards/add")}
    {#key route.rest}<AddCard />{/key}
  {:else if route.rest.startsWith("cards/deck/")}
    {#key route.rest}<DeckPage scope={parseScope(route.rest.slice("cards/deck/".length))} />{/key}
  {:else if route.rest.startsWith("cards/stats")}
    <CardStats />
  {:else if route.rest.startsWith("cards/library")}
    <Library open={libItem} />
  {:else if route.rest.startsWith("cards")}
    <CardsView />
  {:else if pdf}
    {#key pdf.rel}<PdfViewer rel={pdf.rel} startPage={pdf.page} />{/key}
  {:else if route.rest.startsWith("files")}
    <FilesView />
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
