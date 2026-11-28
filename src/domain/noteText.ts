/**
 * Reading a note name a player types (Fingerings page, design 4.2): English names with ♯ # ♭ b x, and German names with
 * -is and -es (Fis, Es, As, Bes; H is B natural). An octave number follows scientific pitch, middle C = C4; without one
 * the note nearest the current one in range is taken.
 */

const LETTER_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11, h: 11 };

const ALTER: Record<string, number> = {
  '': 0, '♮': 0,
  '#': 1, '♯': 1, is: 1, x: 2, '##': 2, '♯♯': 2, isis: 2,
  b: -1, '♭': -1, es: -1, s: -1, bb: -2, '♭♭': -2, eses: -2,
};

const PATTERN = /^([a-h])(isis|is|eses|es|s|##|♯♯|#|♯|x|bb|♭♭|b|♭|♮)?(-?\d)?$/;

export type NoteText = { pitch: number } | { error: 'unknown' | 'range' };

/**
 * The written pitch a typed name stands for, within lo..hi. `near` picks the octave when none is typed. An unreadable
 * name is 'unknown'; a readable one with no pitch in range is 'range'.
 */
export function readNote(text: string, near: number, lo: number, hi: number): NoteText {
  const m = PATTERN.exec(text.trim().toLowerCase().replace(/\s+/g, ''));
  if (!m) return { error: 'unknown' };
  const [, letter, accidental = '', octave] = m;
  const pc = LETTER_PC[letter] + ALTER[accidental];
  if (octave !== undefined) {
    const pitch = (Number(octave) + 1) * 12 + pc;
    return pitch >= lo && pitch <= hi ? { pitch } : { error: 'range' };
  }
  let best: number | null = null;
  for (let pitch = lo; pitch <= hi; pitch++) {
    if (((pitch - pc) % 12 + 12) % 12 !== 0) continue;
    if (best === null || Math.abs(pitch - near) < Math.abs(best - near)) best = pitch;
  }
  return best === null ? { error: 'range' } : { pitch: best };
}
