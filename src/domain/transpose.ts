import { type Instrument, rangeState } from './instruments';
import { keySignature, mod12 } from './keys';
import type { Bar, Mode } from './types';

export interface Prefs { easyRegister: boolean; fewAccidentals: boolean }
export const DEFAULT_PREFS: Prefs = { easyRegister: true, fewAccidentals: true };

export interface ShiftScore {
  shift: number; score: number; bad: number; ext: number; upper: number; low: number; sig: number; min: number; max: number;
}

const MAX_SHIFT = 24;

/** Concert pitch of every sounding attack: rests and tied continuations are skipped. */
export function scoringPitches(score: Bar[]): number[] {
  const out: number[] = [];
  let prevTied = false; // ties cross bar lines
  for (const bar of score) {
    for (const e of bar.ev) {
      if (!e.r && !prevTied) out.push(e.m);
      prevTied = e.tie;
    }
  }
  return out;
}

export function evalShift(pitches: number[], shift: number, i: Instrument, tonicPc: number, mode: Mode, prefs: Prefs): ShiftScore {
  let bad = 0, ext = 0, upper = 0, low = 0, min = 0, max = 0;
  pitches.forEach((m, k) => {
    const w = m + shift + i.off;
    if (k === 0 || w < min) min = w;
    if (k === 0 || w > max) max = w;
    const state = rangeState(i, w);
    if (state === 'bad') bad++;
    else if (state === 'ext') ext++;
    else if (w > i.easyTop) upper++;
    if (i.kind === 'sax' && w < 62) low++;
  });
  const sig = keySignature(mod12(tonicPc + shift + i.off), mode);
  const E = prefs.easyRegister ? 1 : 0;
  const A = prefs.fewAccidentals ? 1 : 0;
  const score = bad * 1000 + ext * 60 + upper * 3 * E + low * 3 * E + Math.abs(sig) * 8 * A + Math.abs(shift);
  return { shift, score, bad, ext, upper, low, sig, min, max };
}

/** Shifts −24..+24, best first. Ties go to the smaller |shift|, then the lower shift. */
export function rankShifts(pitches: number[], i: Instrument, tonicPc: number, mode: Mode, prefs: Prefs): ShiftScore[] {
  const all: ShiftScore[] = [];
  for (let s = -MAX_SHIFT; s <= MAX_SHIFT; s++) all.push(evalShift(pitches, s, i, tonicPc, mode, prefs));
  return all.sort((a, b) => a.score - b.score || Math.abs(a.shift) - Math.abs(b.shift) || a.shift - b.shift);
}

/** Best-ranked shift whose written key has the given tonic. */
export function bestShiftForWrittenTonic(ranked: ShiftScore[], i: Instrument, originalTonicPc: number, writtenTonicPc: number): number {
  const hit = ranked.find(r => mod12(originalTonicPc + r.shift + i.off) === mod12(writtenTonicPc));
  return (hit ?? ranked[0]).shift;
}

/** Best-ranked shift whose sounding key has the given tonic. */
export function bestShiftForConcertTonic(ranked: ShiftScore[], originalTonicPc: number, concertTonicPc: number): number {
  const hit = ranked.find(r => mod12(originalTonicPc + r.shift) === mod12(concertTonicPc));
  return (hit ?? ranked[0]).shift;
}

export function reasonText(s: ShiftScore, _i: Instrument): string {
  if (s.bad > 0) return `${s.bad} unplayable`;
  if (s.ext > 0) return `${s.ext} extended`;
  if (s.upper > 0) return `${s.upper} ${s.upper === 1 ? 'note' : 'notes'} in the upper register`;
  return 'low register only';
}
