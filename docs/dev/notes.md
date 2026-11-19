# Notes: the block editor, the Markdown view, the notes store

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

## Mosaic note page (N1b, built): block editor, files stay Markdown

Replaces N1's live preview as the normal view (N1's CodeMirror editor is now the "Edit as
Markdown" view, the `<>` chip on the note header).
- Converter `src/lib/editor/mdDoc.ts` (pure, node-tested round trip): Markdown ⇄ ProseMirror JSON.
  The document is FLAT like Notion: paragraph / bullet / ordered / todo blocks carry an `indent`
  level instead of nested lists (indent columns follow the parent marker, so `1.` children use 3
  spaces). Blank lines: between two flow blocks each blank line is an empty paragraph; next to any
  other block one blank line is layout, and a block with no blank line before it gets
  `tight: true`. Card ids `<!--sd:…-->` are the hidden `sid` attr (duplicates dropped on save),
  `:: table` is the table's `cards` attr, unknown HTML / `$$` blocks are `raw` blocks written back
  as read. An opened but unedited note is never rewritten (only real edits save). `docToMd` also
  returns `owners` (line → block path) so `assignIds` results become `sid` attrs (`setIds`).
- Editor `src/lib/components/BlockEditor.svelte` + extensions `src/lib/editor/blocks.ts` (Tiptap v3,
  npm `@tiptap/core`, `@tiptap/pm`, `@tiptap/extension-table`, `@tiptap/extensions`), styles in
  `src/lib/editor/editor.css` (`.b-*` classes). Inline: bold, italic, strike, code, highlight
  colours, web links (Ctrl+click), cloze mark, `wikilink` and `arrow` atoms (click an arrow to
  switch → / ⇄). Typing: `#`/`##`/`###` + space, `-`, `1.`, `[]`, `>`, `---`, ```` ``` ````,
  `**b**`, `*i*`, `~~s~~`, `==h==`, `` `c` ``, `{{cloze}}`, `[[Name]]`, ` :: ` / ` ::: ` (arrow).
  Enter keeps the block type (empty list line steps out), Enter at a line start adds a line
  above (the card id stays with the text), Tab / Shift-Tab indent, Backspace at the start turns a
  block back into text. Menus: `/` blocks, `[[` notes (or "New note"), `#` tags; selection
  toolbar (marks, colours, → card, ⇄ two-way card, { } cloze, the same icons as the main toolbar;
  [[ ]], web link); block handle (+ and ⠿: drag to move,
  click for turn into / move / duplicate / delete); table bar (rows, columns, Flashcards toggle).
  Paste: images saved to attachments, rich HTML via `htmlToMd`, Markdown-looking text parsed;
  copying gives Markdown text. Svelte rejects `$`-prefixed locals: name ProseMirror `$from` `rf`. Tiptap's input rules may insert the typed
  character BEFORE a rule's handler runs (`createRuleTransaction`), so a handler must not assume the
  last typed character is missing (the `---` divider rule broke on that, fixed Nov 18; a Playwright
  check of every typing shortcut passes).
- Page `src/routes/study/NotesView.svelte` with `NoteHead.svelte` (cover: front matter `cover:`
  preset name from `COVERS` or an image path; `icon:` emoji; title shown once: a leading
  `# Title` matching the file name is taken off the editor and written back on save; course /
  date / tag chips; toolbar; ⋯ move, remove icon / cover, delete) and `NoteSide.svelte` (panels:
  Outline, Cards in this note with status and "Review this note", Backlinks, Links + Linked to).
  Linked references and unlinked mentions under the note: since Nov 17 one quiet line
  "▸ Linked references N" at the bottom of the page (the note fills the free space), opened on
  click and remembered (`refs` in "mosaic.notePanels"). `plainText()` in `notes.ts` cleans
  previews.
- Roomier layout (Nov 17, her pick of all four ideas on canvas board "Roomier note page"): an open
  note fills the main panel as ONE sheet (App makes `main` flush for `#/study/notes` and
  `#/study/notes/<rel>`; Study hides its own tab bar there). Notes home uses the same top bar and
  shows the notes list as the same clean column as a pinned list inside a note (`.pinned.solid`),
  with the folders on the glass beside it. Fewer "Notes" labels (her Nov 17 ask): the list has no
  heading (📌 / × sit beside its search box, `NoteTree` `actions` snippet) and the home title is
  "Folders". Note previews in lists use `previewLine()` (notes.ts),
  which skips comment lines (card ids, column markers). The `attachments` folder (pasted
  images, card pictures) is hidden everywhere folders are listed: use `noteDirs()` from the notes
  store, not `notes.dirs`. Study tabs everywhere (her pick, "flip it"): the slim look, text
  only, in a 56px strip across the top of the main panel on the glass with a hairline under it
  (`StudyNav` `.sbar`, pulled to the panel edges with `--main-pad-t` / `--main-pad-x`). The note's
  top bar is that same strip (white sheet only below it): `<StudyNav bar={false} />` first, then
  notes list / search / + note,
  the note's title once the header scrolls away, save status, page
  width (Readable 860 / Wide 1120 / Full; front matter `width: wide|full`, Readable writes
  nothing; CSS var `--note-box` sizes `.mosaic-doc`, the header and the references), ✎ (keep the
  formatting toolbar showing), the right panel icons and writing mode. The header is one line:
  icon, title, chips, `<>` and ⋯ (add / change cover lives in ⋯; a faint icon button appears on
  hover); covers are a 76px band. ⋯ → Header: Compact (default) / **Full** (her other favourite:
  breadcrumb, 60px icon, big title, then chips + the toolbar in the header, which then floats only
  once the title has scrolled away); `fullHead` in "mosaic.notePanels". The formatting toolbar only floats at the bottom (while typing,
  or always when ✎ is on). A panel icon slides its panel over the note as a sheet (click away /
  Esc); 📌 pins it beside the note as a column (pins need room: left > 1000px, right > 960px or
  1240px with both). **Writing mode** (button, Ctrl+Shift+F, or Ctrl+\ also matched by `e.code`, in a capture-phase
  listener; Nov 18: on her PC Ctrl+\ opened the system emoji picker instead; `ui.writing` in
  `src/lib/stores/ui.svelte.ts`, not remembered): the rail slides off to a glowing left edge and
  the top bar hides; touching the left edge brings the rail back, the window's top edge brings
  the top bar back (App's `.redge` / `.tedge`, NotesView reads `.shell:has(.tedge:hover)`); pills
  show where she is; Esc the editor didn't use, Ctrl+\ or the pill leaves; leaving the note page
  ends it. `localStorage` "mosaic.notePanels" {pinL, pinR, tools, fullHead, refs} per machine.
- Browser preview exposes `window.__notes` (sample notes only) so UI tests can read saved text.
- After her first test round (Nov 16): cloze "retyping" (typing over or erasing a whole cloze keeps
  typing inside it until the cursor moves, → or Esc; plugin in the Cloze mark); images are flow
  lines with `indent` and `width` (`![alt|300](src)`, Obsidian syntax; corner grip resizes,
  double-click = full width; pasted on a bullet / numbered / to-do line it goes one level in, under
  the item's text, and the next line carries on the list); card lines get inner padding (`--cp`) and a 3px gap (since Nov 17
  the tint starts at the text edge like callouts and tables, no longer reaching into the margin); arrows are SVG;
  Settings → Appearance "Flashcards in notes": card background on/off (`settings.cardBg`,
  `<html data-cardbg>`), arrow colour (`ARROW_COLOURS`, `--arrow-bg`/`--arrow2-bg`) and cloze
  colour (`CLOZE_COLOURS`, `--cloze-bg`/`--cloze-line`); `/` "List flashcard"; block menu
  "One card each / All in one card" for lines with several clozes (sets `c1` on all); highlight
  shortcuts Ctrl+Shift+1…6 (yellow, rose, sage, peach, lavender, blue), Ctrl+Shift+0 removes;
  table bar adds rows above/below and columns left/right; selection toolbar waits for mouse-up;
  course chip is a Mosaic menu (no native select); `NoteToolbar.svelte` is the floating bar at the
  bottom (since Nov 17 the only place it shows; see "Roomier layout").
- List-card arrows (an arrow ending a line whose next line is indented deeper) get class `list`
  from the decoration plugin and show a right-then-down arrow icon (the arrow node renders both SVGs; CSS picks). The arrow pill centres itself on the line from `--lh` (the
  line height as a number, set with each line-height in editor.css), not a font baseline nudge.
  Cloze pairing bar (`.cbar`, cursor in a cloze on a line with 2+ clozes): Own card / existing
  group numbers / + new group, sets the cloze `n` (`{{cN::…}}`); numbered clozes show a badge.
  Card line tints follow the arrow colour (`ARROW_COLOURS` entries 3–4 → `--card-bg`, `--card-bg2`
  for two-way lines).
- Block style manager (`BlockStyleManager.svelte`, store `src/lib/stores/blockStyles.svelte.ts`):
  synced collections `calloutTypes` (record per kind = the word in `> [!kind]`: label, icon,
  colour, order, hidden; built-ins seeded u=1, can be renamed / recoloured / hidden, her own can
  be deleted) and `blockStyles` record `quote` {bar, tint, italic}. `blockStylesCss()` generates the
  per-kind CSS (`--cc`, badge `::before` icon / `::after` label) and the quote style; BlockEditor
  puts it in a `<style>` in `<svelte:head>`. Unknown kinds show their own word (badge
  `data-label`) in the default lavender. Clicking a callout badge opens the type menu ("Edit
  styles…"); the `/` menu lists visible types, plus "Quote with source". A quote's last line
  starting with a dash gets class `b-src` (decoration); ⠿ on a quote → "Add a source line".
  Opened from Settings → Appearance too. The dialog has tabs (`styleManager.tab`: callouts / quotes
  / highlights) and, being mounted in App, injects the generated `<style>` for the whole app.
- Highlight colours and palettes (same store and dialog, "Highlights" tab): synced `hlColors`
  (word → label, hex colour, order; built-ins yellow rose sage peach lavender blue mint coral lilac
  sky lemon grey, editable; her own deletable, which removes them from palettes) and `hlPalettes`
  (name + ordered colour words, max 9; built-ins Mosaic, Traffic light, Cool); `blockStyles`
  record `hlActive`. The active palette fills the toolbar / selection-bar dots and Ctrl+Shift+1…9
  (`setPaletteSource` in blocks.ts); Ctrl+Shift+0 and the struck dot remove a highlight. In files:
  yellow = `==…==`, others `<mark class="word">`. Only hex colours reach the CSS.
  Theme highlighters (Nov 18, her ask): every theme has its own six (`THEME_HL` in the store;
  words `<theme>-<name>`, Mosaic's are the built-in words; Dark themes use their official
  accents). Palette id `"theme"` (the default for `hlActive`) = the current theme's six; the
  style manager lists only the current theme's set, first, named just "Theme". They're code,
  not synced records, and ALL themes' words stay in the generated CSS, so a highlight keeps its
  colour after a theme switch. `hlColor()` falls back to them.
- Tables (Nov 16): cells hold `(paragraph | bullet | ordered | todo)+`, written in the cell joined by
  `<br>` (`- item`, `1. item`, `- [ ] item`; `cellBlocks` / `cellMd` in mdDoc.ts), so table cards
  get list answers. Columns resize by dragging (Tiptap `resizable`, cell `colwidth`); cells take a
  colour (`bg` attr = a highlight colour word, rendered with `data-color` → `--hl`). Widths and
  colours are saved in one hidden line right above the table:
  `<!--mosaic-table {"w":[160,null],"bg":{"row,col":"rose"}}-->` (`TABLE_META`; cards.ts skips it
  when reading `:: table`). Since Nov 18 tables work like Google Docs: `table-layout: fixed`, so
  columns without a width share the page width equally (new tables are equal); dragging sets one
  column; table bar "⇔ Even out" clears the widths of the selected columns (CellSelection; all
  columns with just the cursor), so they share what's left. A plugin view in `ColumnRules` clears
  stale `<col>` widths, because Tiptap's table view never removes one when a width is cleared.
  🎨 Colour sets / clears EVERY selected cell (`setCellsBg`; Tiptap's setCellAttribute bailed when
  the anchor cell already matched). Selected cells get a soft tint (`.selectedCell::after`, no animation: it
  would replay on every cell at every change) and ONE rounded outline around the whole selection
  (`.cellbox` in BlockEditor, `placeCellBox()`, positioned with transform). It fades in once,
  snaps to the selection while she drags (no transition: smooth and free), and glides 0.12s only
  when the selection jumps without the mouse (Ctrl+A growing). After her Nov 18 recording showed
  the always-on glide stuttering. Table bar: rows / columns, 🎨 Colour, ⇔ Even out, Flashcards. Enter inside a cell adds a line (Tab moves to the next cell).
  The bar floats just above the cell she's in, centred on it (Nov 18, her ask; `$anchorCell` for cell
  selections; pops in like the selection toolbar and glides from cell to cell),
  just below it when there's no room above the visible top of the note's `.scroll`, and never past
  the right edge and steps aside after a
  click off the table (`tbarOff`, back on the next selection change); a click outside the 🎨 / ▾
  Flashcards popups or Esc closes them. The popup sets `white-space: normal` (the bar's nowrap would push its text
  out sideways); it never scrolls, and opens upward (`fpopUp`) when there isn't room below.
- Columns (Nov 17, Notion-style column blocks): nodes `columns` (attr `w` = widths in percent,
  null = equal; only at the top level: doc content is `(block | columns)+`) and `column`
  (`block+`, isolating). In the file: `<!--mosaic-cols {"w":[60,40]}-->`, `<!--mosaic-col-->`
  between columns, `<!--/mosaic-cols-->` (blank lines around each; `COLS_OPEN` / `COL_SEP` /
  `COLS_CLOSE` in mdDoc.ts; an opener with no closer stays a raw block), so other apps show the
  text stacked and cards inside columns work as usual (owner paths go through the column). Make
  them with `/2 columns`, `/3 columns`, or by dragging a block (⠿) to the right / left edge of
  another block (a lavender bar shows; the dragged and the target block take their indented lines
  along; dropping beside a block already in columns adds a column, max 4). Drag the gap between
  columns to resize, double-click it for equal widths. Enter on an empty last line of a column steps out
  to a full-width line below the row; a click below a row of columns that ends the note (or a half)
  starts one there. Backspace in an empty column removes it;
  a row left with one column turns back into plain blocks (`ColumnRules` plugin); ⠿ menu
  "Remove columns (keep everything)"; ⠿ menu "Divider line between columns" toggles a thin line
  down each gap (attr `line`, `"line":true` in the mosaic-cols line; newspaper look, per row). The gap is always 2 × `--doc-pad` (with or without the
  line), so each column has the page margin on both sides; the resize grip shows as a short pill at
  the top of the gap on hover (full-height only while over the grip), so it isn't mistaken for the
  divider. In columns after the first, the + / ⠿ handle stacks (`.handle.stack`) to fit the gap. Rows fit their content (the Nov 17 14em minimum was dropped Nov 18; the newspaper layout is
  side by side) and a click in the empty space under a shorter column's text puts the cursor at
  the end of THAT column (`mousedown` on `.b-col`
  in BlockEditor's `handleDOMEvents`). The block handle works for blocks inside columns
  (`blockAt`); numbering, list cards and #tags are worked out per column. Narrow windows
  (< 640px) stack the columns. Node test: scratchpad `tstest/test15.ts`.
- Side by side (Nov 18, her "two notes in one" ask): a note-level layout, Full width only (button
  with the two-panel icon in the top bar, shown only in Full). Nodes `pages` (content `pagecol
  pagecol`, top level only) and `pagecol` (`(block | columns)+`, so column blocks work inside a
  half). File: `<!--mosaic-pages-->` left `<!--mosaic-page-->` right `<!--/mosaic-pages-->`
  (`PAGES_OPEN` / `PAGE_SEP` / `PAGES_CLOSE` in mdDoc.ts; node test scratchpad `tstest/test16.ts`).
  Since Nov 18 (her pick 6) the top-bar button, once there are halves, opens a menu (`.splitmenu`,
  moved to `<body>` because the top bar clips) with three views: Side by side (no front matter),
  "Side by side, each half scrolls" (`split: scroll`: each `.b-pagecol` is at most the visible
  height and scrolls on its own with `overscroll-behavior: contain`) and One above the other
  (`split: stacked`). Print undoes the scrolling. The split is NOT sticky (Nov 19: a closed "Check
  yourself" toggle after the split slid up over the pinned halves). Instead BlockEditor's wheel
  listener moves the page between three resting places, each in ONE smooth glide (her Nov 19
  recording: stepping the page, then the half, then the page popping back felt awkward): above the
  split; the halves filling the view (8px below the top); past the split. Scrolling down over a half
  before the split has arrived glides onto the halves; a FRESH gesture down from a half's bottom
  glides past the split, a fresh gesture up from a half's top glides back up a screen (a gesture =
  wheel events with no 200 ms pause, so touchpad inertia never carries on into the page); past the
  split, wheel up over a half glides back onto the halves. Playwright's page.screenshot re-renders
  the halves (scroll resets) — a test artifact, not the app.
  The top-bar button makes the halves the first time (`togglePages()`: everything so far in the
  left half, right half empty); after that it only switches the view between side by side and one
  half above the other (front matter `split: stacked`, `data-split` on `.npage`) and never moves
  text. Joining is a deliberate ⠿ menu item on a block in a half, "Join halves into one page"
  (left, then right). NotesView puts `data-width` on `.npage`; editor.css shows two halves with a
  line down the middle only under `[data-width="full"]:not([data-split="stacked"])`, stacked
  (with a line between) otherwise. The halves themselves get no block handle. Ctrl+A grows outward one step per press (keymap
  `Mod-a` in `ColumnRules`, `selectSteps()`): in a table cell → the cell's text → its column → its
  row → the whole table; then the column block, then the side-by-side half, then the whole note.
  Steps are worked out at the first press and rebuilt on the current doc each time (autosave can
  tidy the doc in between). Ctrl+Shift+A always selects the whole note. "Whole note" is `wholeNote()`:
  an AllSelection, except in a note that opens with a toggle, where it is a text selection from the
  first letter to the last (WebKit dropped an AllSelection starting on the toggle's ▾; Nov 18). Blocks in the right half get the handle 52px left of them; a click in a half's
  empty space writes at its end.
- Pasting into a spot that can't hold every block (Nov 18, `fitPaste` / `pasteSpot` in BlockEditor):
  in a table cell headings become text, quotes / callouts give their lines, a table gives one
  "a · b" line per row, code gives a line per line, dividers / images are dropped (a pasted image
  FILE goes in as an inline image: in a cell it starts at most the cell's width and 200px tall, and its corner grip resizes it, saved as `![|width](src)` like block images, double-click the grip to fit); in a column, pasted columns / side by side open up into their
  blocks. Plain text with `<!--mosaic-` lines counts as Markdown.
- Gaps in guided notes (Nov 18, her picks after her first full guided note; `src/lib/editor/gaps.ts`,
  extension `Gaps` in blocks.ts at priority 1000): `findGaps` lists every slot to fill in: cloze
  runs (empty = `BLANK_GAP`), the answer side of an arrow, list-card items (`indent + 1`, hint
  "i of n"; items with their own arrow skipped), and body cells of a `:: table` except the key and
  skipped columns (hint = column header). Tab / Shift-Tab inside or right after a gap, or Alt+↓ / ↑
  anywhere, jumps to the next / previous empty one (wraps; a cloze gets selected). Enter at the end
  of a filled list item moves into the next empty sibling instead of adding a line. A heading
  (h1–h3) with something filled under it gets a "Review" button on hover (`onReviewSection` →
  route `#/study/cards/review/note:<rel>#<a › b>`; srs `Scope` note `section`, `underSection`
  matches the card's heading context by prefix; new cards are not capped there). Removed Nov 19
  at her ask ("too specific / too much"): the "N left" pills on headings, the top-bar counter, and
  the "2 of 7" / column-name hints in empty items and cells. Don't bring them back unprompted.
- Checklists in callouts (Nov 18, her "Listen for / confirm" lists): `- [ ]` lines inside a
  callout already parse and tick; the callout header shows "N to check" / "✓ all checked"
  (`.b-cticks`, counted in the callout node view's `paint`). Her prompt and the guide now write
  Listen for / confirm items as checkboxes.
- Claude notes guide (Nov 18, her ask): `docs/claude-notes-guide.md` is the copy-ready section she
  pastes into her Claude prompt for guided notes: front matter, headings, toggles, callout kinds,
  highlight colours, tables, columns and every card syntax, with rules (no cards in callouts /
  cells / code, no `<!--sd-->` ids). Keep it in step when note syntax changes; its examples were
  checked with the parser (scratchpad `tstest/test23.ts`). That check found two fixes: a line
  starting with `<mark class=…>` got a `\` on save (LINE_START in mdDoc.ts now skips `<mark`), and
  card context after a closed toggle kept the toggle's heading (extractCards restores the headings
  at `<!--/mosaic-toggle-->`). Its "Guided notes" part (her ask: fill-in material for lecture) uses
  blanks `{{_____}}` (a cloze gap of only underscores / dots / dashes / ? is NOT a card until
  filled: `BLANK_GAP` in cards.ts, and the group index still counts it so the key stays put), empty
  `Q ::`, empty list bullets, empty `;;;` descriptors under a **bold** drug line and empty table
  cells (none are cards until filled), folded `[!question]-` callouts to predict then reveal, and a
  folded `[!success]- Answer key` per section; checked blank (0 cards) and filled (scratchpad
  `tstest/test27.ts`). Fixed with it: a run of 3+ underscores is plain text, never emphasis
  (parseInline + `inRun` in escapeText; `{{_____}}` used to save as `{{**_**}}`). In the editor,
  double-clicking a blank selects it and typing stays inside the cloze (Playwright-checked).
  After her first real guided note (Nov 18): in WebKitGTK a double-click didn't visibly select a
  blank, so a single click (or double-click) on a blank cloze now selects the whole gap
  (`selectBlank` / `clozeAt` in the Cloze mark's plugin) and a selection inside a cloze has a
  stronger tint. Callout titles wrap (her ask): `.b-ctitle-view` shows the title clamped to two
  lines with "…"; clicking it swaps to the `.b-ctitle` textarea (grows while editing, Enter
  leaves, new lines become spaces; `.b-chead.editing`).
  Her first Claude guided note (Nov 18) had a blank line between `<!--mosaic-table …-->` and its
  table, so the table, `:: table` and the comment showed as text: blank lines between `:: table`,
  the mosaic-table line and the table are now allowed in both `tableFrom` (mdDoc.ts) and
  `tableAfter` (cards.ts). An empty `>` line right after a callout title is harmless (dropped).
  A concept still to be filled in (`Lithium ;;` with empty `;;;` descriptors under it) is no
  card (`kindOf`; it used to become a list card of the property names); a space typed right after
  an arrow pill isn't saved twice (serializeInline drops the text's leading space after an arrow).
  The empty line she kept seeing under "Lithium ;;" came from PASTING Claude's note: the clipboard's
  formatted copy went through `htmlToMd`, which added empty lines. Now (BlockEditor paste) plain text
  written in Mosaic syntax (`{{…}}`, ` :: ` / ` ;; ` / ` <:: ` arrows, `> [!kind]`, `<!--mosaic-`,
  `:: table`) wins over the formatted copy, and pasted front matter goes to the note's properties
  (`onpastemeta` → NotesView `pasteMeta`: only keys the note lacks; tags are merged). Importing
  (her "there's no import"): `importNote` in the notes store saves a .md as is under its own file
  name (made unique); `importFiles` in noteOps (one file opens, several give a message); Notes home
  "Import" button and dropping .md files from the file manager onto Notes home (`dragHasFiles`),
  and a folder's right-click "Import notes here…".
  Split note in the guide (Nov 18, her ask): "Split note (two pages side by side)" explains
  `<!--mosaic-pages-->` / `<!--mosaic-page-->` / `<!--/mosaic-pages-->` with `width: full`, one per
  note at the top level, four uses (compare two things, lecture | my notes, learn | test, case |
  workup) and two examples (both parsed and imported in the preview). Fixed with it: card context
  after a split (or columns) kept the last half's heading; extractCards now restores the headings
  from above the split at each `<!--mosaic-page-->` / `<!--mosaic-col-->` and at the closer.
  Several splits in one note work (her prompt uses one per section for two-way comparisons); a
  split only keeps the 60vh writing room when it ends the note (`.b-pages:last-child` in
  editor.css), otherwise it is as tall as its halves.
  Her "Disease | Drugs" layout (Nov 18): the whole lecture below the Learning objectives in one
  split, disease sections left (incl. choosing therapy, guidelines, cases), drug sections right;
  full `##` sections, `---`, tables and callouts inside halves parse and keep their context
  (scratchpad `tstest/t40.ts`). Her prompt picks it when both parts have 2+ sections.
  The guide ends with "Reference: everything Mosaic can and can't do" (note features,
  interactivity limits, the flashcard and review system, quizzes / library / PDFs / labs, limits)
  and a brainstorming prompt, so Claude can invent activities that are buildable. Update both parts
  when a feature lands or a limit goes away.
- Print / save as PDF (Nov 18): note ⋯ → "Print or save as PDF…" calls `window.print()` (the GTK
  print dialog; "Print to File" gives a PDF). `src/styles/print.css` keeps only `.printroot` (the
  note's `.scroll`): everything that neither holds it nor sits inside it is hidden, the frames
  around it lose height / overflow / glass, and handles, dots, menus, refs, empty chips, the cover
  buttons, the empty icon button, line hints and the caret go; callout titles print from a hidden
  `.b-ctitle-print` span (the title input can't wrap).
  Columns and side by side keep their layout; folded parts stay folded. A dark theme prints as
  Mosaic (NotesView `printNote`, restored on `afterprint`). Checked with Playwright `page.pdf`.
- Managing notes and folders (Nov 18, her ask; `src/lib/stores/noteOps.svelte.ts`, menu + drag
  ghost + messages in `src/routes/study/NoteMenu.svelte`, mounted once in NotesView and moved to
  `<body>` so `position: fixed` means the window). Right-click a note in the notes list, search
  results or Notes home lists: Open, Rename (links renamed too), Move to…, Delete (to `.trash/`).
  Right-click a folder (tree row or home tile): New note here, New folder inside, Rename, Icon and
  colour, Move to…, Delete folder (with everything in it, to `.trash/`). Folder looks are the
  synced collection `noteFolders` keyed by folder path ({icon emoji, color}); they move with the
  folder, colour overrides the course colour on tiles. Dragging is pointer-based (6px threshold,
  then the click is swallowed); drop targets are elements with `data-drop-dir` (tree folder `li`,
  the tree root = top level, home tiles, home breadcrumbs); a closed tree folder opens after
  650ms under a drag. `noteHooks` (flush / moved) are set by NotesView, so the open note is saved
  first and followed to its new path (or home when deleted); `ui.lastNote` follows too.
  `moveNote` / `moveFolder` rewrite a note's `attachments/` paths when its depth changes
  (`rebaseAttachments` in notes.ts; node test scratchpad `tstest/test22.ts`), else pasted images
  broke after a move. Links `<a>` there need `draggable="false"` (WebKit's own link drag).
  Duplicates (her Nov 18 bug: a note dragged into a folder and straight back out sometimes came
  out twice): the image-path save of the first move landed after the second move and recreated
  the file. Now `notes_write` with `expected` refuses a file that no longer exists ("missing"),
  noteOps runs changes one at a time (`queued`), and a refresh that overlaps a move / rename /
  delete (`changes` counter in the notes store) is dropped and runs again.
- Note defaults (Nov 18, her ask; Settings → Appearance → Notes): header Compact / Full
  (`settings.noteHeader`), page width (`settings.noteWidth`), open notes as Mosaic page or Markdown
  (`settings.noteOpen`, applied each time a note loads), formatting toolbar while typing / always
  (`settings.noteTools`, the ✎ button flips the same setting). A note's own choice is front matter
  `width:` / `header:`, written only when it differs from the default (so `width: readable` now
  exists when the default is wider); the ⋯ menu's Header is per note now. The old per-machine
  `fullHead` / `tools` in "mosaic.notePanels" are carried into Settings once.
- Picking up where she left off (Nov 18, her ask): the open note is `ui.lastNote` (`setLastNote` in
  `src/lib/stores/ui.svelte.ts`, localStorage "mosaic.lastNote", per machine). StudyNav's Notes tab
  links to that note from any other page; clicked while already on Notes it goes to the Notes home
  (folders), and showing the home clears `lastNote`. Scroll position per note is kept for the
  session (`noteScroll`, saved in `checkHead`, put back after the note loads).
- Card status dots (Nov 18): every card line (block with a `sid`) ends with a small dot from the
  decoration plugin (`.b-cstat s-<status>`, hover = tip): rose due, peach learning, lavender new,
  sage known well (interval ≥ 21 d), grey later / paused. NotesView works it out per line id from
  `extractCards` + the `srs` records (`cardStatusMap`) and hands `cardStatus` to BlockEditor, whose
  effect dispatches `REFRESH_MARKS` so the dots follow reviews.
- Folding (Nov 18): a ▾ after a heading (shown on hover) folds everything under it up to the next
  heading of the same or a higher level or a `---` divider (her pick "1": a divider ends a
  section), in the same page / half / column (an empty heading gets no ▾: it sat on the cursor and
  pushed the "Heading" hint aside); folded it shows
  "▸ N hidden". A view setting, never in the file: `mosaicFolding` plugin in blocks.ts, keys
  `level|text|nth`, remembered per note per machine in localStorage "mosaic.folds" (BlockEditor
  prop `foldKey` = the note's path). Callouts fold with the ⌄ in their header: attr `fold`, saved
  as Obsidian's `[!kind]-` (folded) / `[!kind]+` (foldable, open).
- Toggle headings (Nov 18, her pick "3", Notion-style): node `toggle` (group block, content
  `heading block*`, attr `closed`) = a heading that holds its own blocks. File:
  `<!--mosaic-toggle-->` (or `<!--mosaic-toggle closed-->`), the heading and blocks,
  `<!--/mosaic-toggle-->` (they nest; `TOGGLE_OPEN` / `TOGGLE_CLOSE` in mdDoc.ts; other apps show a
  plain heading; cards inside work as usual). Look: a ▾ caret column (`.b-tcaret`) beside the
  heading, content indented under the heading text, a faint guide line on hover, folded shows
  "N hidden". Make one: `/thead1`, `/thead2`, `/thead3` (or "/toggle"; the line becomes its heading) or ⠿ on a heading →
  "Make it a toggle (takes its section)" (up to the next same/higher heading or divider). Enter in
  a folded toggle's heading opens it; Enter on an empty last line steps out below; Backspace in an
  empty toggle heading with nothing inside turns it back into a line (never merges upward); ⠿ →
  "Fold or open", "Remove toggle (keep everything)". `toggle` is in BlockEditor's `HOLDERS`, so
  blocks inside get their own handle; a toggle's heading maps to the toggle (handle just left of
  it, clear of the caret). Node test: scratchpad `tstest/test17.ts`.
- Nov 18 fixes: the ⠿ menu opens beside the handle that opened it (`blockMenu.x`); the selection
  toolbar slides to stay on the page near an edge; flashcard bullets / numbers line up with plain
  ones (`--cpl`, the left part of the card inset, is 0 for `.b-bullet` / `.b-ordered`).
- Saving on leave (bug found Nov 16: leaving a note within the 700 ms autosave lost the last
  edit): BlockEditor keeps a `dirty` flag and hands its Markdown to `onleave` in `onDestroy`;
  NotesView's `leaveFor(rel)` rebuilds the file from the saved front matter + title and saves it a
  tick later; the Markdown view saves `body` the same way (`saveSourceNow`). Editor events reach
  page state through `queueMicrotask` and are ignored while closing, because focus leaving during
  a Svelte rebuild otherwise throws `state_unsafe_mutation`.

## Notes editor like Docs / Notion (N1, built; now the "Edit as Markdown" view)

- Files stay Markdown; the editor hides the syntax. `src/lib/editor/livePreview.ts` (CodeMirror,
  lezer syntax tree): on lines the selection is NOT on, heading `#`s, `**` `*` `~~`, inline code
  backticks, link `[…](url)` (text shown as a link; Ctrl+click opens), `[[target|alias]]` brackets
  and target, `==` and `<mark class="…">` tags are hidden; the line being edited shows raw
  Markdown (Obsidian live preview). Bullets are dots, `- [ ]` / `- [x]` are clickable checkboxes
  (checked lines struck through), `---` is a divider, quotes get a bar, `> [!note|tip|warning|
  exam|info|…] Title` blocks are coloured callout boxes with a badge.
- Tables (`findTables`, a StateField with block widgets): shown as a real table unless the
  cursor is inside; clicking a cell opens the raw table at that cell. Tab / Shift-Tab select the
  next / previous cell's text, Enter adds a row, Enter on an empty row leaves the table.
- Enter on an empty `>` line ends a quote or callout (leaves a blank line after it).
- "/" menu (`slashMenu`, part of the autocomplete source): headings, lists, checklist, table,
  callouts, quote, divider, code block, flashcard, two-way card, cloze, note link, highlight.
  Block types typed mid-line go on a new line.
- Shortcuts: Ctrl+B / I, Ctrl+Shift+X strike, Ctrl+Shift+H highlight, Ctrl+K note link. Toolbar:
  H1–H3, bold, italic, strike, highlight colours (yellow = `==…==`, others = `<mark class="rose|
  sage|peach|lavender|blue">`), bullet / numbered / checklist, table, callout, divider, links,
  card syntax.
- Pasting rich HTML (`src/lib/editor/htmlToMd.ts`): Google Docs and web pages keep headings,
  bold / italic / strike (Docs uses inline styles and a fake outer `<b>`), background-colour
  highlights, nested lists, tables, links (Google redirect links unwrapped). Bold is dropped
  from headings and table headers.

## Study S1 + S2 (built): Study tab and notes

- Sidebar "Labs" is now "Study" (`#/study`); Recall Labs keep their `#/labs/...` routes and show
  the Study tabs (Home, Notes, Recall Labs) on top (`src/routes/study/StudyNav.svelte`). Cards and
  PDFs tabs get added when S3/S5 land.
- Notes: Rust `src-tauri/src/notes.rs` (list / read / conflict-safe write with expected mtime /
  pasted images / mkdir / move / trash into `.trash/`; refuses to create the folder when Drive is
  unmounted). Note images are served at `/__notes/…` like labs (and by `vite.config.ts` in dev).
- `src/lib/notes.ts` (pure, node-tested): front matter (course, tags, date, event, unknown keys
  kept), title = first H1 or file name, [[links]] (alias and #heading forms), #tags, headings,
  rename links, safe file names, templates (Lecture, Drug monograph with `::` fields, Disease
  state, Patient case SOAP).
- Store `src/lib/stores/notes.svelte.ts`: in-memory index cached in `notes-cache.json`, re-reads
  only changed files, refresh on focus. Renaming a note renames the file, its H1 if it matched,
  and every [[link]] to it. Clicking a link to a missing note creates it. Class notes:
  `classNote(eventId, date, …)` keyed by front matter `event: id@date`, in a folder named after
  the course, lecture template.
- Editor `src/lib/components/NoteEditor.svelte` (CodeMirror 6): styled Markdown, • bullets,
  Tab/Shift-Tab, ==highlight==, [[link]] chips that open on click + autocomplete, #tag
  autocomplete, card syntax highlighted (`::`, `:::`, `{{cloze}}`), pasted images saved to
  `attachments/` and shown inline. Autosave 700 ms; a conflict shows "Load that version / Keep mine".
- Notes page: tree with search (title + full text), properties row (course, date, tags), ⋯ move /
  trash, toolbar, right column with Linked to, Outline, Backlinks, Links (missing ones offer
  create). Event editor has "Take notes / Open notes"; course pages list Course notes (+ Note);
  the old course notes pad is now "Scratch pad".
- Layout gotcha: a container query can't style the element that is the container. NotesView and
  Calendar wrap themselves (`.nwrap`, `.calwrap`) for that reason.
- Empty `<input type=date>` shows today's date in WebKitGTK; add class `empty` (greyed) when unset.
