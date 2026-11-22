import type { RawNote } from './types';

/** Positions in ticks (12 per quarter) on the 3-tick grid (sixteenths). */
export interface QNote { start: number; dur: number; midi: number }

const GRID = 3;
const TPQ = 12;
const ROUND_LIMIT = 0.02; // quarter notes

const snap = (ticks: number): number => Math.round(ticks / GRID) * GRID;

export function quantise(notes: RawNote[]): { notes: QNote[]; simplified: boolean } {
  let simplified = false;
  const out = notes.map(n => {
    const start = snap(n.start * TPQ);
    const dur = Math.max(GRID, snap(n.dur * TPQ));
    if (Math.abs(start / TPQ - n.start) > ROUND_LIMIT || Math.abs(dur / TPQ - n.dur) > ROUND_LIMIT) simplified = true;
    return { start, dur, midi: n.midi };
  });
  out.sort((a, b) => a.start - b.start || a.midi - b.midi);
  return { notes: out, simplified };
}

/** One note at a time. Same onset: keep the top or bottom note. An earlier note still sounding is cut at the next onset. */
export function monophonic(notes: QNote[], keep: 'top' | 'bottom'): QNote[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
  const picked: QNote[] = [];
  for (const n of sorted) {
    const last = picked[picked.length - 1];
    if (last && last.start === n.start) {
      if (keep === 'top' ? n.midi > last.midi : n.midi < last.midi) picked[picked.length - 1] = n;
      // same-onset notes arrive ascending: top takes a later (higher) one, bottom keeps the first
    } else {
      picked.push(n);
    }
  }
  return picked.map((n, i) => {
    const next = picked[i + 1];
    const dur = next ? Math.min(n.dur, next.start - n.start) : n.dur;
    return { ...n, dur };
  });
}
