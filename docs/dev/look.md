# Look and design system

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

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
  **Only a few layers blur** (rail, dialogs, menus; since Nov 19 NOT the main panel or the floating
  note toolbar, which sit over scrolling content: see "Performance"); cards are plain
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
