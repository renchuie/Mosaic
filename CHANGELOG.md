# Mosaic changelog

What changed in Mosaic, day by day, in plain words. Newest first. Each day lists what was
**added**, **changed**, **fixed** and **removed**.

---

## November 18, 2026

### Added
- **Flashcards home, rebuilt to the "A + C" mockup.** The Study tab's Cards became
  **Flashcards**, with Decks / Browse / Stats on the right of the top bar.
  - Hero: "N due today", new / learning / to review, "~N min at your pace", and a dark
    **Study everything** button (Space).
  - Deck list with New / Learn / Due columns, grouped into **My decks** (with sub-decks and
    the card library), **From your notes** (one row per course, opening to its notes) and
    **Filtered** (Missed this week, Keeps slipping).
  - Icon tiles, exam pills ("Exam 5 · 16 d"), and Study / ＋ / ⚙ when you hover a row.
  - Side column: exam readiness ring, next 7 days, and today's study.
- **Deck pages.**
  - Layout: a deck tree on the left, a breadcrumb, New / Learning / To review boxes and a
    dark **Study now** box.
  - "Study a different way": cram before the exam, only cards I missed, review ahead 2 days,
    and the three games.
  - The deck's cards in a table, plus its exam ring, forecast and options.
- **Sub-decks.** A deck can sit inside another, and the parent includes its sub-decks' cards.
- **Decks with daily limits.** Saved card filters by course, folder, note, tag or exam, each
  with its own new-cards and reviews per day. Also an overall **Reviews a day** setting.
- **Add card page**, fast like Anki's Add window:
  - type chips, and Deck and Course pickers that remember your last choice
  - a format bar (bold, italic, highlight, cloze, superscript), and **keep** pins for fields
    and tags
  - Ctrl+Enter to add, a live preview drawn like review, a duplicate check, and "Added just
    now"
- **Browse** (every card in one place):
  - **Finding cards:** a sidebar to filter by deck, state, flag and tag, and a search box that
    takes plain words or filters (`deck:` `tag:` `is:due` `flag:` `course:`).
  - **Acting on many at once:** a dark bar to move, tag, flag, pause, reschedule, forget or
    delete the selected cards. Shift-click selects a range, and column headers sort.
  - **One card:** an editor on the right, where you can also flag and pause it.
- **Flags** for cards: rose, butter, sage.
- **Stats page.**
  - Deck chips, plus Week / Month / Term / Year.
  - Tiles: studied, remembered vs. your goal, streak and best streak, cards known well.
  - Charts: a study-days heatmap, a donut of where your cards are, remembered by week with
    the goal line, the next 30 days with the exam marked, and how far apart your reviews are.
  - Hardest cards, with "Review these now".
- **Practice games** that never change your schedule:
  - **Type it:** forgiving, and checks key words for long answers.
  - **Test:** multiple choice.
  - **Match:** against the clock, with your best time saved.
- **Smarter reviews.**
  - Cards from the same line (both sides of ⇄, clozes on one line) aren't shown on the same
    day.
  - **Leeches** (cards forgotten 8 times) get flagged or suspended, with a pink bar in review.
  - Press **E** to edit a card and **S** to suspend it during review.
- **Anki import (.apkg)**: note types, cards, images and review history come into the card
  library.
  - Your add-on scripts are stripped from the cards.
  - Importing the same deck again updates it instead of duplicating it.
  - It can make a matching deck, and it guesses the course.
- **Backups.**
  - Once a day to this computer AND Google Drive, keeping 14.
  - "Back up now".
  - Restore with a preview of what comes back, after first taking a safety copy.
  - Pasted images are backed up too.
- **Version history for every note**: a version every 10 minutes of editing, a view of what
  changed, and restore.
- **Trash in the app**: deleted notes can be restored to the folder they came from. Emptied
  after 30 days.
- **Any synced folder**: Google Drive, Dropbox, OneDrive, iCloud Drive or any folder, plus the
  local "This computer only" vault.
- **A calm banner** when the notes folder isn't connected, instead of an error.
- **Conflict copies.** When a note changes on both computers, both versions are kept.
- **One icon picker**: clean line icons in colours first, every emoji second. Used for notes,
  folders, courses and tags.
