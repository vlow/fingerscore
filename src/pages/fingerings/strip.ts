/**
 * The range strip's window (design 4.2): one row of notes that never wraps and never scrolls sideways. When not all
 * notes fit, it shows a window of them; the window follows the chosen note and pages by a screenful minus two notes.
 */

/** Width of one note, in px: the app's smallest target size. */
export const CELL = 36;
/** The fewest notes the strip shows, however narrow. */
const MIN_SHOWN = 3;

/** How many notes fit in `width` px; all of them while the width is unknown (0). */
export function capacity(width: number, total: number): number {
  if (width <= 0) return total;
  return Math.min(total, Math.max(MIN_SHOWN, Math.floor(width / CELL)));
}

/** A window start that keeps the window inside the notes. */
export function clampStart(start: number, shown: number, total: number): number {
  return Math.min(Math.max(0, start), Math.max(0, total - shown));
}

/** The start that shows note `current`, moved as little as possible from `start`. */
export function follow(start: number, current: number, shown: number, total: number): number {
  let s = start;
  if (current < s) s = current;
  if (current >= s + shown) s = current - shown + 1;
  return clampStart(s, shown, total);
}

/** How far a page button moves the window: a screenful minus two notes, at least one. */
export function pageStep(shown: number): number {
  return Math.max(1, shown - 2);
}
