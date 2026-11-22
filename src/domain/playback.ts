import type { Doc } from './types';

/** Ticks; midi is the sounding pitch (m + shift). */
export interface SchedNote { evId: string; start: number; dur: number; midi: number }
/** A highlight point: the event shown as playing from `start` until the next mark. Notes and rests both get one. */
export interface SchedMark { evId: string; start: number }
export interface Schedule { notes: SchedNote[]; marks: SchedMark[]; totalTicks: number }

export function ticksToSeconds(ticks: number, tempo: number): number {
  return (ticks * 60) / (tempo * 12);
}

/**
 * Bar indices in play order, following repeats and endings.
 * A section starts at a bar with a start-repeat mark, at bar 0, or after a finished repeat.
 * Each end-repeat mark jumps back to its section start once; every jump starts the next pass.
 * A first-ending bar plays only on pass 1, a second-ending bar only on passes 1–2, so
 * `A | 1.(re) | 2.(re) | 3.` plays A 1. A 2. A 3. (ending 3 has no volta in the doc).
 * The order is capped at 4 × the bar count as a safety net.
 */
function barOrder(doc: Doc): number[] {
  const bars = doc.score;
  const cap = 4 * bars.length;
  const order: number[] = [];
  const taken = new Set<number>();
  let start = 0;
  let pass = 1;
  for (let i = 0; i < bars.length && order.length < cap; i++) {
    const bar = bars[i];
    if ((bar.volta === '1' && pass > 1) || (bar.volta === '2' && pass > 2)) continue;
    if (bar.rs && i !== start) { start = i; pass = 1; }
    order.push(i);
    if (bar.re && !taken.has(i)) {
      taken.add(i);
      pass += 1;
      i = start - 1;
      continue;
    }
    const endsEndings = pass > 1 && bar.volta !== '' && (bars[i + 1]?.volta ?? '') === '';
    if (bar.re || endsEndings) { start = i + 1; pass = 1; }
  }
  return order;
}

export function buildSchedule(doc: Doc): Schedule {
  const order = barOrder(doc);
  const notes: SchedNote[] = [];
  const marks: SchedMark[] = [];
  let t = 0;
  let open: SchedNote | null = null;
  let prevBar = -2;
  for (const bi of order) {
    const bar = doc.score[bi];
    if (bi !== prevBar + 1) open = null; // a jump cuts any tie chain
    prevBar = bi;
    for (const ev of bar.ev) {
      if (ev.r) {
        open = null;
        marks.push({ evId: ev.id, start: t });
      } else {
        const midi = ev.m + doc.shift;
        if (open && open.midi === midi) {
          open.dur += ev.d;
        } else {
          open = { evId: ev.id, start: t, dur: ev.d, midi };
          notes.push(open);
          marks.push({ evId: ev.id, start: t });
        }
        if (!ev.tie) open = null;
      }
      t += ev.d;
    }
  }
  return { notes, marks, totalTicks: t };
}
