# Brief for Gemini: Mosaic

You are helping build **Mosaic** ("your student life in full view"), a desktop study app for a
student. Your job is **design**: mockups and UI skeletons. Claude builds the logic underneath
(stores, data, Rust, saving, sync). Read this whole file before doing anything.

## Read first, in this order

| File | What it gives you |
| --- | --- |
| `VISION.md` | What Mosaic is for, its principles, what she likes and dislikes in RemNote, xTiles, Notion and Obsidian. **Read all of it.** |
| `design/screens/*.png` | What the app looks like today (Mosaic theme, sample data). |
| `design/boards/*.png` | Approved design boards for the next feature (see "Current job"). |
| `CHANGELOG.md` | Every feature so far, in plain words. |
| `ROADMAP.md` | The plan, week by week. Only work on what it says is current. |
| `src/styles/tokens.css` | Every colour, spacing, radius and motion token. **Use these, never your own values.** |
| `src/styles/base.css` | Shared classes: `.btn`, `.input`, `.field` + `.label`, `.card`, `.tag`, `.display`, `.muted`, and the dialog / menu surfaces. |
| `CLAUDE.md` | The short project guide: rules for UI text, look and performance. |
| `docs/dev/look.md` | The full look: themes, window frames, rail, motion. Other `docs/dev/` files only when a task touches that area. |

Good examples of finished screens to copy patterns from: `src/routes/Settings.svelte` (cards of
rows), `src/routes/study/CardsView.svelte` + `DeckRows.svelte` (dashboard + list),
`src/routes/study/AddCard.svelte` (a form), `src/lib/components/IconPicker.svelte` (a popup).

## The stack (don't change it)

Tauri v2 + **Svelte 5 with runes** (`$state`, `$derived`, `$props`, `$effect`; never Svelte 4
`export let` or stores with `$`) + TypeScript + plain CSS in each component's `<style>`. No UI
framework, no Tailwind, no new npm packages without asking.

## Design rules (from her, not optional)

- **Look:** soft, frosted glass, pastel. No outlines (except the thin glass `--edge`), no hard
  shadows, no ink borders, rounded everything (cards `--radius`, buttons are pills), touch targets
  at least 44px. Clean and cute: "not super plain but not super crazy".
- **Colours only from tokens** (`--surface`, `--panel`, `--text`, `--text-muted`, `--rose`,
  `--sage`, `--peach`, `--butter`, `--lavender`, `--g-*` gradients, `--hero`, `--on-hero`…).
  There are 15 themes, including dark ones; a hard-coded `#fff` or `white` breaks them. Tints:
  `color-mix(in srgb, var(--rose) 30%, var(--white))`.
- **Meaning:** rose = exams / alerts / overdue, sage = done / go, peach and butter = neutral.
- **Font:** Atkinson Hyperlegible Next (already loaded). 600 for headings, 400–500 for body.
- **Icons:** `<Icon name="..." />` from `src/lib/components/Icon.svelte` with lucide names
  (list in `src/lib/iconSet.ts`). Line icons, not emoji, in the interface.
- **Words (her rule: "less wordy, less like the app is babying the user"):** labels say what a
  thing is; hints are a few words, only when needed; empty states just say it's empty ("No notes
  yet."); buttons are verbs ("Add course"); no "e.g." placeholders; never explain how it works
  inside (no file formats, folder names, algorithms).
- **Speed:** no `backdrop-filter` on cards, list items or anything over scrolling content (it
  makes scrolling choppy on Linux). Only dialogs, menus and the side rail blur.
- **Motion:** use `--spring`, `--spring-soft`, `--ease-out`. Entrance animations use
  `animation-fill-mode: backwards`. Everything must still look right with reduced motion.
- **Narrow windows:** must hold up at about 800px wide.
- **Not only for her:** no personal data (her name, courses, school) in code or defaults.

## How to hand over a skeleton

1. Put real `.svelte` files where they will live (the task says where), not standalone HTML.
2. Markup + `<style>` are yours. Keep `<script>` minimal: `$state` for UI-only things (which step
   is open, what's typed), **fake data in one clearly marked block at the top**, and empty handler
   functions with a `// TODO(claude): …` comment saying what they should do.
3. **Do not edit** anything in `src/lib/` (stores, logic), `src-tauri/` (Rust) or other screens'
   `<script>` blocks. If you need something from them, write a TODO instead.
4. Run `npm run check` (0 errors) and `npm run build` before you stop.
5. Commit on its own branch, then add a short "Handoff" note at the top of `ROADMAP.md`'s
   "Found this week": what's done, what's fake, what's left.

Claude and you never work at the same time: one finishes and pushes, then the other pulls.

## Current job: onboarding (first launch)

Boards: `design/boards/onboarding-*.png` (the flow she approved) and
`design/boards/onboarding-ideas-*.png` (extra ideas she liked: all of them). Agreed flow, about
9 screens:

1. **Welcome:** Get started / I already use Mosaic / Restore from a backup.
2. **You:** name, "What are you studying?" (field chips), "What's Mosaic for?" (same screen).
3. **Semester:** courses (with a school calendar .ics import), exams (skipped if the .ics had
   them), how much a day.
4. **Setup:** notes and files (start fresh or use an existing folder; Obsidian vault found;
   Anki / CSV import buttons), look (theme), templates picked from the field.
5. **Try it:** make your first card, then "You're set", then the dashboard's "Getting started"
   checklist card.

The "pharmacy tools" step was removed on purpose: the field only shapes suggestions. Put the
screens in `src/routes/onboarding/` (one file per screen plus `Onboarding.svelte` holding the
steps). Claude wires saving, `settings.onboarded`, course creation and file import.
