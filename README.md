<p align="center">
  <img src="packaging/studydesk.png" alt="Mosaic app icon" width="120">
</p>

<h1 align="center">Mosaic</h1>
<p align="center"><em>Your student life in full view.</em></p>

**Mosaic is a study app and personal knowledge base that's ready the moment you open it.** Notes,
flashcards, PDFs, quizzes, a calendar, tasks and grades in one place, already pretty and already
connected, so you spend your time studying instead of building a workspace.

> Early development. Runs on Arch Linux; Windows is planned.

## Why

I'm a pharmacy student. I spent hours turning Notion and Obsidian into the perfect study setup,
and by the time it was ready I didn't want to study anymore. My classmates wanted the same setup
without learning CSS or plugins. Mosaic is that app: built for students, customisable only as much
as you want.

## What's in it

- **Notes** that feel like Notion, saved as plain Markdown files you own, with `[[links]]`,
  backlinks, columns, callouts and tables.
- **Flashcards written in your notes** (Q → A, cloze, lists, whole tables), scheduled with FSRS
  like modern Anki, plus decks, image occlusion, Anki import and practice games.
- **Courses as the hub:** each course split into exams and lectures, with the notes, PDFs, quizzes
  and cards for each lecture in one place, and how ready you are for the next exam.
- **PDFs** with highlights and notes saved into the PDF itself.
- **Quizzes and interactive pages** made with any AI (Claude, NotebookLM…) drop straight in and
  track your progress.
- **Planner:** calendar, tasks, a daily study plan with a timer, and a gradebook that tells you
  what you need on the rest of the term.
- **Yours:** 15 themes, daily backups, version history, and sync through a folder you already use
  (Google Drive, Dropbox…). No account.

## What it isn't

Not a build-it-yourself app, a plugin platform, a cloud service or a team tool. Features are
built in so they work together; your files stay in a folder you choose.

## Install

```sh
git clone https://github.com/renchuie/Mosaic.git && cd Mosaic
./install.sh
```

The script asks before installing any missing system packages, builds Mosaic and adds it to your
launcher. Optional Hyprland rules: `packaging/hyprland-rules.conf`. For development:
`npm install && npm run tauri dev`.

## How it's made

I design Mosaic, decide what it does and test it every day in my own classes. The code is written
with [Claude Code](https://claude.com/claude-code).

## Thanks

Inspired by [Obsidian](https://obsidian.md), [Notion](https://www.notion.com),
[RemNote](https://www.remnote.com), [Anki](https://apps.ankiweb.net) and
[xTiles](https://xtiles.app). Built on [Tauri](https://tauri.app), [Svelte](https://svelte.dev),
[Tiptap](https://tiptap.dev), [CodeMirror](https://codemirror.net),
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), [pdf.js](https://mozilla.github.io/pdf.js/),
[pdf-lib](https://pdf-lib.js.org) and the [Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/)
font.

## License

[GPL v3](LICENSE): use it, change it, share it, as long as what you share stays open too.
