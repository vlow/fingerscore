import type { Mode } from './types';

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

const SIG_BY_MAJOR_PC: Record<number, number> = { 0: 0, 1: -5, 2: 2, 3: -3, 4: 4, 5: -1, 6: -6, 7: 1, 8: -4, 9: 3, 10: -2, 11: 5 };

export function keySignature(tonicPc: number, mode: Mode): number {
  const majorPc = mode === 'minor' ? mod12(tonicPc + 3) : mod12(tonicPc);
  return SIG_BY_MAJOR_PC[majorPc];
}

const MAJOR_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const MINOR_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

export function tonicName(tonicPc: number, mode: Mode): string {
  return (mode === 'minor' ? MINOR_NAMES : MAJOR_NAMES)[mod12(tonicPc)];
}

export function keyName(tonicPc: number, mode: Mode): string {
  return `${tonicName(tonicPc, mode)} ${mode}`;
}

export function sigText(sig: number): string {
  if (sig === 0) return 'no sharps or flats';
  return sig > 0 ? `${sig} ♯` : `${-sig} ♭`;
}

/** letter 0=C..6=B */
export interface Spelled { letter: number; alter: -1 | 0 | 1; octave: number; name: string }

const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_SPELLING: [number, 0 | 1][] = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const FLAT_SPELLING: [number, 0 | -1][] = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];

export function spell(midi: number, sig: number): Spelled {
  const [letter, alter] = (sig >= 0 ? SHARP_SPELLING : FLAT_SPELLING)[mod12(midi)];
  const octave = Math.floor(midi / 12) - 1;
  const mark = alter === 1 ? '♯' : alter === -1 ? '♭' : '';
  return { letter, alter, octave, name: `${LETTER_NAMES[letter]}${mark}${octave}` };
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

export function accidental(s: Spelled, sig: number): 'sharp' | 'flat' | 'natural' | null {
  const implied = signatureLetters(sig).includes(s.letter) ? (sig > 0 ? 1 : -1) : 0;
  if (s.alter === implied) return null;
  return s.alter === 1 ? 'sharp' : s.alter === -1 ? 'flat' : 'natural';
}
