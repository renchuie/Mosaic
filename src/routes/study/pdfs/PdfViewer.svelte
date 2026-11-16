<script lang="ts">
  // PDF viewer with annotations saved into the PDF (pdf.js draws the page without our
  // marks; we draw ours on top as SVG and write them back with pdf-lib, see pdfAnnots.ts).
  // Tools: select (menu on selected text), highlight, underline, strike, box, pen, note.
  // Highlights turn into cards (cloze / question) or quotes in the PDF's note; a box turns
  // into an image occlusion card.
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist/legacy/build/pdf.mjs";
  import Icon from "../../../lib/components/Icon.svelte";
  import { pdfjs } from "../../../lib/pdfjs";
  import { HIGHLIGHTS, bbox, mergeLines, newAnnotId, readAnnots, writeAnnots, type AnnotKind, type PdfAnnot, type Rect } from "../../../lib/pdfAnnots";
  import {
    appendToNote, courseOfPdf, pdfInfo, pdfName, pdfNote, quoteFor, readPdf, restorePdf, setPdfInfo, writePdf,
  } from "../../../lib/stores/pdfs.svelte";
  import { noteHref } from "../../../lib/stores/notes.svelte";
  import { getItem } from "../../../lib/stores/library.svelte";
  import { inTauri, invoke } from "../../../lib/tauri";
  import CardFromText from "./CardFromText.svelte";
  import OcclusionEditor from "../library/OcclusionEditor.svelte";

  let { rel, startPage }: { rel: string; startPage?: number } = $props();

  type Tool = "select" | "highlight" | "underline" | "strike" | "box" | "pen" | "note";
  const TOOLS: { id: Tool; label: string; key: string }[] = [
    { id: "select", label: "Select text", key: "v" },
    { id: "highlight", label: "Highlight", key: "h" },
    { id: "underline", label: "Underline", key: "u" },
    { id: "strike", label: "Strike through", key: "s" },
    { id: "box", label: "Box (for occlusion cards)", key: "b" },
    { id: "pen", label: "Pen", key: "p" },
    { id: "note", label: "Sticky note", key: "n" },
  ];
  const KIND_LABEL: Record<AnnotKind, string> = { highlight: "Highlight", underline: "Underline", strike: "Strike", box: "Box", pen: "Drawing", note: "Note" };

  // ---- document state --------------------------------------------------------------------
  let doc: PDFDocumentProxy | null = null;
  let lib: Awaited<ReturnType<typeof pdfjs>> | null = null;
  let vps = $state.raw<PageViewport[]>([]); // scale 1
  let status = $state<"loading" | "ready" | "error">("loading");
  let loadError = $state("");
  let readOnly = $state(false);
  let readOnlyWhy = $state("");
  let backed = $state(false);
  let orig: Uint8Array = new Uint8Array();
  let mtime = 0;
  let annots = $state<PdfAnnot[]>([]);
  let outline = $state.raw<{ title: string; page: number; level: number }[]>([]);

  // ---- view state --------------------------------------------------------------------------
  let zoom = $state(1);
  let fitWidth = $state(true);
  let current = $state(1);
  let pageInput = $state("1");
  let scroller = $state<HTMLDivElement>();
  const pageEls: HTMLDivElement[] = [];
  let tool = $state<Tool>("select");
  let color = $state(HIGHLIGHTS[0].color);
  let penColor = $state("#e3949b");
  let active = $state<string | null>(null);
  let selMenu = $state<{ page: number; rects: Rect[]; text: string; x: number; y: number } | null>(null);
  let side = $state<"marks" | "outline" | null>(typeof window !== "undefined" && window.innerWidth > 1100 ? "marks" : null);
  let toast = $state<{ text: string; href?: string; link?: string } | null>(null);
  let confirmRestore = $state(false);
  let moreOpen = $state(false);
  let menuW = $state(360);
  const name = $derived(pdfName(rel));
  const course = $derived(courseOfPdf(rel));

  // ---- saving ------------------------------------------------------------------------------
  let save = $state<"saved" | "unsaved" | "saving" | "failed">("saved");
  let saveError = $state("");
  let edits = 0;
  let timer = 0;
  let saving: Promise<void> | null = null;
  let onDisk = new Set<string>(); // ids in the file as last read / written
  const deletedHere = new Set<string>();

  function changed() {
    if (readOnly) return;
    edits++;
    save = "unsaved";
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), 900);
  }

  async function flush(): Promise<void> {
    window.clearTimeout(timer);
    if (readOnly || (save !== "unsaved" && save !== "failed")) return;
    if (saving) return saving.then(() => flush());
    const n = edits;
    saving = (async () => {
      save = "saving";
      try {
        const snap = $state.snapshot(annots) as PdfAnnot[];
        const bytes = await writeAnnots(orig, snap);
        mtime = await writePdf(rel, bytes, mtime);
        orig = bytes;
        backed = true;
        onDisk = new Set(snap.map((a) => a.id));
        deletedHere.clear();
        setPdfInfo(rel, { annots: snap.length });
        save = edits === n ? "saved" : "unsaved";
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (msg.includes("conflict")) {
          await mergeFromDisk();
          save = "unsaved";
        } else {
          save = "failed";
          saveError = msg;
        }
      }
    })().finally(() => (saving = null));
    await saving;
    if (save === "unsaved") timer = window.setTimeout(() => void flush(), 300);
  }

  /** The file changed on disk (the other computer saved marks): merge both sets. */
  async function mergeFromDisk() {
    const r = await readPdf(rel);
    const parsed = await readAnnots(r.bytes);
    const theirs = new Map(parsed.annots.map((a) => [a.id, a]));
    const out: PdfAnnot[] = [];
    for (const a of annots) {
      const t = theirs.get(a.id);
      if (t) {
        out.push((t.updated ?? t.created) > (a.updated ?? a.created) ? t : $state.snapshot(a) as PdfAnnot);
        theirs.delete(a.id);
      } else if (!onDisk.has(a.id)) out.push($state.snapshot(a) as PdfAnnot); // new here
      // else: deleted on the other computer
    }
    for (const t of theirs.values()) if (!deletedHere.has(t.id)) out.push(t);
    annots = out;
    orig = r.bytes;
    mtime = r.mtime;
    onDisk = new Set(parsed.annots.map((a) => a.id));
    if (parsed.pages !== vps.length) await openDoc(parsed.clean);
  }

  async function checkDisk() {
    if (!inTauri || status !== "ready" || save !== "saved") return;
    try {
      const [m] = await invoke<[number, boolean]>("pdfs_stat", { rel });
      if (m !== mtime) await mergeFromDisk();
    } catch {
      /* gone or unmounted: keep what is on screen */
    }
  }

  // ---- loading -----------------------------------------------------------------------------
  async function openDoc(clean: Uint8Array) {
    lib ??= await pdfjs();
    const old = doc;
    doc = await lib.getDocument({ data: clean.slice(), isEvalSupported: false }).promise;
    void old?.destroy();
    const v: PageViewport[] = [];
    for (let i = 1; i <= doc.numPages; i++) v.push((await doc.getPage(i)).getViewport({ scale: 1 }));
    rendered.clear();
    vps = v;
    void loadOutline();
  }

  async function load() {
    status = "loading";
    try {
      const r = await readPdf(rel);
      orig = r.bytes;
      mtime = r.mtime;
      backed = r.backed;
      let clean = r.bytes;
      try {
        const parsed = await readAnnots(r.bytes);
        annots = parsed.annots;
        clean = parsed.clean;
        readOnly = parsed.readOnly;
        readOnlyWhy = parsed.readOnly ? "This PDF is locked (encrypted), so marks can't be saved into it." : "";
      } catch {
        annots = [];
        readOnly = true;
        readOnlyWhy = "Study Desk can read this PDF but not save into it (the file is unusual or damaged).";
      }
      onDisk = new Set(annots.map((a) => a.id));
      await openDoc(clean);
      status = "ready";
      await tick();
      applyFit();
      await tick();
      goTo(startPage ?? pdfInfo(rel)?.page ?? 1, false);
      setPdfInfo(rel, { opened: Date.now(), pages: vps.length, annots: annots.length });
    } catch (e) {
      status = "error";
      loadError = String((e as Error)?.message ?? e);
    }
  }

  async function loadOutline() {
    if (!doc) return;
    const d = doc;
    const out: { title: string; page: number; level: number }[] = [];
    const walk = async (items: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>, level: number) => {
      for (const it of items ?? []) {
        let page = 0;
        try {
          const dest = typeof it.dest === "string" ? await d.getDestination(it.dest) : it.dest;
          const ref = dest?.[0];
          page = ref && typeof ref === "object" ? (await d.getPageIndex(ref)) + 1 : typeof ref === "number" ? ref + 1 : 0;
        } catch {
          /* unresolvable entry */
        }
        if (it.title?.trim()) out.push({ title: it.title.trim(), page, level });
        if (it.items?.length && level < 3) await walk(it.items, level + 1);
      }
    };
    await walk(await d.getOutline(), 0);
    outline = out;
  }

  // ---- rendering ---------------------------------------------------------------------------
  const rendered = new Map<number, number>(); // page index → zoom it was drawn at
  const visible = new Set<number>();
  let io: IntersectionObserver | null = null;
  let renderTimer = 0;

  function observe(el: HTMLDivElement, i: number) {
    pageEls[i] = el;
    io?.observe(el);
    return {
      destroy() {
        io?.unobserve(el);
      },
    };
  }

  function scheduleRender() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      for (const i of [...visible].sort((a, b) => Math.abs(a - current + 1) - Math.abs(b - current + 1))) void renderPage(i);
    }, 60);
  }

  async function renderPage(i: number) {
    if (!doc || !lib || rendered.get(i) === zoom) return;
    const el = pageEls[i];
    if (!el) return;
    const z = zoom;
    rendered.set(i, z);
    const page = await doc.getPage(i + 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let vp = page.getViewport({ scale: z * dpr });
    const max = 4096;
    if (vp.width > max || vp.height > max) vp = page.getViewport({ scale: (z * dpr * max) / Math.max(vp.width, vp.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.className = "pcanvas";
    try {
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    } catch {
      rendered.delete(i);
      return;
    }
    if (rendered.get(i) !== z) return; // zoom changed meanwhile
    el.querySelector(".cv")?.replaceChildren(canvas);
    const tl = el.querySelector<HTMLDivElement>(".textLayer");
    if (tl) {
      tl.replaceChildren();
      try {
        await new lib.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: page.getViewport({ scale: z }) }).render();
      } catch {
        /* no text layer (scanned page) */
      }
    }
    // keep memory in check on long PDFs: drop canvases far from view
    if (rendered.size > 14) {
      for (const [j] of rendered) {
        if (Math.abs(j - i) > 6 && !visible.has(j)) {
          rendered.delete(j);
          const c = pageEls[j]?.querySelector<HTMLCanvasElement>(".cv canvas");
          if (c) {
            c.width = 0;
            c.height = 0;
          }
          pageEls[j]?.querySelector(".textLayer")?.replaceChildren();
        }
      }
    }
  }

  const maxWidth = $derived(Math.max(1, ...vps.map((v) => v.width)));
  function applyFit() {
    if (!fitWidth || !scroller || !vps.length) return;
    const z = Math.min(4, Math.max(0.3, (scroller.clientWidth - 40) / maxWidth));
    if (Math.abs(z - zoom) > 0.005) setZoom(z, true);
  }
  function anchor() {
    const i = current - 1;
    const el = pageEls[i];
    if (!el || !scroller) return { i, f: 0 };
    return { i, f: (scroller.scrollTop - el.offsetTop) / el.offsetHeight };
  }
  async function setZoom(z: number, keepFit = false) {
    const a = anchor();
    zoom = Math.round(Math.min(4, Math.max(0.3, z)) * 1000) / 1000;
    if (!keepFit) fitWidth = false;
    await tick();
    const el = pageEls[a.i];
    if (el && scroller) scroller.scrollTop = el.offsetTop + a.f * el.offsetHeight;
    scheduleRender();
  }
  function goTo(p: number, smooth = true) {
    const i = Math.min(vps.length, Math.max(1, Math.round(p))) - 1;
    const el = pageEls[i];
    if (el && scroller) scroller.scrollTo({ top: el.offsetTop - 12, behavior: smooth ? "smooth" : "auto" });
    current = i + 1;
    pageInput = String(i + 1);
  }

  let posTimer = 0;
  function onScroll() {
    if (!scroller) return;
    const y = scroller.scrollTop + scroller.clientHeight * 0.3;
    let p = 1;
    for (let i = 0; i < pageEls.length; i++) if (pageEls[i] && pageEls[i].offsetTop <= y) p = i + 1;
    if (p !== current) {
      current = p;
      pageInput = String(p);
    }
    window.clearTimeout(posTimer);
    posTimer = window.setTimeout(() => setPdfInfo(rel, { page: current }), 1500);
  }

  // ---- coordinates -------------------------------------------------------------------------
  function view(i: number, r: Rect) {
    const [x1, y1, x2, y2] = vps[i].convertToViewportRectangle(r);
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  function viewPts(i: number, s: number[]) {
    const out: string[] = [];
    for (let k = 0; k + 1 < s.length; k += 2) {
      const [x, y] = vps[i].convertToViewportPoint(s[k], s[k + 1]);
      out.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return out.join(" ");
  }
  function toPdf(i: number, cx: number, cy: number): [number, number] {
    const r = pageEls[i].getBoundingClientRect();
    const [x, y] = vps[i].convertToPdfPoint((cx - r.left) / zoom, (cy - r.top) / zoom);
    return [x, y];
  }
  function clientToPdfRect(i: number, r: DOMRect | { left: number; top: number; right: number; bottom: number }): Rect {
    const a = toPdf(i, r.left, r.top);
    const b = toPdf(i, r.right, r.bottom);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }
  const byPage = $derived.by(() => {
    const m: PdfAnnot[][] = vps.map(() => []);
    for (const a of annots) m[a.page]?.push(a);
    return m;
  });

  // ---- text selection ----------------------------------------------------------------------
  function readSelection(): { page: number; rects: Rect[]; text: string; last: DOMRect }[] {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount || !scroller) return [];
    const range = s.getRangeAt(0);
    if (!scroller.contains(range.commonAncestorContainer)) return [];
    const text = s.toString().replace(/-\s*\n\s*/g, "").replace(/\s+/g, " ").trim();
    if (!text) return [];
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    const hs = rects.map((r) => r.height).sort((a, b) => a - b);
    const med = hs[Math.floor(hs.length / 2)] ?? 0;
    const groups = new Map<number, { rects: Rect[]; last: DOMRect }>();
    const boxes = pageEls.map((el) => el?.getBoundingClientRect());
    for (const r of rects) {
      if (r.height > med * 2.5) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const i = boxes.findIndex((b) => b && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom);
      if (i < 0) continue;
      const g = groups.get(i) ?? { rects: [], last: r };
      g.rects.push(clientToPdfRect(i, r));
      g.last = r;
      groups.set(i, g);
    }
    return [...groups].map(([page, g]) => ({ page, rects: mergeLines(g.rects), text, last: g.last }));
  }

  function addAnnot(a: Omit<PdfAnnot, "id" | "created">): PdfAnnot {
    const full = { ...a, id: newAnnotId(), created: Date.now() } as PdfAnnot;
    annots = [...annots, full];
    changed();
    return annots[annots.length - 1];
  }
  function patch(id: string, p: Partial<PdfAnnot>) {
    const a = annots.find((x) => x.id === id);
    if (!a) return;
    Object.assign(a, p, { updated: Date.now() });
    changed();
  }
  function remove(id: string) {
    annots = annots.filter((a) => a.id !== id);
    deletedHere.add(id);
    if (active === id) active = null;
    changed();
  }

  function markSelection(kind: "highlight" | "underline" | "strike", c = color): PdfAnnot | null {
    const parts = readSelection();
    let first: PdfAnnot | null = null;
    for (const p of parts) {
      const a = addAnnot({ page: p.page, kind, color: c, rects: p.rects, text: p.text });
      first ??= a;
    }
    window.getSelection()?.removeAllRanges();
    selMenu = null;
    return first;
  }

  function onPointerUp(e: PointerEvent) {
    if (tool === "box" || tool === "pen" || tool === "note") return;
    if ((e.target as HTMLElement).closest(".pop, .selmenu")) return;
    window.setTimeout(() => {
      const parts = readSelection();
      if (parts.length) {
        if (tool === "select") {
          const p = parts[0];
          const pr = pageEls[p.page].getBoundingClientRect();
          selMenu = { page: p.page, rects: p.rects, text: p.text, x: (p.last.right - pr.left), y: (p.last.bottom - pr.top) + 8 };
          active = null;
        } else if (!readOnly) {
          const a = markSelection(tool as "highlight" | "underline" | "strike");
          if (a) active = null;
        }
        return;
      }
      selMenu = null;
      hitTest(e);
    }, 0);
  }

  function hitTest(e: PointerEvent) {
    const el = (e.target as HTMLElement).closest<HTMLDivElement>(".page");
    if (!el) {
      active = null;
      return;
    }
    const i = Number(el.dataset.i);
    const [x, y] = toPdf(i, e.clientX, e.clientY);
    const tol = 4 / zoom;
    let best: PdfAnnot | null = null;
    let bestArea = Infinity;
    for (const a of byPage[i] ?? []) {
      const rs = a.kind === "pen" ? [bbox(a)] : a.rects;
      for (const r of rs) {
        if (x >= r[0] - tol && x <= r[2] + tol && y >= r[1] - tol && y <= r[3] + tol) {
          const area = (r[2] - r[0]) * (r[3] - r[1]);
          if (area < bestArea) (best = a), (bestArea = area);
        }
      }
    }
    active = best?.id ?? null;
  }

  // ---- drawing tools (box, pen, note) ------------------------------------------------------
  let draft = $state<{ page: number; kind: "box" | "pen"; x0: number; y0: number; x: number; y: number; pts: number[] } | null>(null);
  function drawDown(e: PointerEvent, i: number) {
    if (readOnly || e.button !== 0) return;
    const [x, y] = toPdf(i, e.clientX, e.clientY);
    if (tool === "note") {
      const s = 18;
      const a = addAnnot({ page: i, kind: "note", color, rects: [[x, y - s, x + s, y]], comment: "" });
      active = a.id;
      void tick().then(() => document.querySelector<HTMLTextAreaElement>(".pop textarea")?.focus());
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draft = { page: i, kind: tool === "pen" ? "pen" : "box", x0: x, y0: y, x, y, pts: [x, y] };
    active = null;
  }
  function drawMove(e: PointerEvent) {
    if (!draft) return;
    const [x, y] = toPdf(draft.page, e.clientX, e.clientY);
    draft.x = x;
    draft.y = y;
    if (draft.kind === "pen") {
      const n = draft.pts.length;
      if (Math.hypot(x - draft.pts[n - 2], y - draft.pts[n - 1]) > 1.2 / zoom) draft.pts.push(x, y);
    }
  }
  function drawUp() {
    if (!draft) return;
    const d = draft;
    draft = null;
    if (d.kind === "pen") {
      if (d.pts.length < 4) return;
      const pts = d.pts.map((v) => Math.round(v * 10) / 10);
      const a = addAnnot({ page: d.page, kind: "pen", color: penColor, rects: [], ink: [pts], width: 2 });
      a.rects = [bbox(a)];
      return;
    }
    const r: Rect = [Math.min(d.x0, d.x), Math.min(d.y0, d.y), Math.max(d.x0, d.x), Math.max(d.y0, d.y)];
    if (r[2] - r[0] < 6 || r[3] - r[1] < 6) return;
    const a = addAnnot({ page: d.page, kind: "box", color, rects: [r] });
    active = a.id;
  }

  // ---- links to notes and cards ------------------------------------------------------------
  let cardFor = $state<{ text: string; page: number; annot: string } | null>(null);
  let cardOpen = $state(false);
  let occOpen = $state(false);
  let occInit = $state<{ dataUrl: string; header?: string; course?: string; source?: { pdf: string; page: number } } | null>(null);
  let occAnnot = "";

  function cardFromSelection() {
    const a = markSelection("highlight");
    if (a) openCard(a);
  }
  function openCard(a: PdfAnnot) {
    cardFor = { text: a.text ?? "", page: a.page + 1, annot: a.id };
    cardOpen = true;
  }
  async function quote(a: PdfAnnot) {
    try {
      const n = await pdfNote(rel);
      await appendToNote(n, quoteFor(rel, a.page + 1, a.text ?? "", a.comment));
      patch(a.id, { note: n });
      toast = { text: "Added to the PDF's note", href: noteHref(n), link: "Open note" };
    } catch (e) {
      toast = { text: String((e as Error)?.message ?? e) };
    }
  }
  async function quoteSelection() {
    const a = markSelection("highlight");
    if (a) await quote(a);
  }
  async function quoteAll() {
    const todo = annots.filter((a) => (a.kind === "highlight" || a.kind === "underline") && a.text && !a.note);
    if (!todo.length) {
      toast = { text: "Every highlight is already in the note." };
      return;
    }
    try {
      const n = await pdfNote(rel);
      const sorted = [...todo].sort((a, b) => a.page - b.page || b.rects[0][3] - a.rects[0][3]);
      await appendToNote(n, sorted.map((a) => quoteFor(rel, a.page + 1, a.text!, a.comment)).join("\n\n"));
      for (const a of todo) patch(a.id, { note: n });
      toast = { text: `${todo.length} ${todo.length === 1 ? "highlight" : "highlights"} added to the note`, href: noteHref(n), link: "Open note" };
    } catch (e) {
      toast = { text: String((e as Error)?.message ?? e) };
    }
  }
  async function openNote() {
    try {
      location.hash = noteHref(await pdfNote(rel));
    } catch (e) {
      toast = { text: String((e as Error)?.message ?? e) };
    }
  }

  async function occlusionFrom(a: PdfAnnot) {
    if (!doc) return;
    const page = await doc.getPage(a.page + 1);
    const v = view(a.page, a.rects[0]);
    // sharp, and big enough to draw boxes on even for a small region
    const s = Math.min(6, Math.max(2.5, 640 / Math.max(1, v.w)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(v.w * s));
    canvas.height = Math.max(1, Math.round(v.h * s));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: s }), transform: [1, 0, 0, 1, -v.x * s, -v.y * s] }).promise;
    occAnnot = a.id;
    occInit = { dataUrl: canvas.toDataURL("image/png"), header: `${name}, p. ${a.page + 1}`, course, source: { pdf: rel, page: a.page + 1 } };
    occOpen = true;
  }

  async function restore() {
    confirmRestore = false;
    try {
      await restorePdf(rel);
      deletedHere.clear();
      await load();
      toast = { text: "Original restored. The marks made in Study Desk are gone." };
    } catch (e) {
      toast = { text: String((e as Error)?.message ?? e) };
    }
  }
  function openOutside(folder = false) {
    if (inTauri) void invoke("pdfs_open", { rel, folder }).catch((e) => (toast = { text: String(e) }));
  }

  // ---- keys --------------------------------------------------------------------------------
  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable], dialog")) return;
    if (e.ctrlKey && (e.key === "=" || e.key === "+")) return e.preventDefault(), void setZoom(zoom * 1.15);
    if (e.ctrlKey && e.key === "-") return e.preventDefault(), void setZoom(zoom / 1.15);
    if (e.ctrlKey && e.key === "0") return e.preventDefault(), (fitWidth = true), applyFit();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") {
      active = null;
      selMenu = null;
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && active) return e.preventDefault(), remove(active);
    if (e.key === "PageDown" || (e.key === "ArrowRight" && !active)) return e.preventDefault(), goTo(current + 1);
    if (e.key === "PageUp" || (e.key === "ArrowLeft" && !active)) return e.preventDefault(), goTo(current - 1);
    const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
    if (tl) tool = tl.id;
  }

  // ---- lifecycle ---------------------------------------------------------------------------
  let ro: ResizeObserver | null = null;
  onMount(() => {
    io = new IntersectionObserver(
      (es) => {
        for (const en of es) {
          const i = Number((en.target as HTMLElement).dataset.i);
          if (en.isIntersecting) visible.add(i);
          else visible.delete(i);
        }
        scheduleRender();
      },
      { root: scroller, rootMargin: "600px 0px" },
    );
    for (const el of pageEls) if (el) io.observe(el);
    ro = new ResizeObserver(() => applyFit());
    if (scroller) ro.observe(scroller);
    window.addEventListener("focus", checkDisk);
    void load();
  });
  onDestroy(() => {
    io?.disconnect();
    ro?.disconnect();
    window.removeEventListener("focus", checkDisk);
    if (save === "unsaved" || save === "failed") void flush();
    setPdfInfo(rel, { page: current });
    void doc?.destroy();
  });

  // a link to another page of the PDF that is already open
  let lastStart = untrack(() => startPage);
  $effect(() => {
    const p = startPage;
    untrack(() => {
      if (p && p !== lastStart && status === "ready") goTo(p);
      lastStart = p;
    });
  });
  $effect(() => {
    if (toast) {
      const t = toast;
      const h = window.setTimeout(() => toast === t && (toast = null), 5000);
      return () => window.clearTimeout(h);
    }
  });

  const activeA = $derived(annots.find((a) => a.id === active) ?? null);
  const sorted = $derived([...annots].sort((a, b) => a.page - b.page || (b.rects[0]?.[3] ?? 0) - (a.rects[0]?.[3] ?? 0)));
  const ink = (c: string) => `color-mix(in srgb, ${c} 75%, #3b3033)`;
  const saveLabel = $derived(
    readOnly ? "Read only" : save === "saving" ? "Saving…" : save === "unsaved" ? "Unsaved" : save === "failed" ? "Not saved" : annots.length || backed ? "Saved in the PDF" : "",
  );
  const popPos = (a: PdfAnnot) => {
    const v = view(a.page, a.kind === "pen" ? bbox(a) : a.rects[a.rects.length - 1]);
    const w = vps[a.page].width * zoom;
    return { left: Math.max(8, Math.min(w - 308, v.x * zoom)), top: (v.y + v.h) * zoom + 8 };
  };
