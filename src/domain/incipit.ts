import type { Doc } from './types';

/** A note of the mini staff: x in percent of the staff width, y in px from its top; the stem hangs down or stands up. */
export interface IncipitNote { x: number; y: number; stemDown: boolean }

/** The mini staff is 34 px high: five lines 6.5 px apart, from y = 4 (top line) to y = 30 (bottom line). */
export const INCIPIT_HEIGHT = 34;
export const INCIPIT_LINES = [4, 10.5, 17, 23.5, 30];
const BOTTOM_LINE = 30;
const MIDDLE_LINE = 17;
/** One staff step: a line to the next space. */
const STEP = 3.25;
/** The contour spans the staff: steps 0 (bottom line) to 8 (top line). */
const TOP_STEP = 8;
const NOTES = 6;

/** The first six sounding notes; a note tied to the one before it is not counted again. */
function firstPitches(doc: Doc): number[] {
  const pitches: number[] = [];
  let tied = false;
  for (const bar of doc.score) {
    for (const e of bar.ev) {
      if (!e.r && !tied) pitches.push(e.m);
      tied = !e.r && e.tie;
      if (pitches.length === NOTES) return pitches;
    }
  }
  return pitches;
}

/** A contour made from the seed, for a sheet with fewer than two notes: the same seed always gives the same line. */
function generated(seed: string): number[] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const pitches: number[] = [];
  let p = 64;
  for (let k = 0; k < NOTES; k++) {
    p += [-3, -2, -1, 1, 2, 3][(h >>> (k * 3)) % 6];
    pitches.push(p);
  }
  return pitches;
}

/**
 * The incipit of a sheet: its first six notes as a relative pitch contour on the mini staff, not their real
 * staff positions. A narrow melody is centred, a wide one is squeezed onto the staff. Stems flip at the middle line.
 */
export function incipit(doc: Doc, seed: string): IncipitNote[] {
  let pitches = firstPitches(doc);
  if (pitches.length < 2) pitches = generated(seed);
  const lo = Math.min(...pitches);
  const span = Math.max(...pitches) - lo;
  const scale = span > TOP_STEP ? TOP_STEP / span : 1;
  const base = Math.floor((TOP_STEP - Math.round(span * scale)) / 2);
  return pitches.map((m, k) => {
    const y = BOTTOM_LINE - (base + Math.round((m - lo) * scale)) * STEP;
    return { x: Math.round(8 + (k * 84) / (pitches.length - 1)), y, stemDown: y < MIDDLE_LINE };
  });
}
