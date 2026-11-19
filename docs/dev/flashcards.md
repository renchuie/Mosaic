# Flashcards: syntax, review, decks, library, import, games

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

## Study S3 (built): flashcards in notes + FSRS review

- Syntax (`src/lib/cards.ts`, pure, node-tested): `Q :: A` basic, `Q ::: A` two cards (forward and
  reverse), `A <:: Q` reverse card (Nov 18: shows the right side, asks for the left; key `id:r`, so
  switching ⇄ ↔ ← keeps its history; typed as ` <- ` or ` <:: `, arrow attr `back`, click on the
  pill cycles → ⇄ ←), concept `Term ;; meaning` (Nov 18, her ask: `;;` is the concept, arrow attr
  `concept`; the older `**Term** ::: meaning`, a both-ways line whose whole left side is bold, still
  reads as a concept; same two keys as ⇄, kinds `concept` / `concept` + `rev`; the editor marks the
  term with a green chip `.b-concept` and a ◆ pill via the decoration plugin; `/Concept` in the menu;
  the ◆ and the descriptor's › are CSS-mask shapes (`--glyph`), not characters, so they sit centred),
  descriptor `Property ;;; value` (her ask Nov 18, was `;;`; kind `descriptor`, front "Concept › Property" with `concept` / `prop`
  fields; the concept is the nearest line it is indented under (a bold line counts), else the
  heading; `Property ;;;` with indented bullets = list answer; arrow attr `desc`, a lavender › pill, `/Descriptor`,
  the line isn't tinted like a card), `{{cloze}}` (each gap its own card; `{{c1::…}}` gaps hide together; `{{answer::hint}}`),
  `Question ::` with indented bullets below = list card. Nested list cards (Nov 18, her ask,
  RemNote-style; `listBack()`): an item that is a card of its own shows in its parent's answer as
  clean text (`front`, or `front: back`, no separator), and a nested LIST card's sub-items are left
  out of the parent (they are its own answer); its breadcrumb includes the parent (any line with lines
  indented under it counts as a parent, bulleted or not). Node test
  `tstest/test21.ts`. `Field ::` with nothing after it (the drug
  template) is not a card. Code blocks are skipped. Context = heading path + up to two parent bullets.
- Card syntax inside an inline `code` span is just text (`maskCode` in cards.ts; Nov 18: pasted
  instructions with `**X** ::: y` in backticks became cards). One card id, one line: the
  `cardIdRule` plugin in blocks.ts clears `sid` on empty lines and on a later line that repeats an
  id (Nov 18 bug: Tiptap's default split on a plain line copied the id onto new empty lines, which
  then showed the card's dot); dots only show on lines with text. Node test `tstest/test19.ts`.
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
  "You wrote" box (box and textarea tinted with the card type's colour `--t`) sits above the answer with just "Rate your response" ("Skipped" when she chose "I don't know"). Not saved.
- List cards in review (Nov 18, her design on artifact "List Card Retry"): one numbered "?" per item
  and an "N items" pill; after Show answer each item is a button (or Shift + its number) to mark it
  missed. Any miss disables Good / Easy and suggests Hard (Again when over half were missed). The
  rating is graded as usual, then the card comes back RETRY_GAP (5) cards later (sooner when
  nothing else is left) as "↻ Retry · N missed": only the missed items hidden, the rest faded with a
  sage ✓ in place of their number (no label, her Nov 18 "less words"), and a Continue button (practice, no schedule change). Still-missed items come
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

## Flashcards F1 (started Nov 19, her order: browser, decks + limits, stats, smarter reviews, .apkg)

- Browse (`src/routes/study/CardBrowser.svelte`, `#/study/cards/browse[?leech | ?scope=<scope>]`,
  rebuilt Nov 19 to the canvas board "Flashcards tab" → Browse): search box with plain words and
  filters (`deck:"Name"` `tag:x` `is:new|learning|due|paused|leech|flagged` `flag:rose` `course:x`;
  a deck page's scope shows as a chip in the box); left sidebar picks one per group (Decks from
  `deckGroups()`, State with coloured dots incl. "Keeps slipping", Flags, top tags); dark bulk bar
  (Move to deck… / Add tag: library cards only; Flag; Pause / Unpause; Reschedule… incl. Due now;
  Forget (make new) and Delete ask once); table Front · Deck · Type · Due · Interval · Missed,
  click a header to sort, Shift-click a checkbox to pick a range; the card on the right: title,
  flag, Pause, the library card's fields editable (Save appears when changed) or a note card's
  Front / Back with "Edit line" (`cardLine` / `saveCardLine`), Deck / Added / Reviews (remembered
  %) / Memory (stability) / Next, Due now / Forget / Not slipping, "Edit in <note> ↗". Flags:
  `FLAGS` (rose / butter / sage) in srs, synced collection `cardFlags` keyed by card key
  (`flagOf` / `setFlag`). srs helpers: `forget(key)`, `reschedule(key, ms)`.
- Add card (`src/routes/study/AddCard.svelte`, `#/study/cards/add[?deck=<id>]`, board "Add card";
  the rail's + → Flashcard, home's Add card / A, a deck row's ＋ and a deck page's Add card all
  open it): type chips (library types; Image occlusion opens OcclusionEditor; "My types" opens
  TypeDialog), Deck and Course pickers (a deck with one course fills the course), one box per
  field with a format bar on the focused one (B, I, ==, { } cloze with the next cN, x²; Ctrl+B /
  Ctrl+I / Ctrl+Shift+C), a keep pin per field and for tags (pinned ones stay filled after Add),
  tag chips, Add (Ctrl+Enter) / Done / Esc; a live preview drawn like review, a duplicate check
  (the first field equals an existing card's front), "Added just now". Last type / deck / course /
  pins per machine in localStorage "mosaic.addCard". A library item added to a deck carries
  `FlashItem.deck`; that deck and its parents include it whatever their rules (`ownMatcher`).
- Decks (store `src/lib/stores/decks.svelte.ts`, synced collection `decks`; editor
  `src/routes/study/DeckEditor.svelte`; Cards page "Decks" → New deck, click a name to edit): a
  deck is a saved filter, so decks overlap (like Anki's filtered decks) and the course / note /
  library lists stay as automatic decks. Rules: courses, folders + single notes + card library
  ("where"), tags, an exam (`examWindow`: that course's notes dated after its previous exam, up to
  the exam; undated notes count). Each kind that is set must match; inside a kind any entry. Scope
  `{kind: "deck", id}`, routes `#/study/cards/review/deck:<id>` and `cram/deck:<id>`; the card
  browser's source menu lists decks. Limits: deck `newPerDay` / `reviewsPerDay` (unset = default)
  on top of the global new-cards allowance and `settings.reviewsPerDay` (Settings → Flashcards,
  blank = none); learning cards are never held back. `limitsLeft(scope)` in srs; `counts()` gives
  `due` after limits and `held` for reviews over the limit. Per-deck "today" counts come from the
  cards themselves: `born` (stamped on a card's first rating since Nov 19) today = new today,
  `last_review` today otherwise = reviewed today (cards, not ratings).
- Stats (`src/routes/study/CardStats.svelte`, `#/study/cards/stats`, rebuilt Nov 19 to the board
  "Study modes and stats" → Stats tab): deck chips (All decks + the first 6 of My decks / From
  your notes) and Week / Month / Term (from mid-Aug or mid-Jan) / Year; tiles Studied (cards,
  time), Remembered vs the goal (retention setting), Streak + best, Cards you know well (≥ 21 d);
  "Every day you studied" heatmap (26 weeks × 7, sage levels, hover = cards · minutes); "Where
  your cards are" donut (New, Learning, Young, Known well, Paused); "Remembered, by week" (10
  weeks, SVG line, dashed goal line, its scale follows her numbers); Next 30 days (BarChart, the
  exam day a soft rose column via `mark`); "How far apart" (intervals; the board's "When you
  remember best" needs review times, which aren't logged); Hardest cards (missed N of reps) with
  "Review these N now" = cram of `filter:hard` (lapses ≥ 2). Day counts (`reviewDays`) exist only
  for all cards together, so heatmap / studied / remembered show every deck; the card-based parts
  follow the deck chip. BarChart: stacked columns, hover tooltip, one dashed gridline. Preview
  hook `window.__synced` {put, get, keys} seeds records (nothing is saved there).
- Smarter reviews: **siblings** (`siblingGroup`: same note line, or same library item; table
  cells never) are buried like Anki: one card per group a day (a group reviewed today or with a
  card in learning holds back its other new / review cards). `plan()` in srs does limits + burying
  once and both `counts()` (now also `buried`, `leeches`) and `queue()` use it, so counts match the
  session. `settings.burySiblings` (default on, Settings → Flashcards "Siblings"). **Leeches**:
  `grade()` returns true when a rating makes `lapses` reach `settings.leechAt` (default `LEECH_AT`
  8, 0 = off) or every half of it after (8, 12, 16…); the record gets `leech: true` (kept by
  `fromF`, cleared by Forget or "Not a leech" / `clearLeech`) and is suspended too when
  `settings.leechAction` is "suspend". Review shows a rose bar (Suspend / Unsuspend, Open note, ×)
  and a Leech chip; the Cards hero links "N leeches" to `#/study/cards/browse?leech` (browser
  status "Leeches"). **In review**: E edits the card's line in place (`cardLine` hides the indent
  and list marker, `saveCardLine` puts them back; Enter saves, Esc cancels; the card is read again
  after saving), S suspends. The session waits for the notes to load before building its queue (a
  review opened straight from a link at start-up used to come up empty).
- Anki import (`.apkg` / `.colpkg`, Library → Import, same dialog as CSV): Rust
  `src-tauri/src/anki.rs` `anki_read` (raw IPC body = the package; crates `zip`, `ruzstd`, `rusqlite`
  bundled + collation, no system packages) unzips, unzstds `collection.anki21b` (else plain
  `.anki21` / `.anki2`), opens it in a temp file with Anki's `unicase` collation, and returns note
  types (newest schema: `notetypes` / `fields` / `templates` tables, settings read with a tiny
  protobuf reader; older: `col.models` JSON), decks, notes, cards, revlog, `crt`. Media (index:
  zstd protobuf or JSON) are copied to `<notes>/attachments/anki/`, never over a different file
  (numbered copy). `MOSAIC_APKG=<file> cargo test anki` reads a real package (none in the repo:
  her decks are personal) and writes its JSON beside it. `src/lib/anki.ts` (pure, node test
  scratchpad `tstest/t70.ts`): `mapType` → built-in basic / reverse / cloze / occlusion when the
  shape matches, else a card type of its own (`t<ord>` templates; reused on re-import by name +
  fields); `templateText` drops scripts, styles, comments, hidden elements (her Basic template
  carries a brand-name add-on script), `{{FrontSide}}` + `<hr id=answer>`, field filters (cloze
  kept) and special fields; `fieldText` = HTML → library text with entities decoded and image
  paths mapped; `occlusionMasks` reads Anki IO shapes (fractions, like ours; extra shapes of one
  cN become `n-2`…); `schedule` keeps Anki's due / interval / reps / lapses / suspended, FSRS
  memory from the card's `data` {s, d} when Anki ran FSRS, else stability = interval and
  difficulty from ease; `plan` adds revlog to `reviewDays` (types 0–3). Store `importAnki` in the
  library store: items carry `anki` (note guid) so a second import updates text and tags only
  (schedule and history untouched, `known` skips their revlog); deck tag = the Anki deck's last
  part; "Make a deck" creates a Mosaic deck (library + that tag) named by the last two parts;
  course guessed from the deck path. Preview-only hook `window.__ankiRead` stands in for the Rust
  read. Tested in the real app (Xvfb): 66 notes, 10 schedules, 3 review days, 1 deck.
- Flashcards home + deck pages, built to her canvas board "Flashcards tab: A + C" (`FlashAC.dc.html`
  on the design canvas; Nov 19 she pointed out the first build didn't match it: build FROM the
  board, not from notes about it). The Study tab is called **Flashcards**, and on flashcard pages
  StudyNav shows **Decks / Browse / Stats** on the right. Home (`CardsView.svelte`): hero "N due
  today", New / Learning / To review + "~N min at your pace" (`pace()` in srs: seconds per review
  over 30 days), dark "Study everything" (Space); the deck list (`DeckRows.svelte`, model in
  `src/lib/stores/deckTree.svelte.ts`): columns New / Learn / Due, groups **My decks** (her decks,
  nested via `Deck.parent`, + the card library), **From your notes** (one row per course =
  scope `notes:<course>`, opening to its notes; pill = the course's next exam or "N notes"),
  **Filtered** (scope `filter:missed` "Missed this week" = lapsed and seen in the last 7 days,
  `filter:leech` "Keeps slipping" when any); ▸ / ▾ (open rows in localStorage "mosaic.deckOpen"),
  icon tile tinted by course, exam pill "Exam 5 · 16 d" (`examOf`, `shortExam`), hover Study / ＋ /
  ⚙; footer Add card (A) / Create deck / Import. Side: Exams (ring = `readiness()`: seen and due
  again by the evening before the exam, of all), Next 7 days, Today (studied, remembered).
  Deck page (`DeckPage.svelte`, `#/study/cards/deck/<scope>`): the deck tree on the left (hidden
  under 820px), breadcrumb, icon + title + "N cards · course · linked to Exam N", Options /
  Add card (a parent: Options / Sub-deck), boxes New ("of N waiting") / Learning ("back in N min")
  / To review ("~N min") + dark Study now (Space), "Study a different way" chips (Cram [before
  Exam N], Only cards I missed = `filter:missed|<scope>`, Review ahead 2 days = `filter:ahead|<scope>`,
  Type the answers, Practice test, Match game), sub-decks in the home's rows, Cards table (Front /
  Back / Type / State / Next, search, Open in Browse); side: exam ring (+ "Fit N before the exam"),
  Next 7 days, Options. Sub-decks: `Deck.parent`; a parent's matcher includes its sub-decks
  (`deckMatcher(d, id)`), a deck with no rules is a folder; DeckEditor has "Inside"; deleting a
  deck moves its sub-decks up. Scopes: `scopeKey` / `parseScope` / `scopeName` in srs (all |
  library | deck:<id> | course:<name> | note:<rel>[#a › b] | notes:<course> | filter:<id>[|<scope>]);
  the router already decodes, so don't decode again.
- Games (practice only, never the schedule; `PlayView.svelte`, `#/study/cards/play/<type|test|match>/<scope>`,
  fills the panel like Review; mode chips switch between them; `src/lib/play.ts` pure, node test
  scratchpad `tstest/t71.ts`): `answerOf` (cloze = just the gap: back minus what the front shows;
  lists / tables-as-rows / images can't be played), **Type it** (20 a round; `check`: short answers
  whole with typos allowed, long ones by key words, words in brackets optional, the main clause
  before the first ; or . is enough; Almost / Not quite + "I was right"; found words highlighted),
  **Test** (4 options, keys 1–4; `distractors` = other answers in the deck, closest length and same
  kind first), **Match** (6 pairs as 12 tiles, shorter answers preferred, +1 s per wrong pair, best
  time per deck in synced collection `games` key `match:<scope>`). A miss comes back once at the end;
  the end screen lists them. Finishing marks a study day (`markStudyDay("reviews")`), no review counts.

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
- A table row is never a card line (Nov 18 bug: `A :: B` typed in a cell made the row a card and its
  `<!--sd-->` id became an extra column): `kindOf` in cards.ts skips `|` lines, the arrow input rule
  doesn't fire in cells, and `splitRow` / the table parser in mdDoc.ts drop a stray trailing id and a
  last column that only held ids (repair; node test scratchpad `tstest/test18.ts`).
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
