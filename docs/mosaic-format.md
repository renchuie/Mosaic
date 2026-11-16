# Mosaic file format, v1: quizzes

Mosaic reads study materials you make with Claude or NotebookLM as plain Markdown files in your
Materials folder. Mosaic never changes these files; your answers and scores are kept separately
and synced between your computers.

The copy-ready version for Claude is the **Copy format for Claude** button in Materials → Paste
quiz (the same text as `QUIZ_GUIDE` in `src/lib/quiz.ts`).

## Header

```
---
mosaic: quiz          # required: tells Mosaic what this file is
title: Anticoagulation practice
course: Therapeutics IV   # optional; must match a course name to be filed under it
exam: Exam 5              # optional; becomes the folder inside the course
topics: [Anticoagulation] # optional; default topic for questions without one
id: ther4-anticoag        # optional; progress is kept under this id (default: from the title)
version: 1                # optional
---
```

Anything between the header and the first question is shown as an introduction.

## Questions

Each question starts with a heading line: `## Q<number> · <type> · <topic>`. The number is only
for you; the type and topic are optional (the type is guessed from the content when missing).
Separators `·`, `|` or ` - ` all work.

| Type | Aliases | How it's written | Scoring |
|---|---|---|---|
| `single` | mc, multiple choice | options `- [ ]`, the right one `- [x]` | that option |
| `sata` | multi, select all | options, every right one `- [x]` | all or nothing |
| `tf` | true/false | `Answer: true` / `Answer: false` (or two options True / False) | |
| `blank` | fill, cloze | blanks in the sentence: `{{idarucizumab\|Praxbind}}` (alternatives with `\|`) | every blank; case, accents and small typos (1 letter in 5–9, 2 in 10+) forgiven; numbers exact |
| `dropdown` | select | `{{*aPTT\|INR\|anti-Xa}}`, `*` marks the right choice | every drop-down |
| `calc` | calculation, numeric | `Answer: 50 mL/min ± 2` or `± 5%`; no tolerance means ± 1% | within the tolerance |

Lines starting with `>` are the **explanation**, shown after answering (a leading
"Explanation:" is dropped). Stems and explanations can use **bold**, *italics*, lists,
tables (good for lab values) and images (`![](image.png)` next to the file).

Example:

```
## Q1 · single · DOAC dosing
A 72-year-old with AF and CrCl 41 mL/min starts apixaban. Which dose?
- [ ] 2.5 mg twice daily
- [x] 5 mg twice daily
> Only one of the three dose-reduction criteria is met.
```

## When something is wrong

A question that can't be read is skipped, and Mosaic says which line and why (for example
"Question 7: multiple choice needs exactly one “- [x]”"). The rest of the quiz still works.

## Progress

Each question is recognised by a fingerprint of its type and text, so reordering questions,
renaming topics or fixing an option keeps its history; changing the question text starts it
fresh. Replacing the file with a newer version (same `id` or title) keeps all of it.

## Coming next (M3)

sorting, matching, categorise and grid questions; exam mode with a timer; weak topics.