- **Settings page redesign**: a side list of groups, one group at a time, and search.
- **Note defaults** in Settings: header style, page width, open as page or Markdown, toolbar.
- **Local vault option** ("This computer only") for anyone who doesn't want to sync.
- **Notes management.**
  - Right-click menus for notes and folders (open, rename, move, delete, new note here, icon
    and colour).
  - Drag and drop to move notes and folders.
- **Importing notes**: .md files from a button or by dropping them on Notes home. Pasting
  Mosaic Markdown keeps it exactly as written.
- **Guided notes.**
  - Blanks to fill in, which become flashcards once filled.
  - Tab / Alt+↓ jumps between gaps.
  - "Review" on a heading reviews just that section.
- **Callout checklists**: callouts count their checkboxes ("3 to check" / "✓ all checked").
- **Split notes.** One view where each half scrolls on its own and one stacked view, picked
  from a menu.
- **Claude notes guide**: a copy-ready formatting guide for making notes with Claude.
  - Covers split notes and the "Disease | Drugs" layout.
  - Ends with a list of what Mosaic can and can't do, and a brainstorm prompt.
- **Nested list cards**: a parent card asks for its items, and each item for its own
  sub-items.
- **New app icon**: the Mosaic M.
- **Writing mode** also on Ctrl+Shift+F.

### Changed
- **Concept and descriptor cards** are now written `Term ;; meaning` and `Property ;;; value`.
- **Shorter, calmer wording everywhere**: about 100 labels, hints, empty states and messages
  were cut down so the app doesn't over-explain.
- **Faster app.**
  - Disk work no longer freezes the window.
  - Deleting is instant.
  - No blur over scrolling content, so scrolling is smoother.
- **The table toolbar** floats right above the cell you're in, glides between cells and stays
  on screen.
- **Split notes** glide between resting places instead of fighting the page scroll.
- **Review** uses fewer words: a ✓ for list items you got, and "Rate your response".
- **Palette and pin buttons** use line icons instead of emoji.

### Fixed
- **Tables**
  - The Flashcards popup no longer scrolls or overflows, and opens upward when there's no room
    below.
  - A blank line above a table no longer breaks it.
- **Cards**
  - Enter no longer copies a card's id onto new lines.
  - Card syntax inside `code` is just text.
  - An unfilled concept is no longer a card.
  - No double space after an arrow.
- **Moving notes:** a note moved into a folder and straight back out is no longer duplicated.
- **Underscores:** `{{_____}}` no longer saves as `{{**_**}}`.
- **The note header:** the course list and ⋯ menu close when you click outside them.
- **Ctrl+A:** works in a note that starts with a toggle heading.
- **Folding:** no fold button on an empty heading.
- **Concept and descriptor pills:** the ◆ and › sit centred in them.
- **Blanks:** clicking a blank selects it (it didn't in the app's browser engine).
- **Callout titles:** long ones wrap.
- **Split notes:** a split in the middle of a note is only as tall as its halves, and blocks
  after a split stop sliding over it.
- **Icons:** folder icons in the notes list show the icon, not its code. A line icon sits
  centred in the top bar.
- **Card context:** cards keep the right heading after splits and columns.
- **Drive folder:** a vanished notes folder is no longer silently re-made empty.

### Removed
- **Guided notes:** the "N left" counters and the "2 of 7" / column-name hints in empty items
  and cells.
- **The Cards page settings box:** it lives in Settings → Flashcards.
- **The old flat "All cards" list:** replaced by Browse.

---

## November 17, 2026

### Added
- **15 themes**: 5 Glass (Mosaic, Pink, Green, Blue, Purple), 5 Neutral (Linen, Stone, Oat,
  Plain, Default), 5 Dark (Catppuccin, Tokyo Night, Rosé Pine, Gruvbox, Everforest), with live
  previews.
- **Window frames**: Curve (default, borderless like a native app), Glass rail, Floating.
- **Each theme has its own six highlighters.**
- **The note page as one sheet.**
  - Compact or Full header.
  - Page width: Readable / Wide / Full.
  - **Writing mode**, which hides everything but the note.
- **Column blocks** like Notion: drag a block beside another, resize, optional divider line,
  and a newspaper layout.
