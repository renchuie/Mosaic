# Mosaic notes: formatting guide for Claude

Paste everything below the line into your notes prompt (or into a Claude Project's instructions).
Edit the parts in [square brackets] to fit you. To bring Claude's note into Mosaic, download the .md
file and use Notes → Import (or drop the file on the Notes home); pasting works too.

---

## Output format: a Mosaic note

Write the notes as ONE Mosaic note: a Markdown file. Output only the file, starting with the `---`
front matter, with nothing before or after it, and no ``` fences around the whole thing. Mosaic
shows the Markdown as a styled page and turns certain lines into flashcards, so use exactly the
syntax below. Anything else is plain Markdown.

### Front matter (first lines of the file)

```
---
course: Therapeutics IV
tags: [lecture, heart-failure]
date: 2026-11-18
icon: 🫀
---
```

- `course` must be written exactly as one of: [Therapeutics IV, Pharmacy Law, Clinical
  Pharmacogenetics, Advanced Pharmacy Practice, Clinical Applications, Top 200/300 drugs].
- `tags`: 1 to 4 short lowercase tags, joined with dashes.
- `icon`: one emoji that fits the topic (optional).
- Do NOT start the body with a `# Title`; the file name is the title.

### Structure

- Sections: `##` for main topics, `###` for subtopics. Use `#` only if the note needs a top level.
- Toggle sections (fold away, good for long detail like "Mechanism in depth" or "Practice
  questions"): put the heading and everything under it between these two lines, each with a blank
  line around it:

  ```
  <!--mosaic-toggle-->

  ### Mechanism in depth

  ...content...

  <!--/mosaic-toggle-->
  ```

  Add `closed` to start it folded: `<!--mosaic-toggle closed-->`. They can be nested.
- A line with `---` (blank lines around it) is a divider; it also ends a foldable section.
- Lists: `-` bullets, `1.` numbered, `- [ ]` checklist. Indent sub-points by 2 spaces (3 under a
  numbered item).
- Links to other notes: `[[Heart failure]]`. Tags in the text: `#exam5`.

### Callouts

Coloured boxes. The first line is `> [!kind] Title`; every following line of the box starts with
`> `. Use these kinds:

| kind | for |
|---|---|
| `exam` | what will be tested, professor emphasis |
| `tip` | memory tricks, mnemonics |
| `warning` | black box warnings, dangerous interactions, contraindications |
| `info` | background, context |
| `example` | patient cases, worked calculations |
| `question` | questions to think about |
| `success` | key takeaways (shows as "Key point") |
| `note` | anything else |

```
> [!warning] Black box warning
> Avoid in patients with ...
```

Add `-` after the kind to start it folded: `> [!example]- Patient case`.
Do NOT put flashcards inside callouts; they don't become cards there.

### Highlights

- `==text==` for a yellow highlight.
- Other colours: `<mark class="rose">text</mark>` (also `sage`, `peach`, `lavender`, `blue`).
- Meaning: [yellow = key fact, rose = must memorise / exam, sage = mechanism, lavender = drug
  names]. Highlight sparingly, a few words at a time, never whole paragraphs.

### Tables

Use normal Markdown tables for comparisons (drug classes, side effects, dosing). In a cell, put
several points on separate lines joined with `<br>`, for example `- bradycardia<br>- fatigue`.

### Columns (optional)

Two short things side by side, for example "Pros / Cons" or "Systolic / Diastolic":

```
<!--mosaic-cols-->

left side

<!--mosaic-col-->

right side

<!--/mosaic-cols-->
```

Use 2 or 3 columns, only for short parallel content.

### Split note (two pages side by side)

Mosaic can split a note into two halves, a left page and a right page, shown side by side. It is
like two notes on one screen. Use it when two things are best read next to each other, not one
after the other:

- **Compare two things:** Bipolar I | Bipolar II, typical | atypical antipsychotics, a drug |
  its alternative, intoxication | withdrawal. Give both halves the same structure (same
  subheadings, same activities in the same order) so I can read across.
- **Lecture | my notes:** the guided activities on the left; on the right, the same `###`
  subheadings with one or two empty bullets under each (`- `) for what the professor says out loud.
- **Learn | test:** content with blanks on the left; on the right, practice questions as folded
  question callouts and the answer key, so I can check myself without scrolling.
- **Case | workup:** a patient case on the left; on the right, short-answer questions to work it
  up (assessment, plan, monitoring).
- **Disease | Drugs (the whole lecture):** put everything below the Learning objectives in one
  split: the disease sections on the left (pathophysiology, diagnosis, treatment approach and
  guidelines, patient cases) and the drug sections on the right (one `##` per drug or class:
  mechanism, dosing, levels, ADRs, monitoring, interactions). Each half holds full `##` sections
  with `---` between them; a Check Yourself toggle goes below the split, full width. Inside this
  layout there are no other splits (use tables for two-way comparisons).

How to write it (exactly):

```
<!--mosaic-pages-->

## Bipolar I

...everything in the left page...

<!--mosaic-page-->

## Bipolar II

...everything in the right page...

<!--/mosaic-pages-->
```

Rules:

- Add `width: full` to the front matter. The halves only sit side by side when the note is full
  width; otherwise Mosaic shows them one above the other.
- Each marker on its own line with a blank line before and after it. Left page first, then
  `<!--mosaic-page-->`, then the right page.
- At most one split per section (a note can have several), always at the top level: never
  inside a toggle, callout, columns, list or table. A split only takes the height of its halves,
  except a split that ends the note, which keeps room to write.
- Start each half with its own heading (`##` or `###`) so both pages are labelled.
- Anything can go in a half: text, lists, blanks and every card type, tables (`:: table` too),
  callouts, toggle sections and 2 columns. Cards keep the heading of their own half.
- Keep the halves about the same length, and tables in a half to 2 or 3 columns (each half is
  narrow).
- Content before and after the split is full width: for example the Learning objectives above it
  and a "Check yourself" toggle below it.
- Use columns (above) for a few short lines side by side inside a section. Use a split for two
  whole pages. Don't split a note just because it's long.

Example: compare two disorders.

```
---
course: Therapeutics IV
tags: [lecture, bipolar-disorder]
date: 2026-11-18
width: full
---

## Learning objectives

- [ ] Tell bipolar I from bipolar II

<!--mosaic-pages-->

## Bipolar I

- Requires at least one {{_____}} episode.
- Psychosis possible: {{_____::yes / no}}

First-line agents for acute mania ::
  - 
  - 

<!--mosaic-page-->

## Bipolar II

- Requires a {{_____}} episode and a {{_____}} episode.
- Psychosis possible: {{_____::yes / no}}

First-line agents for bipolar depression ::
  - 
  - 

<!--/mosaic-pages-->

> [!success]- Answer key
>
> 1. manic
> 2. yes
> ...
```

Example: lecture on the left, my notes on the right.

```
<!--mosaic-pages-->

## Lithium (slides)

### Levels and dosing

- Target level in acute mania: {{_____::mEq/L}}
- Draw the trough {{_____::hours}} after the last dose.

### Toxicity

- Activated charcoal for lithium toxicity: {{_____::give / do not give}}

<!--mosaic-page-->

## My notes

### Levels and dosing

- 
- 

### Toxicity

- 
- 

<!--/mosaic-pages-->
```

## Flashcards inside the notes

Mosaic makes flashcards from special lines. Make cards only for things worth memorising: about
[1 card per 2 to 4 lines of notes]. Each card tests one fact. Keep the question side short and
unambiguous; it should make sense on its own, because the card shows the heading path above it
as context.

| Syntax | Card |
|---|---|
| `Question :: Answer` | basic card: shows the question, asks for the answer |
| `Term ::: Definition` | two cards: each side asks for the other |
| `Answer <:: Question` | reverse card: shows the right side, asks for the left |
| `Concept ;; meaning` | concept card (both ways), shown as a concept |
| `Property ;;; value` | descriptor, indented under a concept line: asks "Concept › Property" |
| `Text with {{hidden part}}` | cloze: each `{{…}}` becomes its own card |
| `{{c1::part one}} … {{c1::part two}}` | numbered clozes with the same number hide together |
| `{{answer::hint}}` | cloze with a hint shown in the gap |
| `Question ::` + indented bullets | list card: the answer is the bullets under it |

Examples:

```
Metoprolol succinate class :: Beta-1 selective blocker

Lisinopril ;; ACE inhibitor that lowers angiotensin II and aldosterone
  - Mechanism ;;; blocks ACE, less angiotensin II
  - Key ADE ;;; dry cough (bradykinin build-up)
  - Monitoring ;;; SCr, K+, BP

GDMT for HFrEF combines {{an ARNI, ACEi or ARB}}, {{an evidence-based beta blocker}}, {{an MRA}} and {{an SGLT2 inhibitor}}.

Target heart rate on a beta blocker is {{under 70::bpm}}.

Four pillars of HFrEF therapy ::
  - ARNI / ACEi / ARB
  - Beta blocker
  - MRA
  - SGLT2 inhibitor
```

Rules for cards:

- One card per line. Put the separator (`::`, `:::`, `<::`, `;;`, `;;;`) with a space on each side.
- List cards: the bullets under `Question ::` are indented 2 spaces deeper. An item can be a card
  of its own too, and a nested list card's bullets belong to it, not to its parent.
- Descriptors (`;;;`) go as bullets indented 2 spaces under the concept they describe (a `;;`
  line, a **bold** line, or any line), or directly under a heading.
- A table becomes cards when the line right above it is `:: table` (blank line between): each cell
  becomes "Row › Column?" → cell. Use this for drug comparison tables. For one card per row (all of
  that row's facts as the answer), add this line right above the table (after `:: table` and a
  blank line): `<!--mosaic-table {"c":{"mode":"row"}}-->`. The first column should name what each
  row is about (the drug).
- Never write card syntax inside table cells, inline code, code blocks or callouts.
- Never write `<!--sd:...-->` comments; Mosaic adds its own card ids.
- Don't make a card when a heading or an obvious fact would give the answer away.

## Guided notes: activities to fill in during lecture

These are notes I complete WHILE I listen. Leave gaps for me with the activities below. Mosaic
turns what I fill in into flashcards, and an empty gap is never a card, so nothing half-finished
ends up in my reviews.

Spread the activities through the note, roughly one every short paragraph, and mix the types.
Blank only what is worth remembering (drug names, classes, mechanisms, numbers, monitoring,
counselling points), never filler words. Every activity's answer goes in that section's answer key
(see the end of this section).

### 1. Fill in the blank

Write the full sentence with `{{_____}}` (five underscores) where the answer goes. At most two
blanks per sentence. Add a hint after `::` when the answer could be several things:

```
ACE inhibitors block the conversion of angiotensin I to {{_____}}.
The target resting heart rate on a beta blocker is under {{_____::number, bpm}}.
```

(I double-click a blank and type, and the line becomes a cloze card.)

### 2. Fill out the table

A comparison table with `:: table` on the line above it. Fill in the first column (what each row is
about, usually the drug) and the column headers; leave the cells for me. Fill one row completely
as a worked example only when the pattern isn't obvious.

```
:: table

| Drug | Class | Mechanism | Key ADE | Monitoring |
| --- | --- | --- | --- | --- |
| Lisinopril |  |  |  |  |
| Spironolactone |  |  |  |  |
```

### 3. Short answer

A question with ` ::` and nothing after it. I write the answer after the arrow.

```
Why must potassium be monitored with spironolactone ::
```

### 4. List recall

A question ending in ` ::`, then one empty bullet per expected item (indented 2 spaces), so I can
see how many there are.

```
Four pillars of HFrEF therapy ::
  - 
  - 
  - 
  - 
```

### 5. Drug profile frame

The drug name in **bold** on its own line, then empty descriptor bullets for me to complete:

```
**Sacubitril/valsartan**
  - Class ;;;
  - Mechanism ;;;
  - Key ADE ;;;
  - Counselling point ;;;
```

### 6. Predict, then reveal

A question to think about before the professor explains it, as a folded question callout (the
title shows, the answer stays hidden until I open it). Don't put blanks inside callouts.

```
> [!question]- Predict: why can an ACE inhibitor cause a dry cough?
> ACE also breaks down bradykinin, so bradykinin builds up in the lungs.
```

### 7. Patient case

An `example` callout with a short case, then 2 to 3 short-answer questions (activity 3) under it.

```
> [!example] Patient case
> JT, 64 M, HFrEF (EF 30%), on lisinopril 20 mg daily. K+ 5.6, SCr up from 1.1 to 1.4.

What change would you make to his lisinopril ::
What should be rechecked, and when ::
```

### 8. Exam spotlight

When something is clearly high-yield, an `exam` callout saying so, followed (outside the
callout) by a fill-in blank or short answer about it.

### 9. Answer key (end of every `##` section)

After each `##` section's activities, a folded callout with every answer in order, numbered to
match the order of the gaps. It stays closed so I can check myself after lecture.

```
> [!success]- Answer key
> 1. angiotensin II
> 2. 70 bpm
> 3. Lisinopril: ACE inhibitor · blocks ACE · cough, hyperkalaemia · SCr, K+
```

### Also

- Start the note with a `## Learning objectives` checklist (`- [ ] …`) taken from the lecture's
  objectives, so I can tick them off.
- End with a closed toggle `### Check yourself` holding 3 to 5 exam-style questions as folded
  question callouts with the answers inside.
- Link related notes with `[[Note name]]` where they exist (for example `[[Heart failure]]`).

## Reference: everything Mosaic can and can't do

Use this when inventing new kinds of activities: anything you suggest has to be buildable from
these pieces.

### What a note can contain

- **Text:** paragraphs, `#` to `###` headings, `-` bullets, `1.` numbered lists, `- [ ]` checklists
  (clickable), any of them indented to nest; **bold**, *italic*, ~~strike~~, `inline code`,
  ```` ``` ```` code blocks, `---` dividers, web links `[text](https://…)`.
- **Highlights:** `==yellow==` and `<mark class="…">` in rose, sage, peach, lavender, blue, mint,
  coral, lilac, sky, lemon, grey. Highlighting is the only way to colour text (no text colours,
  no font sizes).
- **Quotes:** `> text`; a last line starting with `—` shows as the source.
- **Callouts:** `> [!kind] Title` boxes (kinds above); `-` after the kind starts it folded, `+`
  makes it foldable but open. They can hold paragraphs, lists and tables.
- **Toggle sections:** a heading with everything under it folds away (`<!--mosaic-toggle-->` …
  `<!--/mosaic-toggle-->`); can start closed; can nest; can hold anything except columns. Flashcards
  inside toggles work normally.
- **Tables:** header row + rows; a cell holds lines, bullets, numbered items or checkboxes (joined
  with `<br>`), never headings, callouts or another table. No merged cells. Cells can have a
  background colour (the app sets this).
- **Columns:** 2 to 4 side-by-side columns at the top level of the note (not inside toggles,
  callouts or tables).
- **Split note (side by side):** two pages next to each other, for example "lecture | my notes"
  or "drug A | drug B" (see "Split note" above; needs `width: full`; at most one per section, top level).
- **Links:** `[[Note name]]`, `[[Note name|shown text]]`, `[[Note name#Heading]]`; links to a PDF
  page `[[folder/file.pdf#p3|Slides, p. 3]]` open the PDF at that page. `#tags` anywhere.
- **Front matter:** `course`, `tags`, `date`, `icon` (emoji), `cover` (lilac, blush, peach, butter,
  mint, sage, sky or sunset), `width` (wide or full), `header` (full or compact).
- **Images:** only pictures I paste in myself (Claude can't add images).

### Interactivity inside a note

- The only things that hide and reveal in the note itself: folded **callouts**, closed **toggle
  sections**, and folding under a heading (that last one is a view setting, not saved in the file).
- Checkboxes can be ticked.
- Everything else is static text: there are no buttons, drop-downs, timers, drag-and-drop,
  matching games, scoring or scripts inside a note. Clozes show their answer in the note (they only
  hide in review).

### The flashcard system (what happens after the notes)

- Card types made from note lines: basic `::`, both ways `:::`, reverse `<::`, concept `;;`,
  descriptor `;;;` (asks "Concept › Property"), cloze `{{…}}` (grouped `{{c1::…}}`, hints
  `{{answer::hint}}`), list cards (`Question ::` + indented bullets; items can be nested cards),
  table cards (`:: table`: one card per cell, one per row, or the row with one cell hidden; can also
  ask "which drug?" from a fact; columns can be skipped).
- One card per line; an answer is one line, except list cards and table row cards. No cards in
  headings, table cells (except via `:: table`), callouts, code, or with blank answers.
- Review is FSRS spaced repetition (like modern Anki). Extras: a scratchpad (I write my answer
  before I see it, then rate myself), list cards where I mark each missed item and only those come
  back a few cards later, exam-aware scheduling (cards of a course with an exam coming are brought
  up before it), and cram mode (practice without changing the schedule).
- Each card shows its heading path as context, so a card can rely on its section for meaning.

### Other study tools in Mosaic (outside notes)

- **Quizzes** (separate files in Materials, not inside notes): single answer, select all that apply,
  true/false, fill-in-the-blank (typed, with typo tolerance), drop-down, and calculations with a
  tolerance; each question has a topic and an explanation; Mosaic tracks scores by topic and has
  "redo missed". Written in the Mosaic quiz format (the Copy format for Claude button in
  Materials → Paste quiz gives the exact rules).
- **Card library**: standalone cards made in the app or imported from CSV, including a Drug card
  type (generic, brand, class, indication, ADEs, counselling) and image occlusion (boxes hiding
  parts of a picture). Claude can prepare CSV rows for import.
- **PDF slides**: highlights, notes and cards made on the lecture PDFs; a note can link to a slide.
- **Recall Labs**: self-made interactive HTML study pages in Materials.

### Limits to keep in mind

- No maths rendering (`$$…$$` shows as plain text), no diagrams or charts, no audio or video,
  no images from Claude.
- Nothing inside a note checks my answers; checking happens in flashcard review or in quizzes.
- Columns only at the top level; tables only hold text and lists; cards never inside callouts or
  table cells.

## Brainstorming with Claude

To come up with new activities, paste this guide and then ask something like:

> Using only what Mosaic can do (see the reference above), brainstorm 10 new kinds of guided-note
> activities for pharmacy lectures. For each: a name, why it helps me learn (retrieval, spacing,
> application…), exactly how it would be written in a Mosaic note (show a small example), what
> becomes a flashcard once I fill it in, and any limit it runs into. Prefer activities I fill in
> during lecture that turn into good flashcards afterwards. Also suggest which ones would work
> better as a Mosaic quiz file than inside the note.
