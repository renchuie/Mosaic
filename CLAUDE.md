# Mosaic (formerly Study Desk)

**Mosaic: your student life in full view.** Personal app for Jazmine (pharmacy student). Built for
her own use until v1.0; during spring semester 2027 she'll share it with friends on **Windows**,
once the Study tab and the Planner are complete (plan: `ROADMAP.md` "Sharing with friends"). So:
don't hard-code her personal data as defaults, keep paths and file opening cross-platform where
it's cheap, and keep the app light on laptops. Desktop app for Arch Linux + Hyprland (Wayland,
end-4 illogical-impulse dotfiles). Must install identically on her PC (AMD GPU) and laptop (NVIDIA
GPU) through `./install.sh`.

## Working agreements

- Build in small phases she can run and look at. After each phase give the exact commands to run
  (`cd ~/iwanttocry && git pull && ./install.sh`, or just `./install.sh` when working on her PC)
  and a checklist of what to check.
- Before installing any system package, say exactly what and why.
- Never edit her Hyprland config. Offer snippets (`packaging/hyprland-rules.conf`) she pastes herself.
- Personal data never goes in the repo.
- Work follows `ROADMAP.md`: one focus per week until v1.0 on Dec 31, 2026. Stay inside the current
  week's focus; log anything else under "Found this week" in that file.
- Build FROM the design boards (canvas artifact, or `design/boards/`), not from notes about them.
  Her taste: "clean cute aesthetic, not super plain but not super crazy".
- Gemini may hand over UI skeletons (`GEMINI.md` is its brief): real Svelte files with fake data
  and `TODO(claude)` comments. Wire them up; keep its markup and styles unless they break a rule here.
- She wants to save tokens: read the `docs/dev/` file for an area only when the task touches it;
  check visually only when the change is visual.

## Writing UI text (Nov 19, her ask: "less wordy, less like the app is babying the user")

- Labels say what a thing is; a hint is a few words and only when the label isn't enough; empty
  states just say it's empty ("No notes yet.", never "Your notes show up here. Click…"); tooltips
  are a name plus a shortcut ("Reverse card (<-)"); messages say what happened, not how it works.
  No "e.g." placeholders with her personal examples. No explanations of internals (FSRS, file
  formats, folder names) in the UI; that belongs in docs.

## Product direction (her words, Nov 16)

Read `VISION.md` before planning or designing anything (the vision, principles, and what she
likes or dislikes in each inspiration).
- Lots of personality and room for customisation. Biggest inspirations: RemNote, xTiles, Notion,
  Obsidian.
