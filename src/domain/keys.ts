import type { Mode } from './types';

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

const SIG_BY_MAJOR_PC: Record<number, number> = { 0: 0, 1: -5, 2: 2, 3: -3, 4: 4, 5: -1, 6: -6, 7: 1, 8: -4, 9: 3, 10: -2, 11: 5 };

export const MODES: Mode[] = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];

/** Semitones the mode's tonic lies above the tonic of the major key with the same signature. */
export const MODE_BELOW_MAJOR: Record<Mode, number> = { major: 0, dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7, minor: 9, locrian: 11 };

export function keySignature(tonicPc: number, mode: Mode): number {
  return SIG_BY_MAJOR_PC[mod12(tonicPc - MODE_BELOW_MAJOR[mode])];
}

const MAJOR_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const MINOR_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

export function tonicName(tonicPc: number, mode: Mode): string {
  if (mode === 'major') return MAJOR_NAMES[mod12(tonicPc)];
  if (mode === 'minor') return MINOR_NAMES[mod12(tonicPc)];
  return spell(60 + mod12(tonicPc), keySignature(tonicPc, mode)).name.replace(/\d+$/, '');
}

export function keyName(tonicPc: number, mode: Mode): string {
  const label = mode === 'major' || mode === 'minor' ? mode : mode[0].toUpperCase() + mode.slice(1);
  return `${tonicName(tonicPc, mode)} ${label}`;
}

export function sigText(sig: number): string {
  if (sig === 0) return 'no sharps or flats';
  return sig > 0 ? `${sig} ♯` : `${-sig} ♭`;
}

export type Alter = -2 | -1 | 0 | 1 | 2;

/** letter 0=C..6=B; alter −2..2 (sheets only produce −1..1, scales may need a double sharp or flat). */
export interface Spelled { letter: number; alter: Alter; octave: number; name: string }

const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ALTER_MARKS: Record<Alter, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

/** "F♯", "F𝄪", "B𝄫", "C"; with the octave appended when given ("B♭4"). */
export function spelledName(letter: number, alter: Alter, octave?: number): string {
  return `${LETTER_NAMES[letter]}${ALTER_MARKS[alter]}${octave ?? ''}`;
}
const SHARP_SPELLING: [number, 0 | 1][] = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const FLAT_SPELLING: [number, 0 | -1][] = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];

export function spell(midi: number, sig: number): Spelled {
  const [letter, alter] = (sig >= 0 ? SHARP_SPELLING : FLAT_SPELLING)[mod12(midi)];
  const octave = Math.floor(midi / 12) - 1;
  return { letter, alter, octave, name: spelledName(letter, alter, octave) };
}

/** Diatonic steps above E4 (bottom line): E4 = 0. */
export function staffPos(s: Spelled): number {
  return s.octave * 7 + s.letter - (4 * 7 + 2);
}

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];  // B E A D G C F

export function signatureLetters(sig: number): number[] {
  if (sig > 0) return SHARP_ORDER.slice(0, sig);
  if (sig < 0) return FLAT_ORDER.slice(0, -sig);
  return [];
}

export type AccidentalName = 'doubleSharp' | 'sharp' | 'natural' | 'flat' | 'doubleFlat';
const ACCIDENTAL_NAMES: Record<Alter, AccidentalName> = { [-2]: 'doubleFlat', [-1]: 'flat', 0: 'natural', 1: 'sharp', 2: 'doubleSharp' };

/** The glyph that makes a letter sound with this alteration. */
export function accidentalName(alter: Alter): AccidentalName {
  return ACCIDENTAL_NAMES[alter];
}

/** Alteration the key signature gives a letter. */
export function signatureAlter(letter: number, sig: number): Alter {
  return signatureLetters(sig).includes(letter) ? (sig > 0 ? 1 : -1) : 0;
}

export function accidental(s: Spelled, sig: number): AccidentalName | null {
  return s.alter === signatureAlter(s.letter, sig) ? null : accidentalName(s.alter);
}
