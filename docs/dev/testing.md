# Testing and performance

Detailed notes moved out of CLAUDE.md on Nov 19, 2026. Read the part you need before
changing that area; keep it up to date when you change it.

## Testing without a screen

`STUDYDESK_ROUTE=labs/<path>` opens a page at start; `STUDYDESK_ROUTE=selftest` prints the storage
probe, scanned labs, stored progress and sync results to stdout, then exits. Two "machines": run a
second copy with `HOME=/tmp/homeB` (symlink `/tmp/homeB/GoogleDrive` to the real one). Pure
modules (`labMerge.ts`, `calendar.ts`) import nothing, so they can be tested with plain `node`. With Xvfb:
`DISPLAY=:99 STUDYDESK_ROUTE=selftest ./src-tauri/target/release/studydesk`.
`STUDYDESK_ROUTE=selftest-pdf` reads a PDF from the PDF folder, saves a highlight into it through the
raw IPC write, reads it back and checks that a stale write is refused.

## Performance (Nov 19, her "scrolling isn't smooth, deleting has a brief moment")

- Tauri runs a command that is a plain `pub fn` on the MAIN thread, so the whole window freezes
  until it returns. Every command that touches the disk (above all the Drive mount, where a rename
  or write can take a while) must be `pub async fn`. Made async Nov 19: notes_mkdir / move / trash,
  pdfs_stat / restore / open, load_doc / save_doc, paths_info, materials_adopt, vault_dirs.
  Only tiny local ones stay sync (machine_name, open_in_system, vault_create (used by a test),
  vault_open).
- No `backdrop-filter` on anything that covers scrolling content: WebKitGTK re-blurs it every
  frame. Removed from `main` (the colour blooms behind it are soft, so it looked the same: < 1%
  pixel difference) and from the floating note toolbar (solid now).
- Scroll handlers that read layout run once per frame (`requestAnimationFrame`), e.g. NotesView's
  `onNoteScroll` → `checkHead`.
- Deleting is optimistic: `trashNote` / `trashFolder` drop the entries from the index first, then
  move the file; a failed move puts them back and says "Couldn't move it to the trash…". Deleting
  the open note (⋯ or right-click) leaves it at once without saving it first; its leave-save can't
  recreate it because `notes_write` refuses a missing file.
- Testing the real app: build with `npm run tauri build -- --no-bundle`, run it on Xvfb with a
  throwaway HOME (`GoogleDrive/Pharmacy School/Study Lab/Notes/...`), `LIBGL_ALWAYS_SOFTWARE=1
  WEBKIT_DISABLE_COMPOSITING_MODE=1`, `STUDYDESK_ROUTE=study/notes/<rel>`, drive it with `xdotool`
  (installed in the test container with her OK) and check the saved files / `import -window root`.
