// Small app-wide UI state that more than one component reads.

const LAST_NOTE = "mosaic.lastNote";
function readLastNote(): string | null {
  try {
    return localStorage.getItem(LAST_NOTE);
  } catch {
    return null;
  }
}

/** Writing mode (note page, Ctrl+\): the rail and the note's top bar step back until the mouse
 *  touches the left or top edge. Not remembered: every app start begins in the normal layout.
 *  lastNote: the note open on the Notes tab, so coming back to the tab picks up there (null = she
 *  was on the Notes home). Remembered per machine. */
export const ui = $state({ writing: false, lastNote: readLastNote() });

export function setLastNote(rel: string | null) {
  if (ui.lastNote === rel) return;
  ui.lastNote = rel;
  try {
    if (rel) localStorage.setItem(LAST_NOTE, rel);
    else localStorage.removeItem(LAST_NOTE);
  } catch {}
}

/** Where each note was scrolled to, this session, so coming back lands on the same spot. */
export const noteScroll = new Map<string, number>();
