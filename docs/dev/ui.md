# Icons and the Settings page

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

## Icons (Nov 19, her ask: Notion-like clean icons in colours, then every emoji)

- One picker for everything with an icon: `src/lib/components/IconPicker.svelte`, tabs **Icons**
  (first, her pick) and **Emoji**, a search box, a colour row (Default, Grey, Red, Pink, Orange,
  Yellow, Green, Blue, Purple, mixed from theme tokens so dark themes work; hidden with
  `colours={false}` where the colour comes from elsewhere: tags, courses), Remove. A colour click
  on the current line icon recolours it and keeps the popup open (`onpick(v, recoloured)`).
  Emoji: npm `unicode-emoji-json` `data-by-group.json`, dynamically imported (its own ~277 KB
  chunk, loaded when the tab opens), all groups but "Component", search by name, a Recent row
  (localStorage "mosaic.recentEmoji", 24), and a type / paste box.
- Line icons: npm `lucide` (ISC), a curated ~254 in `src/lib/iconSet.ts` (named imports, so only
  those are bundled, ~73 KB; groups Study, Health, Plan, Life, Shapes). Add one: import it from
  "lucide" and add a row (kebab-case name; check the name exists in lucide's icons folder, some were
  renamed, e.g. smile → face-slightly-smiling, filter → funnel, trash-2 → trash).
- Stored values stay one string (`src/lib/icons.ts`, pure): `"i:<name>[:<colour>]"` = line icon,
  any other text = emoji, and Icon.svelte's own names ("book", "pill"…) still work for older tags /
  courses. `Icon.svelte` draws ANY of these (`<Icon name={value} />`, `colour={false}` to ignore the
  stored colour), so tags, courses, board cards and task rows took the new icons with no changes.
- Used in: note icon (NoteHead, front matter `icon:`), folder looks (NoteMenu "Icon and colour";
  folder colour still separate), course settings, tag manager. Shown with `<Icon>` in the note
  header, the note top bar, folder tiles, the right-click menu, the move list and the drag ghost.
  Callout type icons still use their own small list (they're drawn in CSS `::before`).

## Settings page (Nov 18, her pick "A · Side list" on canvas "A cleaner Settings page", with line icons: "I don't love the multicoloured emojis")

- `src/routes/Settings.svelte`: a 250px list of groups (Icon line icons in a `--chip` tile, never
  emoji) and one group at a time on the right; route `#/settings/<group>` (default appearance):
  You, Appearance, Notes, Flashcards | Files & storage, Sync, Calendar | Labs & advanced. Live
  notes beside some groups (theme name, Drive / This computer, sync "N min ago"). Each setting is a
  row (`.srow`: label + hint left, control right; `.col` stacks) inside `.scard` cards with a small
  uppercase heading; most controls are the `seg` snippet. The theme picker shows one family at a
  time (Glass / Neutral / Dark tabs). Flashcards holds new cards a day, retention and exam-aware
  too (the Cards tab still has them). Search (`INDEX`: id, group, label, words) jumps to a row
  (`id="set-<id>"`) and tints it briefly. Below 860px the groups become chips on top. The avatar
  menu's Appearance goes to `#/settings/appearance`. New icons: user, palette, cloud, laptop.