- **Side by side**: two pages in one note, in Full width.
- **Toggle headings**: headings that hold their section, using /thead1 /thead2 /thead3.
- **Folding**: headings and callouts fold.
- **Card status dots** on every card line (due, learning, new, known well).
- **Print or save a note as PDF.**
- **Picking up where you left off**: the Notes tab reopens the last note at the same scroll
  position.
- **Reverse flashcards (←).**
- **Concept and descriptor cards** (RemNote style).
- **Table flashcard options**: each cell, each row, or cloze rows; directions; skipped columns.
- **Big, beautiful review cards.**
  - Each card type has its own colour and badge.
  - Calm text sizes, with the card centred between fixed bars.
  - Left or centred text.
- **List cards in review**: a ? per item, mark the ones you missed, retry those, then the
  whole list.
- **Scratchpad**: write your answer before the card turns over.
- **Pictures in tables and lists**: pasted pictures fit table cells and line up in lists.
- **Pasting into tables and columns** keeps the layout.
- **Ctrl+A** grows outward one step at a time (cell → column → row → table → note).
- **Plan for sharing Mosaic** with friends on Windows next semester.

### Changed
- **Glass themes** were made clean like the mockup (frosted white with colour blooms, no dark
  blocks).
- **Linen, Stone and Oat** got their own palettes and soft blooms.
- **Study tabs** are a slim strip on the glass on every Study page.
- **Notes home** uses the same top bar and notes column as inside a note.
- **Linked references** fold into one quiet line.
- **Flashcard tints** line up with callouts and tables.
- **Tables work like Google Docs**: equal column widths, "Even out", and one outline around
  the selected cells.
- **The rail logo** follows the theme's colours.

### Fixed
- **Contrast:** fixes across every page in all 15 themes.
- **Typing `---`** makes a divider again.
- **Clicking into a #tag** no longer opens the tag menu.
- **`::` in a table cell** no longer turns the row into a card, and damaged tables repair
  themselves.
- **Printing** leaves out buttons, caret and hints, and callout titles wrap.

### Removed
- **The streak badge and settings icon on the rail.** The avatar opens a menu with Settings
  and Appearance instead.
- **The attachments folder** is hidden in the app.
- **Fewer "Notes" labels.**
- **An unused block style.**

---

## November 16, 2026: the first day

### Added
- **The app itself**: shell, design system, dashboard and installer.
- **Recall Labs**: folder dashboards, with real progress on the dashboard.
- **Calendar**: card events, tags, repeat rules, and Day / Week / Month / List / Exams views.
- **Sync** between PC and laptop through the Google Drive folder.
- **Tasks**:
  - tasks as calendar entries
  - a list and a board
  - a daily study plan with a timer
  - an activity heatmap
- **Courses as the hub**: grades with weighted categories, "need X% on the rest", what-if,
  GPA, and the Top 200/300 drug quiz tracker.
- **Study tab**: notes as Markdown files, flashcards written in notes, reviewed with FSRS
  spaced repetition.
- **Card library**:
  - card types, including Drug cards
  - CSV and Anki text import
  - image occlusion
  - exam-aware scheduling and cram
- **PDF viewer** with highlights, boxes, pen and sticky notes saved into the PDF itself,
  linked to notes and cards.
- **Materials**: Recall Labs moved in, with uploads, and the **Mosaic quiz format** with its
  quiz player.
- **The Mosaic note page**: a block editor like Notion while files stay Markdown.
  - Slash menu, [[links]], #tags, and callouts.
  - Cloze pairing.
- **Block styles**: your own callout types and quote style.
- **Highlight colours and palettes.**
- **Table upgrades**: column widths, lists in cells, cell colours.
- **The frosted glass look**: floating rail, roomier spacing, folder tiles, Study Home
  dashboard, spring animations.
- **Plans**: VISION.md, the week-by-week roadmap to v1.0 (Dec 31), and the GPL licence.

### Changed
- **Renamed to Mosaic**: "your student life in full view". The internal name stays
  `studydesk`.
- **Restyled** from neo-brutalism to a soft, fluid pastel look.
- **New font**: Atkinson Hyperlegible Next.
- **The calendar was redesigned** after feedback: cards and tags instead of a plain grid.
- **Tasks got more pizzazz**, after mobile task-app references.

### Fixed
- **Leaving a note** within a moment of typing no longer loses the last edit.
- **The list-card icon** points right, then down. The cloze group badge is centred.
