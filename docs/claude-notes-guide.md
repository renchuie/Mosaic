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
