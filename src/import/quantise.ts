import type { RawNote } from './types';

/**
 * Positions in whole ticks (12 per quarter). Not always on the sixteenth grid: triplets need ticks of 2 and 4.
 * `roundedStart` / `roundedEnd` (present only when true): that edge was rounded to the sixteenth grid, not taken as exact.
 */
export interface QNote { start: number; dur: number; midi: number; roundedStart?: true; roundedEnd?: true }

/** The note with the given rounding marks; a mark that is false is left out. */
export function withEdges(n: QNote, roundedStart: boolean, roundedEnd: boolean): QNote {
  const out: QNote = { start: n.start, dur: n.dur, midi: n.midi };
  if (roundedStart) out.roundedStart = true;
  if (roundedEnd) out.roundedEnd = true;
  return out;
}

const GRID = 3;
const TPQ = 12;
const ROUND_LIMIT = 0.02;    // quarter notes: rounding by more than this marks the song simplified
const EXACT_LIMIT = 0.005;   // quarter notes: a position this near a whole tick is kept as that tick

/**
 * The nearest whole tick when it is within EXACT_LIMIT, otherwise the nearest sixteenth (`rounded`).
 * `moved`: rounded by more than ROUND_LIMIT.
 */
function snap(quarters: number): { tick: number; rounded: boolean; moved: boolean } {
  const ticks = quarters * TPQ;
  const whole = Math.round(ticks);
  if (Math.abs(whole - ticks) <= EXACT_LIMIT * TPQ) return { tick: whole, rounded: false, moved: false };
  const sixteenth = Math.round(ticks / GRID) * GRID;
  return { tick: sixteenth, rounded: true, moved: Math.abs(sixteenth - ticks) > ROUND_LIMIT * TPQ };
}

export function quantise(notes: RawNote[]): { notes: QNote[]; simplified: boolean } {
  let simplified = false;
  const out = notes.map(n => {
    const start = snap(n.start);
    const end = snap(n.start + n.dur);
    if (start.moved || end.moved) simplified = true;
    return withEdges({ start: start.tick, dur: Math.max(1, end.tick - start.tick), midi: n.midi }, start.rounded, end.rounded);
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
    if (!next || n.dur <= next.start - n.start) return n;
    // cut at the next onset: the end is as exact as that onset
    return withEdges({ ...n, dur: next.start - n.start }, n.roundedStart === true, next.roundedStart === true);
  });
}