</script>

<svelte:window onkeydown={onKey} />

<div class="pwrap"><div class="viewer">
  <header class="bar">
    <a class="ib" href="#/study/pdfs" aria-label="All PDFs" title="All PDFs"><Icon name="back" size={18} /></a>
    <div class="ttl">
      <b title={rel}>{name}</b>
      <span class="muted small">{#if course}{`${course} · `}{/if}<span class:warn={save === "failed"} title={save === "failed" ? saveError : backed ? "The untouched original is kept in .studydesk-originals" : ""}>{saveLabel}</span></span>
    </div>
    <div class="grp pages">
      <input class="pnum" aria-label="Page" bind:value={pageInput} onkeydown={(e) => e.key === "Enter" && goTo(Number(pageInput))} onblur={() => (pageInput = String(current))} />
      <span class="muted">/ {vps.length || "…"}</span>
    </div>
    <div class="grp">
      <button class="ib" aria-label="Zoom out" title="Zoom out (Ctrl −)" onclick={() => setZoom(zoom / 1.15)}>−</button>
      <button class="zl" title="Fit width (Ctrl 0)" onclick={() => ((fitWidth = true), applyFit())}>{Math.round(zoom * 100)}%</button>
      <button class="ib" aria-label="Zoom in" title="Zoom in (Ctrl +)" onclick={() => setZoom(zoom * 1.15)}>+</button>
    </div>
    <span class="sp"></span>
    <button class="btn quiet sm" onclick={openNote} title="The note that goes with this PDF"><Icon name="note" size={15} /> Notes</button>
    <button class="ib" class:on={side === "marks"} aria-label="Marks" title="Marks" onclick={() => (side = side === "marks" ? null : "marks")}><Icon name="panel" size={18} /></button>
    <div class="more">
      <button class="ib" aria-label="More" aria-expanded={moreOpen} title="More" onclick={() => (moreOpen = !moreOpen)}><Icon name="dots" size={18} /></button>
      {#if moreOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="menu" onclick={() => (moreOpen = false)}>
          <button onclick={() => (side = "outline")} disabled={!outline.length}>Outline{outline.length ? "" : " (none)"}</button>
          {#if inTauri}
            <button onclick={() => openOutside()}>Open in another app</button>
            <button onclick={() => openOutside(true)}>Show in folder</button>
          {/if}
          <button onclick={() => (confirmRestore = true)} disabled={!backed}>Restore the original…</button>
        </div>
      {/if}
    </div>
  </header>

  {#if !readOnly && status === "ready"}
    <div class="tools" role="toolbar" aria-label="Tools">
      {#each TOOLS as t}
        <button class="tool" class:on={tool === t.id} aria-pressed={tool === t.id} title="{t.label} ({t.key.toUpperCase()})" aria-label={t.label} onclick={() => (tool = t.id)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            {#if t.id === "select"}<path d="M6 4l12 7-5.5 1.5L10 18z" />
            {:else if t.id === "highlight"}<path d="M4 20h7" /><path d="M14.5 4.5l5 5L11 18H6v-5z" />
            {:else if t.id === "underline"}<path d="M7 4v6a5 5 0 0010 0V4" /><path d="M5 20h14" />
            {:else if t.id === "strike"}<path d="M16 7c-1-1.6-2.4-2-4-2-2.4 0-4 1.3-4 3 0 4 8 2.5 8 7 0 1.8-1.7 3-4 3-1.8 0-3.4-.6-4.4-2" /><path d="M4 12h16" />
            {:else if t.id === "box"}<rect x="4" y="5" width="16" height="14" rx="2" stroke-dasharray="3 2" />
            {:else if t.id === "pen"}<path d="M4 20c4-1 5-6 8-6s2 4 5 4 3-3 3-3" />
            {:else}<path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5" />{/if}
          </svg>
        </button>
      {/each}
      <span class="div"></span>
      {#if tool === "pen"}
        {#each ["#e3949b", "#7fb3a6", "#6f6164", "#7a5bbf", "#e0a050"] as c}
          <button class="sw" class:on={penColor === c} style="--c: {c}" aria-label="Pen colour" onclick={() => (penColor = c)}></button>
        {/each}
      {:else}
        {#each HIGHLIGHTS as h}
          <button class="sw" class:on={color === h.color} style="--c: {h.color}" aria-label={h.name} title={h.name} onclick={() => (color = h.color)}></button>
        {/each}
      {/if}
      <span class="hint muted small">
        {#if tool === "select"}Select text for highlight, card or quote{:else if tool === "box"}Drag a box: occlusion card or a card from a region{:else if tool === "pen"}Draw freely{:else if tool === "note"}Click to pin a note{:else}Select text to mark it{/if}
      </span>
    </div>
  {:else if readOnly && status === "ready"}
    <p class="ro muted small">{readOnlyWhy}</p>
  {/if}

  <div class="body" class:withside={!!side}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="scroller" bind:this={scroller} onscroll={onScroll} onpointerup={onPointerUp} data-tool={tool}>
      {#if status === "loading"}
        <p class="state muted">Opening {name}…</p>
      {:else if status === "error"}
        <div class="state">
          <p><b>Couldn't open this PDF.</b></p>
          <p class="muted">{loadError}</p>
          <button class="btn" onclick={load}>Try again</button>
        </div>
      {/if}
      {#each vps as vp, i (i)}
        <div class="page" data-i={i} style="width: {vp.width * zoom}px; height: {vp.height * zoom}px; --scale-factor: {zoom}" use:observe={i}>
          <div class="cv"></div>
          <svg class="marks" viewBox="0 0 {vp.width} {vp.height}" preserveAspectRatio="none" aria-hidden="true">
            {#each byPage[i] ?? [] as a (a.id)}
              {#if a.kind === "highlight"}
                {#each a.rects as r}{@const v = view(i, r)}<rect class="hl" x={v.x} y={v.y} width={v.w} height={v.h} rx="1.5" fill={a.color} />{/each}
              {:else if a.kind === "underline" || a.kind === "strike"}
                {#each a.rects as r}{@const v = view(i, r)}{@const y = a.kind === "underline" ? v.y + v.h * 0.94 : v.y + v.h * 0.55}<line x1={v.x} x2={v.x + v.w} y1={y} y2={y} style="stroke: {ink(a.color)}" stroke-width={Math.max(1, v.h * 0.08)} />{/each}
              {:else if a.kind === "box"}
                {@const v = view(i, a.rects[0])}<rect x={v.x + 1} y={v.y + 1} width={Math.max(0, v.w - 2)} height={Math.max(0, v.h - 2)} rx="3" style="fill: color-mix(in srgb, {a.color} 14%, transparent); stroke: {ink(a.color)}" stroke-width="2" />
              {:else if a.kind === "pen"}
                {#each a.ink ?? [] as s}<polyline points={viewPts(i, s)} fill="none" style="stroke: {ink(a.color)}" stroke-width={a.width ?? 2} stroke-linecap="round" stroke-linejoin="round" />{/each}
              {:else if a.kind === "note"}
                {@const v = view(i, a.rects[0])}<g class="sticky"><rect x={v.x} y={v.y} width={v.w} height={v.h} rx="4" fill={a.color} /><path d="M{v.x + v.w * 0.22} {v.y + v.h * 0.34}h{v.w * 0.56}M{v.x + v.w * 0.22} {v.y + v.h * 0.52}h{v.w * 0.56}M{v.x + v.w * 0.22} {v.y + v.h * 0.7}h{v.w * 0.32}" stroke="#3b3033" stroke-width="1.2" /></g>
              {/if}
              {#if a.id === active}
                {@const v = view(i, a.kind === "pen" ? bbox(a) : bbox({ rects: a.rects }))}<rect class="sel" x={v.x - 3} y={v.y - 3} width={v.w + 6} height={v.h + 6} rx="5" />
              {/if}
              {#if (a.card || a.comment) && a.kind !== "note"}
                {@const v = view(i, a.rects[0] ?? bbox(a))}<circle cx={v.x + v.w + 3} cy={v.y - 1} r="4.5" fill={a.card ? "#7fb3a6" : "#e3949b"} stroke="#fff" stroke-width="1.5" />
              {/if}
            {/each}
            {#if draft && draft.page === i}
              {#if draft.kind === "box"}
                {@const v = view(i, [Math.min(draft.x0, draft.x), Math.min(draft.y0, draft.y), Math.max(draft.x0, draft.x), Math.max(draft.y0, draft.y)])}<rect x={v.x} y={v.y} width={v.w} height={v.h} rx="3" fill="none" style="stroke: {ink(color)}" stroke-width="2" stroke-dasharray="5 3" />
              {:else}
                <polyline points={viewPts(i, draft.pts)} fill="none" style="stroke: {ink(penColor)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              {/if}
            {/if}
          </svg>
          <div class="textLayer"></div>
          {#if tool === "box" || tool === "pen" || tool === "note"}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="draw" onpointerdown={(e) => drawDown(e, i)} onpointermove={drawMove} onpointerup={drawUp} onpointercancel={drawUp}></div>
          {/if}
          <span class="pno">{i + 1}</span>

          {#if selMenu && selMenu.page === i}
            <div class="selmenu" bind:offsetWidth={menuW} style="left: {Math.max(8, Math.min(vp.width * zoom - menuW - 8, selMenu.x - menuW / 2))}px; top: {selMenu.y}px" role="menu">
              {#if !readOnly}
                {#each HIGHLIGHTS as h}<button class="sw" style="--c: {h.color}" aria-label="Highlight {h.name}" title="Highlight" onclick={() => markSelection("highlight", h.color)}></button>{/each}
                <button class="mi" title="Underline" onclick={() => markSelection("underline")}>U</button>
                <span class="div"></span>
                <button class="mi wide" onclick={cardFromSelection}><Icon name="star" size={14} /> Card</button>
                <button class="mi wide" onclick={quoteSelection}><Icon name="note" size={14} /> To note</button>
              {:else}
                <span class="muted small">Read only: use Ctrl+C to copy</span>
              {/if}
            </div>
          {/if}

          {#if activeA && activeA.page === i}
            {@const pp = popPos(activeA)}
            <div class="pop" style="left: {pp.left}px; top: {pp.top}px" role="dialog" aria-label="{KIND_LABEL[activeA.kind]} on page {i + 1}">
              <div class="prow">
                <b class="small">{KIND_LABEL[activeA.kind]}</b>
                <span class="sp"></span>
                {#if !readOnly}
                  {#each activeA.kind === "pen" ? ["#e3949b", "#7fb3a6", "#6f6164", "#7a5bbf", "#e0a050"].map((c) => ({ name: c, color: c })) : HIGHLIGHTS as h}
                    <button class="sw xs" class:on={activeA.color === h.color} style="--c: {h.color}" aria-label="Colour {h.name}" onclick={() => patch(activeA.id, { color: h.color })}></button>
                  {/each}
                {/if}
                <button class="x" aria-label="Close" onclick={() => (active = null)}>×</button>
              </div>
              {#if activeA.text}<p class="quote">“{activeA.text.length > 220 ? activeA.text.slice(0, 220) + "…" : activeA.text}”</p>{/if}
              <textarea class="input" rows={activeA.kind === "note" ? 3 : 2} placeholder={activeA.kind === "note" ? "Write a note…" : "Add a comment"} value={activeA.comment ?? ""} readonly={readOnly} oninput={(e) => patch(activeA.id, { comment: e.currentTarget.value })} onkeydown={(e) => e.key === "Escape" && (e.preventDefault(), e.currentTarget.blur(), (active = null))}></textarea>
              <div class="prow wrap">
                {#if activeA.card && getItem(activeA.card)}
                  <a class="btn quiet sm" href="#/study/cards/library/{activeA.card}"><Icon name="star" size={14} /> Open card</a>
                {:else if activeA.text && !readOnly}
                  <button class="btn quiet sm" onclick={() => openCard(activeA)}><Icon name="star" size={14} /> Make card</button>
                {/if}
                {#if activeA.kind === "box" && !readOnly}
                  <button class="btn quiet sm" onclick={() => occlusionFrom(activeA)}><Icon name="star" size={14} /> Occlusion card</button>
                {/if}
                {#if activeA.note}
                  <a class="btn quiet sm" href={noteHref(activeA.note)}><Icon name="note" size={14} /> In note</a>
                {:else if activeA.text && !readOnly}
                  <button class="btn quiet sm" onclick={() => quote(activeA)}><Icon name="note" size={14} /> To note</button>
                {/if}
                <span class="sp"></span>
                {#if !readOnly}<button class="btn quiet sm danger" onclick={() => remove(activeA.id)}>Delete</button>{/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if side}
      <aside class="side" aria-label={side === "marks" ? "Marks" : "Outline"}>
        <div class="stabs">
          <button class:on={side === "marks"} onclick={() => (side = "marks")}>Marks <span class="n">{annots.length}</span></button>
          <button class:on={side === "outline"} onclick={() => (side = "outline")}>Outline</button>
          <span class="sp"></span>
          <button class="x" aria-label="Hide panel" onclick={() => (side = null)}>×</button>
        </div>
        {#if side === "marks"}
          {#if annots.length}
            {#if !readOnly}<button class="btn quiet sm all" onclick={quoteAll}><Icon name="note" size={14} /> Highlights to note</button>{/if}
            <ul class="mlist">
              {#each sorted as a, k (a.id)}
                {#if k === 0 || sorted[k - 1].page !== a.page}<li class="pg">Page {a.page + 1}</li>{/if}
                <li>
                  <button class="mark" class:on={a.id === active} onclick={() => { goTo(a.page + 1); active = a.id; }}>
                    <span class="dot" style="background: {a.color}"></span>
                    <span class="mt">
                      <span class="mk">{KIND_LABEL[a.kind]}{#if a.card} · card{/if}{#if a.note} · in note{/if}</span>
                      {#if a.text}<span class="mx">{a.text.length > 120 ? a.text.slice(0, 120) + "…" : a.text}</span>{/if}
                      {#if a.comment}<span class="mc">{a.comment}</span>{/if}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted small empty">No marks yet. Pick Highlight (H) and select text, or select text and choose Card to make a flashcard.</p>
          {/if}
        {:else}
          {#if outline.length}
            <ul class="olist">
              {#each outline as o}
                <li><button style="padding-left: {10 + o.level * 14}px" class:on={o.page === current} disabled={!o.page} onclick={() => goTo(o.page)}><span>{o.title}</span>{#if o.page}<small>{o.page}</small>{/if}</button></li>
              {/each}
            </ul>
          {:else}
            <p class="muted small empty">This PDF has no outline.</p>
          {/if}
        {/if}
      </aside>
    {/if}
  </div>

  {#if toast}
    <div class="toast" role="status">{toast.text}{#if toast.href} <a href={toast.href}>{toast.link}</a>{/if}</div>
  {/if}
  {#if confirmRestore}
    <div class="toast confirm" role="alertdialog" aria-label="Restore the original">
      Put back the original PDF? Every mark made in Study Desk on it is removed.
      <button class="btn quiet sm" onclick={() => (confirmRestore = false)}>Cancel</button>
      <button class="btn sm danger" onclick={restore}>Restore</button>
    </div>
  {/if}
</div></div>

{#if cardFor}
  <CardFromText bind:open={cardOpen} text={cardFor.text} pdf={rel} page={cardFor.page} {course} onsaved={(id) => { if (cardFor) patch(cardFor.annot, { card: id }); toast = { text: "Card made", href: `#/study/cards/library/${id}`, link: "Open" }; }} />
{/if}
<OcclusionEditor bind:open={occOpen} initial={occInit} onsaved={(id) => { patch(occAnnot, { card: id }); toast = { text: "Occlusion card made", href: `#/study/cards/library/${id}`, link: "Open" }; }} />

<style>
  .pwrap {
    container-type: inline-size;
    min-width: 0;
  }
  .viewer {
    position: relative;
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 10px;
    height: calc(100vh - 150px);
    min-height: 420px;
    min-width: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .ttl {
    display: grid;
    min-width: 0;
    max-width: 40ch;
  }
  .ttl b {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .warn {
    color: var(--rose-deep);
    font-weight: 600;
  }
  .small {
    font-size: 13px;
  }
  .sp {
    flex: 1;
  }
  .ib {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text);
    font-size: 18px;
    text-decoration: none;
    cursor: pointer;
  }
  .ib.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .grp {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    border-radius: var(--radius-pill);
    background: var(--chip);
  }
  .grp .ib {
    width: 34px;
    height: 34px;
    background: var(--surface);
  }
  .zl {
    min-width: 54px;
    height: 34px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .pages {
    padding: 3px 12px 3px 3px;
    font-size: 14px;
  }
  .pnum {
    width: 48px;
    height: 34px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--text);
    text-align: center;
    font: inherit;
    font-weight: 600;
  }
  .btn.sm {
    min-height: 36px;
    padding: 0 14px;
    font-size: 14px;
    gap: 6px;
  }
  .btn.danger {
    color: var(--rose-deep);
  }
  .more {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: 46px;
    z-index: 20;
    padding: 6px;
    border-radius: 18px;
    background: var(--surface);
    box-shadow: var(--shadow-lift);
    min-width: 220px;
  }
  .menu button {
    display: block;
    width: 100%;
    min-height: 40px;
    padding: 0 14px;
    border: 0;
    border-radius: 12px;
    background: none;
    color: var(--text);
    text-align: left;
    font: inherit;
    cursor: pointer;
  }
  .menu button:hover:not(:disabled) {
    background: var(--chip);
  }
  .menu button:disabled {
    color: var(--text-muted);
    cursor: default;
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    padding: 5px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    box-shadow: var(--shadow);
    justify-self: start;
    max-width: 100%;
  }
  .tool {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tool:hover {
    background: var(--chip);
    color: var(--text);
  }
  .tool.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .div {
    width: 1px;
    height: 24px;
    background: var(--hairline);
    margin: 0 6px;
  }
  .sw {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: var(--c);
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(59, 48, 51, 0.08);
    flex: none;
  }
  .sw.on {
    box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text);
  }
  .sw.xs {
    width: 20px;
    height: 20px;
  }
  .hint {
    padding: 0 12px 0 6px;
  }
  .ro {
    margin: 0;
    padding: 8px 14px;
    border-radius: var(--radius-pill);
    background: var(--butter-soft);
    justify-self: start;
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }
  .body.withside {
    grid-template-columns: minmax(0, 1fr) 300px;
  }
  .scroller {
    position: relative;
    overflow: auto;
    min-height: 0;
    padding: 12px 20px 40px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--panel) 60%, var(--chip));
  }
  .state {
    padding: 40px;
    text-align: center;
  }
  .page {
    position: relative;
    margin: 0 auto 22px;
    background: #fff;
    border-radius: 6px;
    box-shadow: 0 2px 14px rgba(59, 48, 51, 0.1);
  }
  .cv,
  .cv :global(canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 6px;
  }
  .marks {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
    /* blend with the page under it, so text stays readable through highlights */
    mix-blend-mode: multiply;
  }
  .marks .sel {
    fill: none;
    stroke: #3b3033;
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }
  .page :global(.textLayer) {
    position: absolute;
    text-align: initial;
    inset: 0;
    overflow: clip;
    opacity: 1;
    line-height: 1;
    text-size-adjust: none;
    -webkit-text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    z-index: 2;
  }
  .page :global(.textLayer :is(span, br)) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
  }
  .page :global(.textLayer span.markedContent) {
    top: 0;
    height: 0;
  }
  .page :global(.textLayer ::selection) {
    background: rgba(127, 179, 166, 0.35);
  }
  .page :global(.textLayer br::selection) {
    background: transparent;
  }
  .page :global(.textLayer .endOfContent) {
    display: block;
    position: absolute;
    inset: 100% 0 0;
    z-index: 0;
    cursor: default;
    user-select: none;
  }
  .page :global(.textLayer.selecting .endOfContent) {
    top: 0;
  }
  [data-tool="highlight"] .page :global(.textLayer span),
  [data-tool="underline"] .page :global(.textLayer span),
  [data-tool="strike"] .page :global(.textLayer span) {
    cursor: crosshair;
  }
  .draw {
    position: absolute;
    inset: 0;
    z-index: 3;
    cursor: crosshair;
    touch-action: none;
  }
  .pno {
    position: absolute;
    right: -2px;
    bottom: -20px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .selmenu {
    position: absolute;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    box-shadow: var(--shadow-lift);
    white-space: nowrap;
  }
  .mi {
    min-width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--chip);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .mi.wide {
    padding: 0 12px;
    font-size: 13px;
  }
  .pop {
    position: absolute;
    z-index: 6;
    width: 300px;
    display: grid;
    gap: 8px;
    padding: 12px;
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow-lift);
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .prow.wrap {
    flex-wrap: wrap;
  }
  .pop .x,
  .stabs .x {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text);
    font-size: 16px;
    cursor: pointer;
    flex: none;
  }
  .quote {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
    max-height: 6.5em;
    overflow: auto;
  }
  .pop textarea {
    resize: vertical;
    min-height: 44px;
    font-size: 14px;
  }

  .side {
    display: grid;
    grid-template-rows: auto auto 1fr;
    align-content: start;
    gap: 8px;
    min-height: 0;
    padding: 12px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .stabs {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .stabs > button:not(.x) {
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
  .stabs > button.on {
    background: var(--chip);
    color: var(--text);
  }
  .n {
    font-size: 12px;
    color: var(--text-muted);
  }
  .all {
    justify-self: start;
  }
  .mlist,
  .olist {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    min-height: 0;
  }
  .pg {
    padding: 10px 6px 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .mark {
    display: flex;
    gap: 10px;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 14px;
    background: none;
    color: var(--text);
    text-align: left;
    font: inherit;
    cursor: pointer;
  }
  .mark:hover,
  .mark.on {
    background: var(--chip);
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    margin-top: 4px;
    flex: none;
  }
  .mt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .mk {
    font-size: 12px;
    color: var(--text-muted);
  }
  .mx {
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .mc {
    font-size: 13px;
    color: var(--rose-deep);
  }
  .olist button {
    display: flex;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    padding: 6px 10px;
    border: 0;
    border-radius: 12px;
    background: none;
    color: var(--text);
    text-align: left;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .olist button span {
    flex: 1;
  }
  .olist button.on,
  .olist button:hover:not(:disabled) {
    background: var(--chip);
  }
  .olist small {
    color: var(--text-muted);
  }
  .empty {
    padding: 8px;
  }
  .toast {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-radius: var(--radius-pill);
    background: var(--charcoal);
    color: #fff;
    box-shadow: var(--shadow-lift);
    max-width: calc(100% - 32px);
  }
  .toast a {
    color: var(--butter);
    font-weight: 600;
  }
  .toast.confirm {
    background: var(--surface);
    color: var(--text);
  }

  @container (max-width: 860px) {
    .body.withside {
      grid-template-columns: minmax(0, 1fr);
    }
    .side {
      position: absolute;
      right: 0;
      top: 110px;
      bottom: 0;
      width: min(320px, 90%);
      z-index: 8;
      box-shadow: var(--shadow-lift);
    }
    .hint {
      display: none;
    }
  }
</style>
