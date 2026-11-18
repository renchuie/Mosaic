# Mosaic notes: formatting guide for Claude

Paste everything below the line into your notes prompt (or into a Claude Project's instructions).
Edit the parts in [square brackets] to fit you.

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

## Guided notes

[Your own instructions about guided notes go here, for example:]
- For the blanks I fill in during lecture, use clozes (`{{answer}}`), so each blank is also a
  review card afterwards.
- Leave one empty bullet `- ` under each section for my own notes.
