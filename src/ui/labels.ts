import type { Instrument } from '../domain/instruments';

/** Signed semitone count as the sheet shows it: "+3", "−2", "0". */
export function shiftLabel(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

/** "+15" → "+1 oct +3"; plain label below an octave. */
export function shiftOctaveLabel(n: number): string {
  if (Math.abs(n) < 12) return shiftLabel(n);
  const octs = Math.trunc(n / 12);
  const rem = n % 12;
  return `${shiftLabel(octs)} oct${rem ? ` ${shiftLabel(rem)}` : ''}`;
}

/** Instrument name in running text: "Alto sax (E♭)" → "alto sax", "Xaphoon in C" → "xaphoon". */
export function instNoun(i: Instrument): string {
  return i.name.replace(/ (in .+|\(.+\))$/, '').toLowerCase();
}
