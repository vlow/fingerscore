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
  let i = 0;
  while (i < bars.length && order.length < cap) {
    const bar = bars[i];
    if ((bar.volta === '1' && pass > 1) || (bar.volta === '2' && pass > 2)) { i++; continue; }
    if (bar.rs && i !== start) { start = i; pass = 1; }
    order.push(i);
    if (bar.re && !taken.has(i)) {
      taken.add(i);
      pass += 1;
      i = start;
      continue;
    }
    const endsEndings = pass > 1 && bar.volta !== '' && (bars[i + 1]?.volta ?? '') === '';
    if (bar.re || endsEndings) { start = i + 1; pass = 1; }
    i++;
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

/** Tick of an event's first occurrence in play order (first pass of a repeat); null for an unknown id. */
export function firstTickOf(doc: Doc, evId: string): number | null {
  let t = 0;
  for (const bi of barOrder(doc)) {
    for (const ev of doc.score[bi].ev) {
      if (ev.id === evId) return t;
      t += ev.d;
    }
  }
  return null;
}

/**
 * The part of a schedule from tick `from` on, shifted to start at 0. Notes that end at or before
 * `from` are dropped; a note sounding across `from` keeps its remainder. The mark active at `from`
 * becomes the first mark, at 0, so the highlight starts on the event sounding there.
 */
export function sliceSchedule(s: Schedule, from: number): Schedule {
  const notes: SchedNote[] = [];
  for (const n of s.notes) {
    if (n.start + n.dur <= from) continue;
    notes.push(n.start < from ? { ...n, start: 0, dur: n.start + n.dur - from } : { ...n, start: n.start - from });
  }
  let active = -1;
  for (let k = 0; k < s.marks.length && s.marks[k].start <= from; k++) active = k;
  const marks: SchedMark[] = [];
  if (active >= 0) marks.push({ evId: s.marks[active].evId, start: 0 });
  for (const m of s.marks.slice(active + 1)) if (m.start > from) marks.push({ ...m, start: m.start - from });
  return { notes, marks, totalTicks: Math.max(0, s.totalTicks - from) };
}
