<p align="center">
  <img src="packaging/studydesk.png" alt="Mosaic app icon" width="120">
</p>

<h1 align="center">Mosaic</h1>
<p align="center"><em>Your student life in full view.</em></p>

**Mosaic is a productivity dashboard and personal knowledge base built to support your academic
and personal life.** It puts productivity, looks and speed first, without costing you time.
Whether you want a simple note-taking app you can make your own, or you want to level up your
studying with flashcards, quizzes and a planner, Mosaic is built to fit the way you work.

You shouldn't have to spend hours making your workspace pretty, and you shouldn't have to spend
hours learning how to get the most out of an app. Mosaic is useful the moment you open it, and
customising it is something you get to do for fun, not something you have to do before it works.

> Mosaic is in early development and currently runs on Arch Linux.

## The story behind Mosaic

Mosaic was made to make you feel good about your workflow.

I'm a pharmacy student, and I've tried app after app looking for one that would actually make
me productive. I've spent hours watching videos and reading guides on turning Notion and Obsidian
into the ultimate focus workspace. All I learned is that the setup takes hours, and by the time
everything is ready, I don't even want to be productive anymore!

I love software and everything you can do to make it your own. But my classmates, who aren't as
into tech, kept asking how they could get the same experience without learning CSS or digging
through plugin settings. That got me thinking: what if an app came ready for a student's life,
already pretty and already connected, and let you personalise it only as much as you want to?

That's Mosaic.

## What Mosaic is

Mosaic is a knowledge base built for all kinds of students.

- **If your field runs on notes and readings,** Mosaic has a writing page that feels like Google
  Docs or Notion, with your notes saved as plain files you own, plus a PDF reader where your
  highlights and notes are saved right into the PDF.
- **If you study with active recall, like me,** Mosaic has flashcards written straight into your
  notes (question → answer, cloze, even whole tables), scheduled with the same algorithm as
  modern Anki, along with practice quizzes and image occlusion.
- **If you like connecting ideas,** Mosaic has `[[links]]` between notes, backlinks and linked
  references, so every note shows what points to it.
- **And around all of that,** there's a calendar, tasks, a daily study plan with a timer, and a
  gradebook that tells you what you need on the rest of the term.

Mosaic is student-focused. Obsidian and Notion can become anything you make of them, but only
after you build it. Mosaic starts with the tools students actually use and keeps the best parts of
those apps: Notion's pretty pages, Obsidian's local files and links, RemNote's flashcards in your
notes.

## What Mosaic isn't

- **It isn't a replacement for Obsidian or Notion.** It doesn't try to copy every feature that
  makes them great. If you want an endlessly flexible, sprawling personal knowledge base, Mosaic
  won't give you all of that.
- **It isn't a build-it-yourself app.** There are no databases to design and no templates to fill
  in before it's useful. You can customise the look and your homepage, but the tools themselves
  come ready.
- **It isn't a plugin platform.** There's no plugin store. Features are built in, so they work
  together and nothing breaks after an update.
- **It doesn't have AI built in.** Mosaic never sends your notes anywhere. It's made to take in
  what you create with AI elsewhere: quizzes from Claude or NotebookLM drop straight into
  Materials.
- **It isn't a cloud service.** Your notes are Markdown files and your PDFs stay PDFs, in a
  folder you choose. Syncing between computers goes through that folder, such as Google Drive,
  not through a Mosaic account.
- **It isn't for teams.** Mosaic is a personal workspace, with no shared pages or real-time
  collaboration.
- **It isn't everywhere (yet).** It's a desktop app for Linux, with no phone app or web version.

## Install

Mosaic currently runs on Arch Linux (made on Hyprland).

```sh
git clone https://github.com/renchuie/iwanttocry && cd iwanttocry
./install.sh
```

The script lists any missing system packages and asks before installing them, builds the app, and
puts the app, its icon and a launcher entry in `~/.local`. Then open **Mosaic** from your
launcher. Optional Hyprland window rules are in `packaging/hyprland-rules.conf`.

To run it from the source while making changes:

```sh
npm install
npm run tauri dev
```

## A note on how Mosaic is made

Mosaic is built entirely with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding
tool. I don't claim the code as my own. I have no programming background, only the desire to bring
this idea to life, and AI became the tool that lets me do it. Mosaic comes from the part of me that
is simply a student who wants something that works.

If I could code, trust me, I would have built it myself. Down the road, once my ideas are built
and polished and Mosaic finds an audience, I'd love to put together a team of people who really
know how to make software like this. I have a lot of respect for programmers, and I hope that once
my vision exists, we can build on it with human creativity and effort.

Mosaic is free, open source, and transparent about how it's made.

## Inspirations and thanks

Mosaic wouldn't exist without the apps that shaped how I study:

- **[Obsidian](https://obsidian.md)**, for showing me what it means to build a personal knowledge
  base, and how to learn by connecting ideas.
- **[Notion](https://www.notion.com)**, my gateway to caring about my notes.
- **[RemNote](https://www.remnote.com)**, for bringing active recall right into my notes.
- **[Anki](https://apps.ankiweb.net)**, for proving how powerful spaced repetition can be.
- **[xTiles](https://xtiles.app)**, for showing that a workspace can be visual and free-form.

And thank you to the open-source projects Mosaic is built on, including
[Tauri](https://tauri.app), [Svelte](https://svelte.dev), [Tiptap](https://tiptap.dev) and
[ProseMirror](https://prosemirror.net), [CodeMirror](https://codemirror.net),
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (the FSRS scheduler),
[pdf.js](https://mozilla.github.io/pdf.js/), [pdf-lib](https://pdf-lib.js.org), and the
[Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/) font by the Braille
Institute.

## License

Mosaic is free software under the [GNU General Public License v3.0](LICENSE). You're welcome to
use it, change it, and share it, as long as anything you share that's built on Mosaic stays open
under the same license.