- **Two sides that respect the user**: student life AND personal life. Only the student side is
  being built; keep room for a personal side (don't hard-wire everything to courses).
- Planned (not built): **Courses merge into Study**; **Tasks and Calendar merge into one Planner tab**.

## Stack (decided)

- Tauri v2 (Rust) + Svelte 5 (runes) + Vite + TypeScript. Plain CSS with variables, no UI framework.
- Shown as **"Mosaic"**; the internal name stays `studydesk` on purpose (Tauri identifier, binary,
  `.desktop`, Wayland app id / Hyprland class, `~/.local/share/studydesk/`, the webview data dir
  where lab progress lives in localStorage). Don't change it unless migrating on purpose.
- App icon: an M of two leaning tiles with a pink diamond, white on #8A74DE. Source
  `packaging/studydesk.svg`; PNGs rendered from it with Playwright. The rail logo in
  `Sidebar.svelte` is the same M in theme colours. Keep the two in step (details: `docs/dev/look.md`).
- App data: JSON in `~/.local/share/studydesk/`, written atomically from Rust. Anything that should
  follow her between computers goes in the synced store (`docs/dev/data.md`), not its own file.
  Machine-only data (settings, scan cache, labs tree) stays local.
- No Google APIs at all. Drive (or any synced folder) is only ever touched as a mounted folder.
- Font bundled through `@fontsource/atkinson-hyperlegible-next`. The app must work offline.
- Bundling is off (`bundle.active: false`); `install.sh` builds with `tauri build --no-bundle` and
  installs the binary, icon and `.desktop` file into `~/.local`. NVIDIA: `install.sh` puts
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` in the launcher.

## Rules that bite (details in `docs/dev/`)

- **Look:** frosted glass, pastel, no outlines except the glass `--edge`, pill buttons, 44px
  targets. Colours only from tokens in `src/styles/tokens.css` (15 themes incl. dark ones): never
  plain `white` / `#fff`; mix tints with `var(--white)`; secondary text on a tint uses
  `--muted-on-tint`. Never bring back neo-brutalism (ink borders, hard shadows, Unbounded, Space
  Mono). Motion uses `--spring` tokens, entrance animations `backwards` fill, all off with reduce
  motion. Floating things use `--surface-float`.
- **Performance:** every Tauri command that touches the disk is `pub async fn` (a plain `pub fn`
  runs on the main thread and freezes the window). No `backdrop-filter` on anything over scrolling
  content (WebKitGTK re-blurs every frame); only the rail, dialogs and menus blur. Layout-reading
  scroll handlers run once per frame.
- **Svelte:** a container query can't style the container itself (wrap it). Svelte rejects
  `$`-prefixed locals (name ProseMirror's `$from` `rf`). Use `SvelteSet` / `SvelteMap` for
  reactive collections. The router already decodes routes; don't decode again.
- **WebKitGTK:** an empty `<input type=date>` shows today; add class `empty` when unset. Links that
  sit in draggable things need `draggable="false"`. HTML drag-and-drop is unreliable under Tauri on
  Linux, so drags are pointer-based.
- **Files:** notes, materials and PDFs are her files on a synced folder. Never create a folder whose
  parent is missing (unmounted Drive), never overwrite without a conflict check (expected mtime),
  deletes go to `.trash/`. Notes stay plain Markdown readable outside the app.
- **Synced store:** records `{u, m, x, v}`, newest wins; `seed()` writes u=1 so any real edit wins.
  Removing a seed doesn't delete existing records. Courses are referred to by NAME everywhere
  (`saveCourse` rewrites references on rename).
- **Labs** are served on the app's own origin (`/__labs/`), never a separate origin (WebKitGTK gave
  that session-only storage and progress vanished).
- **Settings:** `saveSettings` saves the whole snapshot, so changing a default never changes her
  install. New installs: `onboarded` false, `drugTools` off (see `docs/dev/data.md`).

## Where things are documented

| Area | File |
| --- | --- |
| Themes, window frames, density, rail, motion, the old pastel design | `docs/dev/look.md` |
| Note page (block editor, columns, split notes, toggles, tables, paste, print), Markdown view, notes store | `docs/dev/notes.md` |
| Card syntax in notes, review, decks, browse, stats, add card, library, Anki import, games, table cards, exam-aware | `docs/dev/flashcards.md` |
| Materials, quiz engine + player, Recall Labs | `docs/dev/materials.md` |
| Calendar, tasks, board, study plan + timer, activity heatmap | `docs/dev/planner.md` |
| Courses and grade maths | `docs/dev/courses.md` |
| PDF viewer and annotations | `docs/dev/pdfs.md` |
| Sync, storage choices / vault, backups, trash, conflicts, note history, generic defaults (O1) | `docs/dev/data.md` |
| Icon picker, Settings page layout | `docs/dev/ui.md` |
| Testing without a screen, Xvfb, self-tests, performance work | `docs/dev/testing.md` |
| Early phases and decisions | `docs/dev/history.md` |
| Note syntax guide she gives Claude for guided notes (keep in step with note syntax) | `docs/claude-notes-guide.md` |
| Quiz file format | `docs/mosaic-format.md` |
| Public changelog | `CHANGELOG.md` |
| Plan and this week's focus | `ROADMAP.md` |
| Gemini's design brief; screenshots and boards | `GEMINI.md`, `design/` |

When a feature lands, add its notes to the matching `docs/dev/` file (not here) and only add a
line here if it's a rule that applies across the app.

## Commands

- `npm run tauri dev`: run with hot reload
- `npm run build` / `npm run check`: frontend build / type-check
- `npm run tauri build -- --no-bundle`: release binary at `src-tauri/target/release/studydesk`
- `./install.sh`: check packages (asks first), build, install into `~/.local`
- Browser preview for UI checks: `npm run build && npx vite preview --port 4173` (sample data;
  hooks `window.__synced`, `window.__notes`, `window.__ankiRead`)
