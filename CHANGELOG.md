# Mosaic changelog

What's new in Mosaic, newest first. Each release lists what was **added**, **changed**,
**fixed** and **removed**.

---

## November 18, 2026

### Added
- **Flashcards home.**
  - **Hero:** what's due today, split into new / learning / to review, an estimate of how
    long it will take, and a **Study everything** button (Space).
  - **Deck list:** New / Learn / Due columns, grouped into **My decks** (with sub-decks and
    the card library), **From your notes** (one row per course, opening to its notes) and
    **Filtered** decks.
  - **Rows:** exam countdown pills, and quick Study / Add / Options buttons on hover.
  - **Side column:** exam readiness, the next 7 days, and today's study.
- **Deck pages.**
  - **Navigation:** a deck tree for hopping between decks, and a breadcrumb.
  - **Study:** new / learning / to review at a glance, and a big **Study now** button.
  - **"Study a different way":** cram before an exam, only cards you missed, review ahead,
    and practice games.
  - **The deck's cards** in a table, plus exam readiness, forecast and options.
- **Sub-decks.** A deck can sit inside another, and a parent includes its sub-decks' cards.
- **Decks with daily limits.** Save a deck from any mix of courses, folders, notes, tags or
  an exam, each with its own new-card and review limits. There's also an overall
  **Reviews a day** setting.
- **Add card page.**
  - Card type chips, and Deck and Course pickers that remember your last choice.
  - A format bar (bold, italic, highlight, cloze, superscript), and **keep** pins to carry
    fields over to the next card.
  - Ctrl+Enter to add, a live preview, a duplicate check, and a list of cards just added.
- **Browse.** Every card in one table.
  - **Filter:** a sidebar to filter by deck, state, flag and tag, and search with filters
    (`deck:` `tag:` `is:due` `flag:` `course:`).
  - **Bulk actions:** move, tag, flag, pause, reschedule, reset or delete the selected cards.
    Shift-click selects a range, and column headers sort.
  - **One card:** edit it in a panel on the right.
- **Card flags**: rose, butter and sage.
- **Stats page.**
  - Filter by deck, and by week, month, term or year.
  - Tiles: cards studied, % remembered against your goal, streak (current and best), cards
    you know well.
  - Charts: a study-days heatmap, a breakdown of where your cards are, % remembered by week,
    the next 30 days with exams marked, and how far apart your reviews are.
  - Your hardest cards, one click from a review.
- **Practice games** that never change your schedule:
  - **Type it** forgives typos and checks key words in long answers.
  - **Test** is multiple choice built from the deck's other answers.
  - **Match** pairs cards against the clock and saves your best time.
- **Smarter reviews.**
  - **Siblings:** cards from the same line (both sides of a two-way card, clozes on one line)
    aren't shown on the same day.
  - **Leeches:** cards you keep forgetting get flagged or paused.
  - **Shortcuts:** press **E** to edit a card and **S** to suspend it during review.
- **Anki import (.apkg)**: note types, cards, images and review history come straight in.
  - Hidden template code is stripped.
  - Importing the same deck again updates it instead of duplicating it.
- **Backups.**
  - Daily, to this computer and to your synced folder, keeping the last 14.
  - "Back up now".
  - Restore with a preview of what comes back, after first taking a safety copy.
  - Pasted images are backed up too.
- **Version history for every note**: a version every 10 minutes of editing, a view of what
  changed, and restore.
- **Trash**: deleted notes go to an in-app trash and can be restored to the folder they came
  from. Emptied after 30 days.
- **Storage choices**: keep your files in Google Drive, Dropbox, OneDrive, iCloud Drive, any
  folder, or on this computer only.
- **A clear banner** when your notes folder isn't connected, with nothing lost.
- **Conflict copies**: when a note is changed on two computers at once, both versions are
  kept.
- **Icon picker**: clean line icons in colours, plus every emoji, for notes, folders,
  courses and tags.
- **Redesigned Settings**: groups in a side list, one at a time, with search.
- **Note defaults** in Settings: header style, page width, open as page or Markdown, toolbar
  behaviour.
- **Managing notes.**
  - Right-click menus for notes and folders (open, rename, move, delete, new note here, icon
    and colour).
  - Drag and drop to move notes and folders.
- **Importing notes**: bring in .md files with a button or by dropping them in. Pasted
  Mosaic Markdown keeps its formatting exactly.
- **Guided notes.**
  - Blanks that become flashcards once filled in.
  - Tab / Alt+↓ jumps between gaps.
  - Review just one section from its heading.
- **Checklists in callouts**, with a count of what's left to check.
- **Split notes**: halves that scroll on their own, or one above the other.
- **A note-formatting guide** you can give an AI assistant, so the notes it writes for you
  use every Mosaic feature.
- **Nested list cards**: a parent card asks for its items, and each item can be its own card.
- **New app icon.**
- **Writing mode** shortcut: Ctrl+Shift+F.

### Changed
- **Concept and descriptor cards** are now written `Term ;; meaning` and `Property ;;; value`.
- **Shorter, clearer wording** across the whole app.
- **Faster.**
  - Saving and moving files no longer freezes the window.
  - Deleting is instant.
  - Scrolling is smoother.
- **The table toolbar** floats right above the cell you're editing.
- **Split notes** move smoothly between their halves instead of fighting the page scroll.
- **Review** uses fewer words.
- **Buttons** use line icons instead of emoji.

