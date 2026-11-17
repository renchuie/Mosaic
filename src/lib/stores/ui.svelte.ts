// Small app-wide UI state that more than one component reads.

/** Writing mode (note page, Ctrl+\): the rail and the note's top bar step back until the mouse
 *  touches the left or top edge. Not remembered: every app start begins in the normal layout. */
export const ui = $state({ writing: false });
