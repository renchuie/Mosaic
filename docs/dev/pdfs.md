# PDF viewer and annotations

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

## Study S5 (built): PDF viewer and annotations

- PDF folder (Settings, default `~/GoogleDrive/Pharmacy School`, 6 levels): Rust `src-tauri/src/pdfs.rs`
  lists PDFs (hidden folders skipped), serves them at `/__pdfs/…` like labs and notes (and
  `vite.config.ts` serves `/__pdfs/` and `/__pdfs-list` in dev/preview; `STUDYDESK_PDFS` overrides the
  folder there), writes with the bytes as a raw IPC body (path in header `x-rel`, conflict check on
  `x-expected` mtime), and copies the untouched original once to `<pdf folder>/.studydesk-originals/
  <same path>` before the first write. "Restore the original" puts it back. `pdfs_open` = xdg-open.
- Annotations live IN the PDF as standard annotations with appearance streams (Highlight, Underline,
  StrikeOut, Square, Ink, Text), so Okular/Firefox/Acrobat show them too (checked with poppler).
  Ours have `/NM sd-…` and our JSON in `/SDData`; everything else in the file (a lecturer's notes,
  links, forms) is kept. `src/lib/pdfAnnots.ts` (pure, pdf-lib, node-tested): `readAnnots` returns
  our marks plus a copy WITHOUT them for pdf.js to draw (we draw ours as SVG on top, blended with
  multiply), `writeAnnots` replaces ours on save. Coordinates are PDF user space via pdf.js
  `convertToPdfPoint` / `convertToViewportRectangle`. Encrypted or unparseable PDFs open read-only.
- Store `src/lib/stores/pdfs.svelte.ts`: list cached in `pdfs-cache.json`; synced collection
  `pdfState` per PDF {page, opened, annots, pages} (resume on the other machine). A PDF belongs to a
  course when a folder on its path is the course name or code ("Ther IV", "Law").
- Viewer `src/routes/study/pdfs/PdfViewer.svelte` (`#/study/pdfs/<rel>?p=<page>`): lazy page
  rendering (IntersectionObserver, canvases far away released), pdf.js text layer, fit width / zoom,
  page box, outline, Marks panel. Tools: select (menu: highlight colours, underline, Card, To note),
  highlight H, underline U, strike S, box B, pen P, sticky note N; Esc, Delete, PgUp/PgDn, Ctrl ±/0.
  Autosave 0.9 s after a change. If the file changed on disk (other computer), marks are merged by
  id (newer wins, deletions on either side respected) and saved again; checked on window focus too.
- Links: Card from a highlight (`CardFromText.svelte`: cloze by clicking/dragging words, or a
  question) and occlusion card from a box (region rendered at up to 6x into OcclusionEditor);
  library items get `source: {pdf, page}` and review shows a link back to the page. "To note" /
  "Highlights to note" append quotes to the PDF's own note (front matter `pdf: <rel>`, created in the
  course's notes folder) with a link `[[folder/file.pdf#p3|file, p. 3]]`; clicking such a link in a
  note opens the PDF at that page (`Parsed.pdfs` holds a note's PDF links, kept out of note links).
- Also: Study tab "PDFs" (`PdfsHome.svelte`: keep reading, course chips, search, folder groups),
  Study Home "Keep reading", course page "PDFs".
