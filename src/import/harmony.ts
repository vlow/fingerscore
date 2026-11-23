import type { TimeSig } from '../domain/types';
import { ROOT_NAMES } from './chordNames';
import type { RawNote } from './types';

/** Tried in this order; on equal scores the earlier one wins, so a triad beats a seventh chord that has no seventh. */
const TEMPLATES: { suffix: string; degrees: number[] }[] = [
  { suffix: '', degrees: [0, 4, 7] },
  { suffix: 'm', degrees: [0, 3, 7] },
  { suffix: '7', degrees: [0, 4, 7, 10] },
];
const EPS = 1e-9;

/** Window length in quarter notes: half a bar in 4/4 and 6/8, a whole bar in 3/4 and 2/4. */
function windowLength(ts: TimeSig): number {
  const bar = (ts[0] * 4) / ts[1];
  return ts[0] === 4 || ts[1] === 8 || (ts[0] === 2 && ts[1] === 2) ? bar / 2 : bar;
}

function bestChord(weights: number[]): string | null {
  if (weights.filter(w => w > 0).length < 2) return null;
  const total = weights.reduce((a, b) => a + b, 0);
  let best: { text: string; score: number } | null = null;
  for (let root = 0; root < 12; root++) {
    for (const t of TEMPLATES) {
      const inside = t.degrees.reduce((a, d) => a + weights[(root + d) % 12], 0);
      const score = inside - (total - inside);
      if (!best || score > best.score + EPS) best = { text: ROOT_NAMES[root] + t.suffix, score };
    }
  }
  return best ? best.text : null;
}

/** Chord symbols for a track of sounding notes, one per window, emitted when the chord changes. `at` is in quarter notes. */
export function detectChords(notes: RawNote[], ts: TimeSig, pickup: number, totalQuarters: number): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = [];
  const windows: [number, number][] = [];
  if (pickup > 0) windows.push([0, pickup]);
  const len = windowLength(ts);
  for (let s = Math.max(0, pickup); s < totalQuarters - EPS; s += len) windows.push([s, Math.min(s + len, totalQuarters)]);

  let previous = '';
  for (const [from, to] of windows) {
    const weights = new Array<number>(12).fill(0);
    for (const n of notes) {
      const overlap = Math.min(n.start + n.dur, to) - Math.max(n.start, from);
      if (overlap > EPS) weights[((n.midi % 12) + 12) % 12] += overlap;
    }
    const text = bestChord(weights);
    if (text !== null && text !== previous) {
      out.push({ at: from, text });
      previous = text;
    }
  }
  return out;
}
