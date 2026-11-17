# Mosaic (formerly Study Desk)

**Mosaic: your student life in full view.** Personal app for Jazmine (pharmacy student). Built for
her own use until v1.0; during spring semester 2027 she'll share it with friends on **Windows**,
once the Study tab and the Planner are complete (plan: `ROADMAP.md` "Sharing with friends"). So:
don't hard-code her personal data as defaults in new code, keep paths and file opening
cross-platform where it's cheap, and keep the app light on laptops. Desktop app for Arch Linux + Hyprland
(Wayland, end-4 illogical-impulse dotfiles). Must install identically on her PC (AMD GPU) and
laptop (NVIDIA GPU) through `./install.sh`.

## Working agreements

- Build in small phases she can run and look at. After each phase give the exact commands to run
  and a checklist of what to check.
- Before installing any system package, say exactly what and why.
- Never edit her Hyprland config. Offer snippets (`packaging/hyprland-rules.conf`) she pastes herself.
- Personal data never goes in the repo.
- Work follows `ROADMAP.md`: one focus per week until v1.0 on Dec 31, 2026. Stay inside the current
  week's focus; log anything else under "Found this week" in that file.

## Product direction (her words, Nov 16)

The full vision, principles and what she likes or dislikes in each inspiration are in
`VISION.md`. Read it before planning or designing anything.

- The app has a lot of personality and room for customisation. Biggest inspirations: RemNote,
  xTiles, Notion and Obsidian.
