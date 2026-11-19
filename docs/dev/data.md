# Data, sync, storage, backups, history

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

## Sync between PC and laptop (Phase 3, built and tested)

- Sync folder (Settings, default on): `~/GoogleDrive/Pharmacy School/Study Lab/Study Desk Sync/`.
  Each machine writes ONLY its own file `<hostname>-<4 hex>.json` (id kept in local `machine.json`)
  and reads the others, so rclone never sees two writers on one file. Writes are temp + rename.
- `src-tauri/src/sync.rs` refuses to create the sync folder when its parent is missing (Drive not
  mounted), so nothing is ever written under an empty mount point. The app keeps working locally.
- `src/lib/stores/synced.svelte.ts`: named collections of records `{u: changed ms, m: machine,
  x?: deleted, v}`; merge keeps the newer record (tie: machine id). Deletes are tombstones.
  Local copy in `synced.json`. Sync on start, window focus, every 2 min, and 4 s after a change.
  `seed()` writes starter records stamped u=1 so any real edit on any machine wins.
- Collections: `events` (calendar), `folders` (lab folder links), `labOpens`, `days` (streak),
  `lab` (one record per `recallLab.*` localStorage key). Phase 2's `labs-folders.json` and
  `labs-activity.json` are migrated once into the store (old files left in place, unused).
- Lab progress merge (`src/lib/labMerge.ts`, pure): `best` = max per section, `known` = union,
  `sims` = union by `d`, `missed` and all other keys from the newer side. Local changes are caught
  from `storage` events and at each sync; the lab open in the viewer is never overwritten while open.
- Tested with two app instances (separate HOME, shared folder): migration, first pull on a new
  machine, and lab progress studied on one machine appearing on the other.

## Local vault (Nov 18, her ask: "an option to have a local vault if someone doesn't want to sync")

- Settings → "Where your files live" (`src/routes/settings/StoragePanel.svelte`): Google Drive
  (default) or "This computer only" = a vault folder she names and places (default `~/Mosaic`,
  in-app folder picker over Rust `vault_dirs`, no native dialog so it works the same on Windows)
  holding `Notes/`, `Materials/`, `PDFs/` and a `.mosaic-vault` marker (`src-tauri/src/vault.rs`,
  `vault_create`). Settings `storage` ("drive" | "local"), `vault`, `driveRoots` (the Drive
  folders + sync setting before the switch, put back when switching back); in vault mode
  `notesRoot` / `labsRoot` / `pdfRoot` are the vault's parts.
- Each switch asks (her pick): copy the files over or start empty / just switch. `vault_copy`
  keeps the folder structure (so lab folder links, PDF state and note paths carry over), keeps
  mtimes (the notes cache stays valid), skips hidden folders (`.trash`), copies only `.pdf` files
  (+ `.studydesk-originals`) from the PDF folder, NEVER overwrites (same name = skipped, counted)
  and never deletes; Rust test `vault::tests`. Separately each person chooses (her pick) whether
  app data (synced store: flashcard progress, calendar, tasks, courses…) keeps syncing through
  Drive (`syncEnabled`). `vault_open` shows the folder (xdg-open / explorer / open).