### Fixed
- **Tables**
  - Table menus stay on screen and close when you click elsewhere.
  - A blank line above a table no longer breaks it.
- **Cards**
  - Pressing Enter on a card line no longer copies the card onto the new line.
  - Card syntax inside `code` is just text.
  - An unfinished concept card is no longer a card.
  - No double space after a card arrow.
- **Moving notes:** a note moved into a folder and straight back out is no longer duplicated.
- **Blanks**
  - `{{_____}}` blanks save correctly.
  - Clicking a blank selects it.
- **Menus:** the course and ⋯ menus in the note header close when you click outside.
- **Ctrl+A:** works in a note that starts with a toggle heading.
- **Small layout fixes:** fold buttons, card pills, long callout titles and split notes.
- **Card context:** cards keep the right heading after splits and columns.
- **Folder icons** display correctly in the notes list.
- **A missing notes folder** is reported, never silently replaced with an empty one.

### Removed
- **Guided notes:** the "gaps left" counters and hints in empty items. They made notes
  busier.
- **The settings box on the flashcards page.** It's in Settings → Flashcards.
- **The flat "All cards" list.** It's replaced by Browse.

---

## November 17, 2026

### Added
- **15 themes**: Glass (Mosaic, Pink, Green, Blue, Purple), Neutral (Linen, Stone, Oat,
  Plain, Default) and Dark (Catppuccin, Tokyo Night, Rosé Pine, Gruvbox, Everforest), with
  live previews.
- **Window styles**: Curve (borderless, like a native app), Glass rail, and Floating.
- **Each theme has its own six highlighter colours.**
- **The note page as one clean sheet.**
  - A compact or full header.
  - Readable / Wide / Full page widths.
  - **Writing mode** to hide everything but the note.
- **Columns**: drag a block beside another, resize, add a divider line.
- **Side by side**: two pages in one note.
- **Toggle headings**: headings that fold their section away, from the slash menu.
- **Folding**: headings and callouts fold.
- **Card status dots** on every card line: due, learning, new, known well.
- **Print or save a note as PDF.**
- **Picking up where you left off**: Notes reopens your last note at the same spot.
- **Reverse flashcards (←).**
- **Concept and descriptor cards.**
- **Table flashcard options**: a card per cell, per row, or cloze rows; card directions;
  skipped columns.
- **Redesigned review cards.**
  - Big, calm text.
  - Each card type has its own colour and badge.
  - The card is centred between fixed bars, with left or centred text.
- **List cards in review**: mark the items you missed, retry just those, then the whole
  list.
- **Scratchpad**: write your answer before the card turns over.
- **Pictures in tables and lists**: pasted pictures fit table cells and line up in lists.
- **Pasting into tables and columns** keeps their layout.
- **Ctrl+A** selects outward one step at a time (cell → column → row → table → note).

### Changed
- **Glass themes** are cleaner: frosted white with soft colour blooms.
- **Neutral themes** got their own palettes.
- **Study tabs** are a slim strip on every Study page.
- **Notes home** matches the inside of a note.
- **Linked references** fold into one quiet line.
- **Flashcard backgrounds** line up with callouts and tables.
- **Tables work like Google Docs**: equal column widths, "Even out", and one outline around
  the selected cells.
- **The sidebar logo** follows your theme's colours.

### Fixed
- **Contrast:** fixes across every page in every theme.
- **Typing `---`** makes a divider again.
- **Clicking into a #tag** no longer opens the tag menu.
- **Card syntax in a table cell** no longer breaks the table, and damaged tables repair
  themselves.
- **Printing** leaves out buttons and hints, and long callout titles wrap.

### Removed
- **The streak badge and settings icon on the sidebar.** Your avatar opens a menu with
  Settings and Appearance.
- **The attachments folder** is hidden from folder lists.

---

## November 16, 2026: first release

### Added
- **Dashboard** and installer.
- **Interactive study labs** with folder dashboards and progress tracking.
- **Calendar**: event cards, tags, repeat rules, and Day / Week / Month / List / Exams views.
- **Sync** between computers through a synced folder.
- **Tasks**:
  - tasks as calendar entries
  - a list view and a board
  - a daily study plan with a timer
  - an activity heatmap
- **Courses**: grades with weighted categories, the score you need on the rest, what-if
  scores, GPA, and a drug quiz tracker.
- **Study**:
  - notes as Markdown files
  - flashcards written right in your notes
  - reviews with FSRS spaced repetition
- **Card library**:
  - card types, including Drug cards
  - CSV and Anki text import
  - image occlusion
  - exam-aware scheduling and cram mode
- **PDF viewer**: highlights, boxes, pen and sticky notes saved into the PDF itself, linked
  to notes and cards.
- **Materials**: upload study labs, plus the Mosaic quiz format with a quiz player.
- **The note page**: a block editor that feels like Notion while your files stay plain
  Markdown.
  - Slash menu, [[links]], #tags, and callouts.
  - Cloze cards.
- **Block styles**: make your own callout types and quote style.
- **Highlight colours and palettes.**
- **Better tables**: column widths, lists in cells, cell colours.
- **The frosted glass look**: a floating sidebar, roomy spacing, folder tiles, a Study Home
  dashboard and springy animations.

### Changed
- **Named Mosaic**: "your student life in full view".
- **A soft pastel design**, with the Atkinson Hyperlegible Next font.

### Fixed
- **Leaving a note** right after typing no longer loses your last edit.