- It has **two sides that respect the user**: it supports her student life AND her personal
  life. For now only the student side is being built; keep room for a personal side later
  (don't hard-wire everything to courses).
- Planned structure (not built yet, likely): **Courses merge into Study** as one cohesive space
  for everything school-related; **Tasks and Calendar merge into one Planner tab**.
- The look from the design canvas "Study tab redesign" is built (see "Look" below). Study →
  **Materials** (M1) is built; the quiz engine and the rest follow the Study track in `ROADMAP.md`.

## Stack (decided)

- Tauri v2 (Rust) + Svelte 5 (runes) + Vite + TypeScript. Plain CSS with variables, no UI framework.
- Shown as **"Mosaic"** (renamed Nov 16; tagline "your student life in full view"). The internal
  name stays `studydesk` on purpose: Tauri identifier, binary, `.desktop` file, Wayland app id /
  Hyprland class, `~/.local/share/studydesk/` and the webview data dir (where lab progress lives
  in localStorage). Changing the identifier would move all of that; don't, unless migrating on
  purpose. The sync folder default also keeps its old name ("Study Desk Sync").
- App icon (chosen Nov 16, option C "glass tiles"): frosted white tiles on a pink→periwinkle→mint
  gradient. Source `packaging/studydesk.svg` (viewBox 120); the PNGs in `src-tauri/icons/` and
  `packaging/studydesk.png` are rendered from it with Playwright. The rail logo inside the app is
  NOT the coloured icon since Nov 18 (her pick "D · Accent glow", canvas "Rail logo that fits every
  theme"): the same three tiles on a `--chip` square, the back two in `--text` at 16% / 28%, the
  front one in `--accent`, so it follows every theme (inline SVG in `Sidebar.svelte`).
- App data: JSON files in `~/.local/share/studydesk/`, written atomically from Rust. Anything that
  should follow her between PC and laptop goes in the synced store (see "Sync" below), not in its
  own JSON file. Machine-only data (settings, scan cache, labs tree) stays local.
- No Google APIs at all. She decided against Google Calendar: the calendar is local and syncs
  through the Drive folder like everything else. Drive is only ever touched as a mounted folder.
- Font bundled through `@fontsource/atkinson-hyperlegible-next`. The app must work offline.
- Bundling is off (`bundle.active: false`); `install.sh` builds with `tauri build --no-bundle` and
  installs the binary, icon and `.desktop` file into `~/.local`.
- NVIDIA: `install.sh` detects the driver and puts `WEBKIT_DISABLE_DMABUF_RENDERER=1` in the launcher.

## Look (Nov 16 redesign, built): frosted glass, floating rail, roomier, lively

Built from her choices on the design canvas. This section wins where the older "Design" section
below disagrees.
- **Themes** (Nov 17, 15 of them; Settings → Appearance picker with live mini previews;
  `settings.theme`, `<html data-theme data-family>`; list + picker data in `src/lib/themes.ts`):
  Glass = Mosaic (the Nov 16 frosted glass, default), Pink, Green, Blue, Purple; Neutral = Linen,
  Stone, Oat, Plain, Default; Dark = Catppuccin (Mocha), Tokyo Night, Rosé Pine, Gruvbox,
  Everforest (official palettes). The old solid "pastel" theme was retired (saved "glass" /
  "pastel" open as Mosaic). In `tokens.css` each family has ONE shared block that builds every
  token from a few base colours (`--t-*`); a theme block only sets those. Dark themes remap the
  pastel palette (`--rose`, `--sage-soft`, `--white`, `--charcoal` …) to the theme's own colours,
  so components follow without their own dark rules, and set `color-scheme: dark`. Tokens for
  meaning: `--alert-ink`, `--go-ink`, `--link-ink`, `--scrim`, `--ink-on-color` (text on a bright
  pill), `--hero` / `--on-hero` (the dark hero cards). Don't hard-code colours in components; use
  these. Secondary text on a coloured tint uses `--muted-on-tint` (76% of `--text`), not
  `--text-muted`; mix tints with `var(--white)`, never plain `white` / `#fff` (dark themes remap
  `--white`; a plain white mix stays light). Nov 18 contrast audit (Playwright script over every
  page in all 15 themes) fixed those. Flashcard arrow / card / cloze colours follow the theme (`arrowColor` / `clozeColor`
  "theme", the default) unless she picks her own. Highlights, cell tints, callouts and the
  course headers are tinted into the page in dark themes. After her Nov 17 feedback ("the frosted
  themes aren't the clean look of the mockup"): big feature cards use tokens `--feature` (greeting
  hero) and `--spot` (next-exam card) with `--on-*`, `--spot-track`, `--spot-btn`; in Glass they
  are frosted white with a bloom of the theme's colours (no orange hero, no dark block); the four
  one-hue Glass themes remap the pastel palette and `--g-*` to shades of their hue; Mosaic's
  `--g-*` are pale washes; waves are faint. Glass = colour blooms on `--backdrop`, translucent white
  `--panel` / `--surface`, a thin bright `--edge` (the one exception to "no outlines") and
  `--blur`. Neutral (Nov 18, her "neutrals need more pizzazz / leftover colours"): Linen, Stone and
  Oat remap the whole pastel palette and `--g-*` to their own earthy colours (Linen clay / straw /
  olive, Stone dusty rose / sage / slate, Oat brick / ochre / denim), have soft blooms under the
  paper noise (`--t-b1..3`, shown beside the rail in Curve), and a light `--hero` (no dark blocks).
  **Only the big layers blur** (main panel, rail, dialogs, menus); cards are plain
  translucent white on the already-blurred panel. Backdrop blur is costly to repaint in WebKitGTK,
  so don't add `backdrop-filter` to cards or list items. Anything floating (dialogs, `div.menu`,
  `div.pop`, `div.selmenu`) gets the nearly opaque `--surface-float` from base.css. Inputs use
  `--field`.
- **Window frame** (Nov 18, her pick from canvas "Native look, Mosaic vibe"; `settings.frame`, `<html
  data-frame>`, Settings → Appearance → Window): **curve** (default) = no border around the app,
  like a native app: the rail is a full-height column of icons on the colour bloom, and `main` is
  one sheet touching the window's top, right and bottom edges with a big 38px curve on its left
  (the bloom peeks through beside the rail); **sheet** ("Glass rail") = a frosted full-height rail
  column with a hairline and a straight page; **float** = the original floating rail and panel
  inside an 18px glass border. In curve / sheet `main` uses `--sheet` (glass family: the theme base
  at 80%, so the bloom only glows faintly; other families fall back to `--panel`). Writing mode
  brings the rail back as the floating pill in every frame. CSS in App.svelte (`.shell`, `main`)
  and Sidebar.svelte (`.rail`). Windows: Mosaic's own – □ ✕ title bar is planned with the
  "Sharing with friends" track.
- **Density** (`settings.density`, `<html data-density>`): spacious (default), original, compact.
  Spacing tokens: `--gap`, `--card-pad`, `--main-pad`, `--shell-pad`, `--radius`.
- **Floating rail** (`Sidebar.svelte`): logo, + quick add (Task, Event, Note, Flashcard, PDF), page
  icons with a dark marker that slides to the active page, overdue dot on Tasks, and at the bottom
  only the avatar initial (Nov 18, her ask: no streak badge, no settings icon). Hovering the avatar
  (or clicking / focusing it) springs open a menu to its right: name, Settings, Appearance (scrolls
  to `#look-h`); a ring around the avatar marks the Settings page. Names show on hover/focus (CSS
  `data-tip`). Replaced the labelled sidebar and the streak panel.
- **Folder tiles** (`FolderTile.svelte`): tab + frosted body; the open folder (last used) takes its
  course colour and shows sheets (note snippets or PDF page sketches); any folder shows them on
  hover. Used on Notes home (`NotesHome.svelte`, shown when no note is open), PDFs home (folder
  view when not searching) and Study Home.
- **Study Home** (`StudyHome.svelte`) is the card dashboard from the mockup: hero with week strip,
  next exam with readiness ring (cards ready + lab average), today's plan with ticks, flashcards,
  mastery by course, jump back in, habits this week (from activity), weak spots (lapses + labs to
  revisit), note folders, 7-day review forecast, drug of the day (from her Drug cards), focus
  timer, recall labs. Highlights inbox, exam prep hub and the widget gallery are not built.
- **Motion**: tokens `--spring` (overshoots a little), `--spring-soft`, `--ease-out`. Pages arrive
  with a springy rise (`App.svelte`, keyed per page), cards pop in with a short stagger, dialogs
  and menus pop, buttons lift and squish, icons wiggle on hover, ticks pop, bars and rings fill.
  Entrance animations use `backwards` fill so they never pin `transform` afterwards (hover lifts and
  the board's drag ghost rely on that). All motion is off with "reduce motion".

## Design (decided: soft, fluid pastel; now the "pastel" theme)

She dropped neo-brutalism entirely (first softened it, then switched). Do not bring back ink
borders, hard shadows, window-dot header strips, hatched fills, Unbounded or Space Mono. (Outfit + DM Sans were tried and replaced too.)
Everything lives in `src/styles/tokens.css`:

- No outlines. Soft blurred warm shadows, 26px card radius, pill buttons, gentle gradients and
  layered wave shapes (`Wave.svelte`) as decoration. Touch targets at least 44px.
- Palette taken from her pastel reference: rose #F2B8B5 (deep #E3949B), peach #F6CFA8,
  sage #A9CDC3 (deep #7FB3A6), butter #F7E3B0, each with a `-soft` tint; ivory #FBF6F0 panel,
  white #FFFDFB cards, charcoal #3B3033 text and primary buttons, mauve #6F6164 muted text.
- Meaning: rose = exams/alerts/overdue, sage = done/study/go, peach and butter = neutral accents.
- Card tones cycle through `TONES` (rose, sage, peach, butter) using the `--g-*` gradients.
- Font: Atkinson Hyperlegible Next everywhere (she asked for something clean and easy on the
  eyes): 600 for headings and big numbers in sentence case, 400–500 for body and labels.
- Layout: backdrop is a soft rose-to-sage gradient; the sidebar sits directly on it and the active
  nav item is a tab that flows into the big rounded ivory main panel. Sidebar has the streak panel
  at the bottom. Main card grid plus right column (countdown, current block, mini month, today,
  quick play). Must hold up in narrow tiled windows: right column drops below ~1180px, sidebar
  becomes an icon rail below ~860px.
- Components use semantic tokens (`--panel`, `--surface`, `--text`, `--primary` …) so dark mode
  later is one extra block of variables.

## Materials (M1, built): the labs folder's new name, plus uploads

- Study → **Materials** replaces Recall Labs (tab, page titles, Settings "Materials folder"). It is
  the same scanned folder (`settings.labsRoot`, routes `#/labs/...`); new default
  `~/GoogleDrive/Pharmacy School/Study Lab/Materials`.
- Moving in (`resolveRoot` / `adoptMaterials` in the labs store, Rust `src-tauri/src/materials.rs`):
  if the folder in use is named "Recall Labs" (or the Materials default is missing but a sibling
  "Recall Labs" exists, which is then used for the session), the Materials page shows "Move your
  labs into Materials?". `materials_adopt` renames the folder (or moves its entries into an
  existing Materials, skipping name clashes) and writes `.mosaic-materials`. Paths inside stay
  the same, so progress (keyed by slug) and folder links / exam dates (keyed by relative path)
  carry over. Another computer whose settings still say "Recall Labs" sees the marker in the
  sibling Materials folder and switches by itself (tested with a second HOME).
- Upload (`UploadDialog.svelte`): Upload button on every Materials folder, or drop files anywhere
  on Materials (window `dragDropEnabled: false` in tauri.conf so the webview gets real HTML5 file
  drops). Each .html is read and checked (`src/lib/materials.ts`, pure, node-tested; mirrors the
  Rust lab detection): title, version, slug. Course + "exam or topic folder" choose the place:
  `Materials/<course folder>/<exam>/<file>` where the course folder is the top folder already
  linked to that course, else the course code; a new course folder gets linked to its course.
  Same slug already present → "Replace it, keep my progress" (overwrites that file in place) or
  "Add a second copy". Non-lab HTML is skipped unless ticked. `materials_write` only writes
  html/htm/md/txt/json inside the folder and refuses to overwrite without `replace`.
- Materials home: chips to browse one course's labs across its exam folders.
- Self-test: `STUDYDESK_ROUTE=selftest-materials` (move, marker, upload, refuse overwrite).

## Quiz engine core (M2, built)

- Format: `docs/mosaic-format.md` (v1). Markdown with front matter `mosaic: quiz`, questions start
  `## Q<n> · <type> · <topic>`; types single, sata (all-or-nothing), tf, blank (`{{a|alt}}`),
  dropdown (`{{*right|wrong}}`), calc (`Answer: 50 mL/min ± 2`, default ± 1%); `>` lines are the
  explanation. Parser and grading in `src/lib/quiz.ts` (pure, node-tested): problems with line
  numbers (bad questions are skipped, not fatal), typo tolerance for blanks, question id =
  fingerprint of type + stem. `QUIZ_GUIDE` there is the copy-ready text for Claude.
  `src/lib/md.ts` renders material Markdown (tables, lists, images, inline styles).
- Scanner (`labs.rs`): `.md` files whose front matter has `mosaic: <kind>` become items of kind
  `material` with `mat {kind, title, id, course, exam, count}`; the scan cache entry has `v2` so
  old caches re-inspect `.md` files once.
- Player (`src/routes/labs/QuizPlayer.svelte`, route `#/labs/<rel>` of a quiz file): start screen
  (topics, best / last / attempts / to redo, shuffle questions + options, Practice all, Redo
  missed, list of unreadable parts), one question at a time with Check → feedback (right answer,
  explanation; card turns sage or shakes rose) → Next, keys 1–9 / A–I / T / F / Enter, results
  ring with by-topic bars and a to-review list. Progress: synced collection `quizzes` keyed by quiz
  id (`src/lib/stores/quizzes.svelte.ts`): per question seen / right / last / lastRight, last 30
  attempts. Best counts full practice runs only. Finishing marks a study day.
- Getting quizzes in: Materials → Paste quiz (`PasteQuiz.svelte`: strips ``` fences, live check,
  Copy format for Claude) hands a .md file to the upload dialog; uploading or dropping .md works
  too. The dialog files a quiz under its `course` / `exam` from the header when the course
  exists, and offers "Replace, keep my progress" when a quiz with the same id is already there.
- Folder pages show a Quizzes section (best, last, attempts, to redo); Materials home counts
  quizzes.

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
  1240px with both). **Writing mode** (button or Ctrl+\; `ui.writing` in
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
  tidy the doc in between). Ctrl+Shift+A always selects the whole note. Blocks in the right half get the handle 52px left of them; a click in a half's
  empty space writes at its end.
- Pasting into a spot that can't hold every block (Nov 18, `fitPaste` / `pasteSpot` in BlockEditor):
  in a table cell headings become text, quotes / callouts give their lines, a table gives one
  "a · b" line per row, code gives a line per line, dividers / images are dropped (a pasted image
  FILE goes in as an inline image: in a cell it starts at most the cell's width and 200px tall, and its corner grip resizes it, saved as `![|width](src)` like block images, double-click the grip to fit); in a column, pasted columns / side by side open up into their
  blocks. Plain text with `<!--mosaic-` lines counts as Markdown.
- Print / save as PDF (Nov 18): note ⋯ → "Print or save as PDF…" calls `window.print()` (the GTK
  print dialog; "Print to File" gives a PDF). `src/styles/print.css` keeps only `.printroot` (the
  note's `.scroll`): everything that neither holds it nor sits inside it is hidden, the frames
  around it lose height / overflow / glass, and handles, dots, menus, refs, empty chips, the cover
  buttons, the empty icon button, line hints and the caret go; callout titles print from a hidden
  `.b-ctitle-print` span (the title input can't wrap).
  Columns and side by side keep their layout; folded parts stay folded. A dark theme prints as
  Mosaic (NotesView `printNote`, restored on `afterprint`). Checked with Playwright `page.pdf`.
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
  section), in the same page / half / column; folded it shows
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

## Recall Labs (Phase 2, built; now inside Materials)

- Labs folder: `~/GoogleDrive/Pharmacy School/Study Lab/Recall Labs` (rclone mount; read from disk,
  never the Drive API). Configurable in Settings, with scan depth (default 4).
- Every folder is a dashboard (`src/routes/labs/FolderView.svelte`): its labs with progress,
  subfolders, notes (.md .txt .docx .doc .odt .rtf .gdoc .pages) and files (everything else,
  opened with `xdg-open`), plus a "Link this folder" card: course, exam date, colour. Those are
  stored in app data `labs-folders.json` keyed by path relative to the labs folder (course and
  colour inherit from parent folders; renaming a folder loses its link). A folder exam date feeds
  the dashboard countdown as "<parent> <folder>", e.g. "Ther IV Exam 5".
- Lab detection: `<meta name="recall-lab-version">` (any attribute order) plus `<title>`. Slug: the
  most frequent literal `recallLab.<slug>.v3` in the file; if none (key built dynamically), slugify
  the file name and flag `slug_guessed`. Non-lab .html files are plain files.
- Scan (`src-tauri/src/labs.rs`): reads only the first 64 KB for the meta tag (whole file only to
  find the slug), cached by path + mtime + size in `labs-scan-cache.json`; last tree cached in
  `labs-tree.json` so the app opens instantly, then rescans in the background.
- Progress: `recallLab.<slug>.v3` → `best` (sections tried = number of keys, average best %),
  `missed` count, `known`, `sims` sorted by `d` (last and best `pct`). Parser: `src/lib/progress.ts`.
- SERVING (important, tested): labs are served at `tauri://localhost/__labs/<rel>` through
  `on_web_resource_request` on the main window (built in `setup`, config has `create: false`), so
  labs and the dashboard share ONE origin and localStorage, read directly (`src/lib/labStorage.ts`)
  with `storage` events for live updates. A separate `lab://` custom-scheme origin in an iframe was
  tried first: WebKitGTK gave it session-only storage, so progress vanished on restart. Do not go
  back to a separate origin. In `tauri dev`, `vite.config.ts` serves `/__labs/` the same way.
  Trade-off: labs run on the app origin and could call app commands; acceptable because she
  writes the labs herself.
- Settings has "Check lab storage" (proves persistence across restarts) and a paste box to import
  `recallLab.*` progress copied from a browser's devtools console.
- Streak: days with a lab opened (`labs-activity.json`); study-block check-offs join in Phase 4.

## Testing without a screen

`STUDYDESK_ROUTE=labs/<path>` opens a page at start; `STUDYDESK_ROUTE=selftest` prints the storage
probe, scanned labs, stored progress and sync results to stdout, then exits. Two "machines": run a
second copy with `HOME=/tmp/homeB` (symlink `/tmp/homeB/GoogleDrive` to the real one). Pure
modules (`labMerge.ts`, `calendar.ts`) import nothing, so they can be tested with plain `node`. With Xvfb:
`DISPLAY=:99 STUDYDESK_ROUTE=selftest ./src-tauri/target/release/studydesk`.
`STUDYDESK_ROUTE=selftest-pdf` reads a PDF from the PDF folder, saves a highlight into it through the
raw IPC write, reads it back and checks that a stale write is refused.

## Sync between PC and laptop (Phase 3, built and tested)

- Sync folder (Settings, default on): `~/GoogleDrive/Pharmacy School/Study Lab/Study Desk Sync/`.
  Each machine writes ONLY its own file `<hostname>-<4 hex>.json` (id kept in local `machine.json`)
  and reads the others, so rclone never sees two writers on one file. Writes are temp + rename.
- `src-tauri/src/sync.rs` refuses to create the sync folder when its parent is missing (Drive not
  mounted), so nothing is ever written under an empty mount point. The app keeps working locally.
- `src/lib/stores/synced.svelte.ts`: named collections of records `{u: changed ms, m: machine,
  x?: deleted, v}`; merge keeps the newer record (tie: machine id). Deletes are tombstones.
  Local copy in `synced.json`. Sync on start, window focus, every 2 min, and 4 s after a change.
  `seed()` writes starter records stamped u=1 so any real edit on any machine wins.
- Collections: `events` (calendar), `folders` (lab folder links), `labOpens`, `days` (streak),
  `lab` (one record per `recallLab.*` localStorage key). Phase 2's `labs-folders.json` and
  `labs-activity.json` are migrated once into the store (old files left in place, unused).
- Lab progress merge (`src/lib/labMerge.ts`, pure): `best` = max per section, `known` = union,
  `sims` = union by `d`, `missed` and all other keys from the newer side. Local changes are caught
  from `storage` events and at each sync; the lab open in the viewer is never overwritten while open.
- Tested with two app instances (separate HOME, shared folder): migration, first pull on a new
  machine, and lab progress studied on one machine appearing on the other.

## Calendar (Phase 3, built; redesigned after her feedback)

She said the first version "looks too much like Google Calendar". The look now follows her two
references: a Skejulio-style planner (card events with a tag header, side panel with mini month
and tag checkboxes, "Create schedule" popover) and an exam calendar with month pills and day rows.
Do not go back to thin coloured blocks on a plain grid.

- Data (`src/lib/calendar.ts`, pure; store `src/lib/stores/calendar.svelte.ts`): event = title,
  tag id (`kind`), course, day, all-day or start–end, place, description (`notes`), repeat, skips.
  Dates are local "YYYY-MM-DD" strings.
- Tags (collection `tags`, synced): name, colour, "counts as exam", order. Built-in class / exam /
  study / other can be renamed and recoloured, not deleted; custom tags can be deleted (their
  events move to Other). Colours: `PALETTE` of soft swatches or any colour; components use
  `tagStyle(id)` (sets `--tag`, `--tag-ink`) with `color-mix` tints. Tag manager: `TagManager.svelte`.
- Repeat: daily / weekly (chosen weekdays) / monthly (same date, or same weekday like "3rd Monday"
  / "last Friday") / yearly, every N, ending never / on a date / after N times, plus per-day
  skips. `describeRepeat` writes the summary. Phase 3's `{weekdays, until}` shape is still read.
- Views (`src/routes/Calendar.svelte`): Day, Week (time grid with card events that show less as
  they get shorter or share a lane; click empty time to add; now line with a time pill), Month,
  List (next 14 days as day rows of cards), Exams (month pills with counts, day rows, empty runs
  folded into one short row). Side panel (mini month, tag filters, coming up) can be hidden;
  hidden tags and the panel state are per machine (localStorage).
- One shared editor popover (`EventEditor.svelte`) opens beside the click on wide windows and
  centred on narrow ones. Editing a repeating event changes the series; delete offers "only this
  day" or "every repeat".
- Exams = a tag marked "Exam" (e.g. a custom Quiz tag), or tag Other with an exam keyword in the
  title (Settings, default "Exam"), plus Recall Lab folders with an exam date (skipped when a
  calendar exam is on the same day). So "Exam 4 sim run" tagged Study is not an exam.
- Ther IV Exam 4 (2026-11-17) and Exam 5 (2026-12-04) are seeded as exam events; the four
  built-in tags are seeded too (u=1, so any edit wins).
- Dashboard: countdown, mini month, next-exam tile and Today timeline read the calendar.

## Tasks (built early, at her request; Phase 4 builds on this)

- Tasks are the second kind of calendar entry (collection `tasks`, synced). Shape in
  `src/lib/calendar.ts` (`Task`): title, notes, tag (default built-in "Task" tag), course, due day
  (optional) and optional due time, priority (high / normal / low), status (todo / doing / done;
  the Phase 4 board uses status as its column, custom columns may add ids), doneAt, estimate in
  minutes (for the Phase 4 study plan), checklist (`subtasks`), repeat with per-day `doneDates`
  and `skip`. Keep this shape stable.
- One editor for both (`EventEditor.svelte`): new entries have an Event / Task switch; existing
  ones keep their type. Every field is reset on open. Time inputs accept any minute (11:59 PM
  deadlines). Weekly repeat days follow the chosen date until she picks days herself.
- Calendar: tasks show as tickable chips (`TaskChip.svelte`) in the Week/Day "Tasks" row and in
  Month cells, and as cards (`TaskCard.svelte`) in List, which also has an Overdue section.
- Overdue = one-off tasks past due and not done (any age), and repeating tasks' missed days from
  the last 14 days.
- Dashboard: Tasks card lists overdue, today, then the next 5 days (tick, open, add); "Due today"
  tile and the summary line use real tasks.
- Tasks page (`src/routes/Tasks.svelte`): quick add (no date / today / tomorrow), course and tag
  filters, groups Overdue, Today, Tomorrow, This week, Later (one row per repeating task), No due
  date, Done (optional). The board view is still Phase 4.

## Phase 4: board, study plan, activity (built)

- Tasks page has tabs List / Board / Study plan (`#/tasks`, `#/tasks/board`, `#/tasks/plan`),
  files in `src/routes/tasks/`.
- Board (`Board.svelte`): group by status (To do, In progress, her own columns from synced
  collection `columns`, Done), by course (COURSES + No course) or by tag (tags are her own
  categories; "+ Add tag" makes one). Dragging is pointer-based (not HTML drag-and-drop, which
  Tauri's file-drop handling can block on Linux); the board auto-scrolls near its edges. A drop
  sets status / course / tag and renumbers `order` for the column it lands in. A repeating task
  shows once, as its next unticked day; dropping it on Done ticks that day. Deleting a custom
  column moves its tasks to To do. Done shows the last 14 days. Per-column quick add.
- Study plan (`src/lib/plan.ts` pure, `src/lib/stores/plan.svelte.ts`): synced collection `plans`
  keyed by day, `{blocks, start?}`; block = title, minutes, study/break, done, spentMs, optional
  taskId / labRel / course. Times are worked out from the start time. The timer is per machine
  (local `timer.json`), keeps counting across page changes and restarts (capped at the block length
  + 30 min if left running), chimes once when time is up, and saves time on pause / done.
  Checking off a study block counts toward the streak. Suggestions: Study events on the calendar
  that day, tasks due soon or overdue (using their estimate), and recent Recall Labs (missed review,
  sim run). Unfinished blocks from yesterday can be brought over.
- Floating timer pill (`TimerPill.svelte`) on every page except the plan; the dashboard's
  Current block card is the real next / running block.
- Activity heatmap (`Heatmap.svelte`, `src/lib/stores/activity.svelte.ts`) on the dashboard: score
  per day = study minutes + 20 per lab opened + 10 per task done; as many weeks as fit. `days`
  records are now `{labs, blocks}` counts (old records are `1` = one lab).
- Tested: drags in all three groupings, custom columns, the timer across pages, and the timer across
  a real app restart (`STUDYDESK_ROUTE=selftest-timer`, run twice).

## Tasks look (after her "more pizazz" feedback, from four mobile task-app references)

- Tasks page top: dark "Today's progress" card (ring % of today's tasks done, overdue, To do / In
  progress / Done this week) and a week strip with coloured dots per due task; picking a day
  filters List and Board (`taskView.day` in the tasks store). Files: `src/routes/tasks/`.
- Board cards: white, tag-coloured accent bar, coloured priority pill (Low = sage, Medium = peach,
  High = rose; the stored value is still `normal` for Medium), round open arrow, pastel tag icon
  tile, checklist progress bar, dashed footer with due (rose when late), estimate, repeat streak
  and the tick. Columns are tinted by status / course / tag colour with a count-bubble pill header.
- Tags have an icon (`Tag.icon`, picker in the tag manager, defaults in `DEFAULT_TAG_ICON`).
- List view is a routine-style timeline (`TaskRow.svelte`): tick circles on a dotted line, icon
  tile, "Streak N weeks" for repeating tasks (`taskStreak`), estimate / due on the right behind a
  divider, expandable checklist. Group headings have icons.
- Study plan blocks are a timeline: coloured circle icons on a line (study sage, break butter,
  lab peach, task = its tag colour); the current block is a tall pill that fills as time passes
  and says "N min remaining"; tick rings in the block colour.

## Phase 5: courses as the hub (built; she plans to keep adding to it)

The app's purpose is an all-in-one uni home base, and the course is what ties things together.

- Courses (synced collection `courses`, store `src/lib/stores/courses.svelte.ts`): name, short name,
  colour, icon, term, credits, instructor, email, office hours, room, grading, notes pad, optional
  drug-quiz tracker, archived. Seeded for Fall 2026 (ids ther4, law, pgx, app, capps, top200) with
  no grading; she fills it in from each syllabus. `courseNames()` feeds every course picker.
- Other records (events, tasks, lab folder links, plan blocks) refer to a course by NAME.
  `saveCourse` rewrites those references when a course is renamed (tested). Keep it that way or
  migrate everything to ids in one go.
- Grade maths (`src/lib/grades.ts`, pure, tested with node): weighted categories (points add up
  inside a category, drop-lowest N, extra credit, excused) or total points; current grade on what's
  graded; final grade is linear in the average x scored on everything left (final = A + B·x), which
  gives "need X% on the rest" (secured / reachable / out of reach), worst and best case, the
  graded share, what-if scores, letters from a per-course scale (A–F or +/−) and a term GPA estimate.
  A category with weight but no assessments yet counts entirely as "still to come".
- Pages (`src/routes/courses/`): Courses home (cards with grade ring, letter, need line, graded
  share, next exam/task, linked labs; term GPA; archived toggle) and a course page: gradient header
  with grade ring, editable target, need/what-if, worst–best bar; Grades module (category bars,
  inline-editable assessment tables, quick add per category, ⋯ menu for extra credit / excused /
  move category / delete, what-if mode); Drug quiz tracker (Top 200/300: drug ranges, average, best,
  coverage of the list, trend line, quick add that continues from the last range); side column with
  Coming up (exams, tasks, events for the course, + Task / + Event), Study (linked Recall Lab
  folders and labs, study minutes from plan blocks) and a Notes pad. Settings dialog
  (`CourseSettings.svelte`) with category templates and a weights-must-total-100 check.
- Dashboard has a Courses card (ring with letter, grade, need line per course).
- All placeholder pages are gone; every sidebar page is real.

## Study tab (decided; being built in phases S1–S6)

Labs became a generic **Study** area, "RemNote but better". Sections: Home, Notes, Cards, PDFs,
Recall Labs. Decisions she approved:
- Notes are Markdown files in a Drive folder (default `~/GoogleDrive/Pharmacy School/Study Lab/Notes`,
  Settings), readable outside the app. Card review history lives in the synced store, keyed by a
  stable card id written into the note.
- PDF annotations are saved into the PDF itself after a one-time backup of the original.
- Imports: Anki and CSV (built with the card library). No AI features.
- Libraries (npm, no system packages): CodeMirror 6 (notes editor), ts-fsrs (FSRS scheduling),
  pdfjs-dist 4.x legacy build (viewing), pdf-lib (writing annotations, later page editing).
- Phases: S1 Study tab shell with Recall Labs moved in (DONE); S2 notes (DONE); S3 cards in notes + FSRS (DONE); S4 card library (DONE); S5 PDF viewer + annotations (DONE) (editor, [[links]], backlinks,
  #tags, templates, class notes from calendar events, notes on course pages); S3 cards written in
  notes (`Q :: A`, `:::` two-way, `{{cloze}}`, list cards) + FSRS review + dashboard "cards due";
  S4 card library (note types with fields, Drug type, table → cards, CSV/Anki import, image
  occlusion, exam-aware scheduling/cram); S5 PDF viewer + annotations linked to notes and cards;
  S6 PDF page editing + Ctrl+K search everywhere.
- Her own additions to keep: exam-aware scheduling, table → cards for drug comparison tables,
  class notes linked to calendar events, Top 300 as drug cards feeding the quiz tracker.

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

## Study S3 (built): flashcards in notes + FSRS review

- Syntax (`src/lib/cards.ts`, pure, node-tested): `Q :: A` basic, `Q ::: A` two cards (forward and
  reverse), `A <:: Q` reverse card (Nov 18: shows the right side, asks for the left; key `id:r`, so
  switching ⇄ ↔ ← keeps its history; typed as ` <- ` or ` <:: `, arrow attr `back`, click on the
  pill cycles → ⇄ ←), concept `**Term** ::: meaning` (Nov 18, her pick "A": a both-ways line whose whole
  left side is bold; same two keys as ⇄, kinds `concept` / `concept` + `rev`; the editor marks the
  term with a green chip `.b-concept` and a ◆ pill via the decoration plugin), descriptor
  `Property ;; value` (kind `descriptor`, front "Concept › Property" with `concept` / `prop`
  fields; the concept is the nearest line it is indented under (a bold line counts), else the
  heading; `Property ;;` with indented bullets = list answer; arrow attr `desc`, a lavender › pill,
  the line isn't tinted like a card), `{{cloze}}` (each gap its own card; `{{c1::…}}` gaps hide together; `{{answer::hint}}`),
  `Question ::` with indented bullets below = list card. `Field ::` with nothing after it (the drug
  template) is not a card. Code blocks are skipped. Context = heading path + up to two parent bullets.
- Every card line gets a hidden stable id `<!--sd:xxxxxx-->` appended (review keys: `id`, `id:r`,
  `id:cN`). The editor adds ids to the open note while typing (`appendToLines`, cursor kept) and
  hides them as atomic ranges; `ensureIds()` adds them to other notes (skips `notes.editing`) with
  the usual mtime conflict check.
- Store `src/lib/stores/srs.svelte.ts` (ts-fsrs, enable_fuzz, max interval 10 y): synced
  collections `srs` (FSRS card state per key, dates as ms, `suspended`) and `reviewDays` (reviews,
  new, again, ms per day). Settings: `newPerDay` (20), `retention` (0.9). Learning cards may show up
  to 20 min early (Anki's learn-ahead). Undo restores the previous record (deletes it for a new card).
- UI: Study → Cards (`CardsView.svelte`): due now hero, stats (total, mature ≥ 21 d, 30-day
  retention, today), decks by course and by note, 14-day forecast, searchable card list with suspend,
  settings. Review (`ReviewSession.svelte`, `#/study/cards/review/all|course:<name>|note:<rel>`):
  context breadcrumb, Space to show, 1–4 to rate with next-interval labels, Z undo, "Edit in note"
  jumps to the line (`notes.jump`), summary at the end. Nov 18 redesign (her "nothing small like RemNote", canvas board
  "Flashcards in review"): text sizes "C · Calm" (her pick Nov 18 on artifact "Flashcard text sizes": questions 25px, answers
  21px, 22 / 19 in narrow windows; `--qs` / `--as` on `.card`; lists and table values use the answer
  size, labels 0.6 × answer, questions over ~90 characters 80%, one size for every card type). Layout (Nov 18, her ask): the review fills the panel (App `main.fit`,
  Study `.fill`): progress bar pinned on top, rate buttons pinned at the bottom in one fixed 92px row
  (Show answer is the same height, so nothing moves), and the card centred in `.stage` between them,
  growing both ways (scrolls inside only if taller than the space). Settings → Appearance →
  Flashcard review → Card text: Left (default) / Centred (`settings.cardAlign`, class `centred`;
  list and row answers stay left-aligned inside a centred block), the card
  as wide as the review area (max 1000px); each card type has a colour (`--t`: → rose-deep,
  ⇄ lavender (`NoteCard.two` marks both cards of a ⇄ line, "1 of 2 / 2 of 2"), ← peach, cloze
  butter, list sage-deep, table link-ink, image rose, library lavender/rose mix) shown as a corner
  glow, a left stripe and a badge with its icon; course dot + section on top; new / learning /
  review chip; "Answer" divider; cloze fills in place (the gap turns into a sage pill in the same
  sentence); list answers as big coloured bullets; big Again / Hard / Good / Easy buttons and a
  full-width "Show answer" bar; progress bar in the top row. The preview's sample notes include
  `Therapeutics IV/Bipolar.md` with one of each card type for trying it.
- Scratchpad (Nov 18, her ask: she knows the concept but not the lecture's exact words, and
  recalling out loud lags): "✎ Scratchpad" in the review top bar or Settings → Flashcard review
  (`settings.cardScratch`). On: a textarea under the question (focused), Show answer stays
  disabled until she writes something (Ctrl+Enter compares; "I don't know, show me" skips), then a
  "You wrote" box (box and textarea tinted with the card type's colour `--t`) sits above the answer with "rate the idea, not the wording". Not saved.
- List cards in review (Nov 18, her design on artifact "List Card Retry"): one numbered "?" per item
  and an "N items" pill; after Show answer each item is a button (or Shift + its number) to mark it
  missed. Any miss disables Good / Easy and suggests Hard (Again when over half were missed). The
  rating is graded as usual, then the card comes back RETRY_GAP (5) cards later (sooner when
  nothing else is left) as "↻ Retry · N missed": only the missed items hidden, the rest faded with
  "✓ you had this", and a Continue button (practice, no schedule change). Still-missed items come
  back again; once they're all got, "↻ Whole list again" asks everything and is a real rating, where
  Good needs a clean run. Session state only (`retries`, `retryNow`, `seen` in ReviewSession); a
  card waiting for a retry is kept out of the normal queue; Undo drops its retries. Works in cram.
  Lists of 6+ items go in two columns on wide cards (filled down, then across; `.litems.many`,
  container ≥ 760px). Shift + number marks items 1–9 (more than 9: click). A card taller than the
  space starts at the top of `.stage` and scrolls (flex + auto margins, not align-content: center,
  which cut tall cards off).
- Wired in: Cards tab badge, dashboard Flashcards card, Study Home card, course page "N to review",
  study plan suggestion "Review N flashcards" (block `href`), heatmap (+½ per review), streak
  (`markStudyDay("reviews")`).

## Study S4 (built): card library

- Library cards live in the synced store, not in notes: collection `cardItems` (one item = note type
  id + fields + course + tags), note types in collection `cardTypes` (seeded built-ins, u=1).
  Store `src/lib/stores/library.svelte.ts`; pure logic `src/lib/cardTypes.ts` (node-tested).
- Built-in types: Basic, Basic both ways, Cloze, Drug (generic/brand/class/indication/ADEs/
  counseling; templates brand→generic, generic→brand, generic→class, indication, ADEs, counseling,
  each only when its fields are filled), Image occlusion. Custom types: fields + card templates
  with `{{Field}}`, `{{#F}}…{{/F}}`, `{{^F}}`, `{{cloze:F}}`; renaming a field rewrites templates.
- Review keys: `fl:<itemId>:<template>`, cloze `:cN`, occlusion `:m<maskId>`. `allCards()` in the
  srs store returns note cards and library cards together; scope `library` is the library deck.
- Import (`ImportDialog.svelte`): CSV / TSV / Anki "Notes in plain text" export (auto separator,
  quotes, `#separator` / `#html` headers, HTML stripped), column → field mapping guessed from
  headers, course and tags for the batch.
- Image occlusion (`OcclusionEditor.svelte`, `OcclusionView.svelte`): paste or pick an image
  (saved to the notes folder `attachments/card-…`), draw boxes; one card per box, "hide all" or
  "hide one" mode. Card title is the Header field.
- Table cards in notes: a Markdown table with `:: table` on the line above makes one card per filled
  cell (row header + column header → cell), key `id:t<hash(row|col)>`, so drug comparison tables work.
  Since Nov 18 the table bar's "▾ Flashcards · N" menu (on / off = the `:: table` line) has options,
  saved as `"c"` in the table's mosaic-table line (`TableCardOpts` in cards.ts, table attr `copts`,
  defaults left out): `mode` cell (default; front "Row › Column") / row (one list card per row,
  `rows` field shown as Column / value pairs, key `:tr<hash(row)>`) / cloze (the row as a mini table
  with one cell hidden, `grid` field, key `:tc<hash>`); `dir` fwd / both / rev (cell mode; reverse
  "Which <key column>?" key `:t<hash>r`); `skip` columns; `key` column (default 0). Forward cell
  keys are unchanged, so old reviews keep their history. In the editor the key column is tinted,
  skipped columns fade and every card cell gets a small dot (decoration plugin). The count uses
  `tableCardInfo()` in BlockEditor (same rules as `tableCards()` in cards.ts).
- Exam-aware (Settings in Cards, default on): when a course has an exam coming, a review's due date
  is capped at the evening before it (if that is more than 1 h away). Course-level for now, so a
  Ther IV card counts for both Exam 4 and Exam 5; linking a deck to one exam is a possible later step.
- Cards page: exam readiness panel per upcoming exam (cards due before it, "Fit before exam" pulls
  everything into the window, Cram); cram (`#/study/cards/cram/<scope>`) reviews without changing
  FSRS state. Library at `#/study/cards/library[/<itemId>]` with type filter chips, quick add per type,
  search and course filter.

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

## Other decisions

- Streak: a day counts if she opened a lab or checked off a study block. Activity heatmap feeds it.
- Settings: name, labs folder, scan depth, exam keywords, sync folder and status exist; JSON
  export/import comes in Phase 6 (sync covers moving data between machines).

## Phases

1. Shell, design system, dashboard on sample data, launcher entry, install script. DONE
   (restyled once to the soft pastel look)
2. Recall Labs: folder dashboards, scanner + cache, in-app viewer, real progress on the dashboard. DONE
3. Local calendar (week, agenda, exams) and sync through the Drive folder. DONE
4. Tasks board and daily study plan with timer; activity heatmap. DONE (tasks as calendar
   entries were added just before it)
5. Courses and grades; Top 200/300 tracker. DONE as a first version; more course modules to come.
6. Settings, JSON backup, polish.

All Phase 1 sample data has been replaced; `src/lib/sample/data.ts` only holds the TONES list, and
`src/lib/sample/labs.ts` is preview data for running the UI in a plain browser.

## Commands

- `npm run tauri dev`: run with hot reload
- `npm run build` / `npm run check`: frontend build / type-check
- `npm run tauri build -- --no-bundle`: release binary at `src-tauri/target/release/studydesk`
- `./install.sh`: check packages (asks first), build, install into `~/.local`