- `expand_home` falls back to `USERPROFILE` (Windows has no HOME) and accepts `~\`.
- For friends (Sharing track): a first-run choice between Drive and a vault is still to do.

## Backups (Nov 19, Week 2 "Trust"; her picks: both places, app data + note text)

- Settings → Backups. Once a day (45 s after start, then hourly, so a new day is caught) each
  computer writes `mosaic-backup-<YYYY-MM-DD>-<machine>.json` to `settings.backupLocal` (default
  `~/Mosaic Backups`) AND `settings.backupDrive` (default `…/Study Lab/Mosaic Backups`; "" turns a
  place off), then keeps its newest `backupKeep` (14). "Back up now" replaces today's file. Rust
  `src-tauri/src/backup.rs` (async: write via temp + rename, list, read, prune per machine; the
  Drive folder is only created when its parent exists, like sync; `cargo test backup`).
- Content (`src/lib/backup.ts`, pure, node test scratchpad `tstest/t60.ts`): `{mosaicBackup: 1,
  created, machine, host, settings, colls (the whole synced store), notes: {rel: Markdown} | null}`.
  Notes come from the notes index (cache if the folder can't be read); none at all = `null`, so an
  unmounted Drive never looks like "every note deleted". No backup while the synced store is empty.
- Restore (list of both places, or "From a file…"): a preview per collection (`COLL_NAMES`; back /
  changed / removed, compared with keys sorted) and notes (come back / replaced / newer ones stay),
  checkboxes App data / Notes / Settings. First a timed safety copy
  (`…-<day>T<HHMM>-<machine>.json`, listed as "before a restore", never replaces the day's file).
  App data: `restoredColls` stamps every restored or removed record NOW (`synced.restoreColls`), so
  it wins the next sync on the other computer instead of being undone by it. Notes: missing ones
  are written back; differing ones go to `.trash` first, then the backup's text is written; notes
  made since are never touched; the open note is left first. Settings skip this computer's folder
  paths (`MACHINE_SETTINGS`).
- Tested in the real app (Xvfb): back up now → both files; wipe `~/.local/share/studydesk`,
  delete a note, change another → restore brings back the note, the changed one's current text
  in `.trash`, and app data (a task added to the backup).

## Keeping files safe, part 2 (Nov 19, her "do all": she wants Mosaic to feel like a real product)

- Pasted images in backups: `backup_attachments` copies the notes folder's `attachments/` into
  `<backup folder>/attachments/` (only new or resized files; never deletes; `copy_missing`, Rust
  test `images_copied_once`); a notes restore first puts back missing images
  (`backup_restore_attachments`, from every backup place).
- In-app Trash (Notes home → Trash, `src/routes/study/NoteTrash.svelte`): `notes_trash` now writes
  `.trash/<secs>-<name>` plus `<that>.from` (the original path); `notes_trash_list` /
  `notes_trash_restore` (back to the same folder, made again if needed; a taken name gets
  " (restored)") / `notes_trash_purge` (one, or all older than N days); Rust test
  `trash_and_restore`. Entries from before Nov 19 have no `.from` and go back to the top level.
  Emptied of anything older than `settings.trashDays` (30) once the notes folder is read. Restoring
  carries the note's history to its new name.
- Conflicts (a note changed on the other computer while open here): the banner reads "Changed on
  your other computer. Nothing is lost either way." "Use that version" keeps this computer's text
  in the version history first; "Keep mine" saves the other version beside it as
  "<name> (other version <date, time>).md" with front matter `conflict:`, whose cards are left out
  (srs `cardsOf`), then writes mine.
- Folder missing: `src/lib/stores/connection.svelte.ts` checks the notes folder (and the sync
  folder's parent) at start, on focus and every minute (`paths_info`); App shows one floating pill
  ("Notes folder isn't connected. Is Google Drive running? Nothing is lost…", Check again,
  Settings, ×) and refreshes notes when it's back. `notes_list` takes `create`: the notes store only
  lets it make the folder when the index never had notes from that setting (`notes.from`, kept in
  the cache), so a moved / renamed / unsynced folder is reported instead of silently replaced by an
  empty one (found while testing: it used to make a fresh empty Notes folder).
- Storage, generic (Settings → Files & storage): **A synced folder** (`storage: "synced"`): a
  Mosaic folder (vault: Notes, Materials, PDFs + `Sync` for app data + `Backups`) inside Google
  Drive, Dropbox, OneDrive, iCloud Drive or any folder; the dialog finds the service's folder
  (`SERVICES` candidate paths, first that exists) and sees an existing Mosaic folder ("already has
  Mosaic files: they'll be used", nothing copied), so the second computer just picks the same
  folder. Her original setup (custom Drive paths) is `storage: "drive"`, shown as "Your own
  folders", kept in `driveRoots` when she switches ("Back to my own folders"). **This computer
  only** is the local vault. Drive-only wording elsewhere became generic ("synced folder");
  Rust errors say "Is your synced folder (Google Drive, Dropbox…) connected?".

## Note history (Nov 19, her ask after comparing with Obsidian's File recovery)

- Note ⋯ → "Version history…" (`src/routes/study/NoteHistory.svelte`): versions on the left,
  "Changes" (line diff since that version, `src/lib/lineDiff.ts`, pure; unchanged runs fold, card
  ids hidden) or "Whole version", "Restore this version". Kept on THIS computer only:
  `<app data>/history/<fnv64(path)>/` with `path.txt` and `<ms>.md` (Rust `history.rs`, async,
  `cargo test history`). Settings → Backups → "Note history" days (`settings.historyDays`, 14).
- When: `saveNote` in the notes store keeps the text it is about to replace, at most once per 10
  minutes per note (`snapshot`, in-memory `lastSnap`), so the first save after opening always keeps
  the original; same text as the newest version isn't kept twice; 300 per note max. Renames and
  folder moves carry the history (`history_move`). Restoring: flush, keep the current text
  (forced), write the old text, reload the editor; NotesView's `replacing` flag stops the closing
  editor's leave-save from writing the old text back over it.
- Tested in the real app: edit → version kept → history shows +2 −1 → restore → the file equals
  the original and the edited text is now a version too.

## Generic defaults (O1, Nov 19: "remove the very specific stuff about me")

First step towards onboarding for friends. Nothing personal is a default or a seed any more:
- `DEFAULT_SETTINGS`: `name: ""`, storage "local" with the vault `~/Mosaic` (Notes, Materials,
  PDFs, Sync), sync off, no Drive backup place. Her own settings file holds every value
  (`saveSettings` saves the whole snapshot), so new defaults never change her install.
- `settings.onboarded` (onboarding, O2, shows when false / unset on a fresh install). Migration in
  `loadSettings`: a saved settings file without `onboarded` = an existing install → `onboarded:
  true` and `drugTools: true`, saved once.
- **Drug tools** (`settings.drugTools`, Settings → You → Extras, off on new installs): the Drug
  card type (`cardTypes()` filters it), drug of the day on Study Home, the Top 200 tracker on
  course pages and in course settings (still shown on a course that already uses it), and the
  Drug monograph / Disease state / Patient case note templates.
- `settings.term` (Settings → You, blank = `currentTerm()`: Spring before May, Summer May–Jul,
  Fall after) is the term for new courses. `settings.field` ("What are you studying?") is stored
  for O2/O3.
- No courses or exam events are seeded; greetings drop the comma when the name is blank; "e.g."
  placeholders with her examples are gone.
- Next: O2 onboarding screens (canvas boards "Onboarding" and "Onboarding2"), O3 .ics import,
  existing-folder detection, templates by field, first-time hints, Getting started card.
