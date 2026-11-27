import { spell, staffPos } from '../../domain/keys';

/**
 * The staff picker's geometry (design 4.2): a treble staff in written pitch, where each line or space is a natural
 * note. Positions count diatonic steps above the bottom line, E4 = 0, as on the sheet (`staffPos`).
 */

const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const E4_STEPS = 4 * 7 + 2;

/** Where a written pitch sits on the staff, spelled with flats as the app names notes (B♭ on the B line). */
export function posOfPitch(pitch: number): number {
  return staffPos(spell(pitch, -1));
}

/** The natural note on a line or space. */
export function naturalAt(pos: number): number {
  const steps = pos + E4_STEPS;
  const octave = Math.floor(steps / 7);
  const letter = steps - octave * 7;
  return (octave + 1) * 12 + NATURAL[letter];
}

/** The lines and spaces the picker shows: the instrument's range, one step of margin each side, the staff at least. */
export function shownPositions(lo: number, hi: number): { low: number; high: number } {
  return { low: Math.min(posOfPitch(lo) - 1, -1), high: Math.max(posOfPitch(hi) + 1, 9) };
}

/** The line or space nearest a height on the staff, given the y of the bottom line and the 5 px between steps. */
export function posAt(y: number, bottomLineY: number): number {
  return Math.round((bottomLineY - y) / 5);
}
