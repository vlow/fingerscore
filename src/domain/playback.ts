import type { Doc } from './types';

/** Ticks; midi is the sounding pitch (m + shift). */
export interface SchedNote { evId: string; start: number; dur: number; midi: number }
export interface Schedule { notes: SchedNote[]; totalTicks: number }

export function ticksToSeconds(ticks: number, tempo: number): number {
  return (ticks * 60) / (tempo * 12);
}

/** Bar indices in play order, following repeats and first/second endings. */
function barOrder(doc: Doc): number[] {
  const order: number[] = [];
  let start = 0;
  let second = false;
  for (let i = 0; i < doc.score.length; i++) {
    const bar = doc.score[i];
    if (second && bar.volta === '1') {
      if (bar.re) second = false;
      continue;
    }
    if (bar.rs && !second) start = i;
    order.push(i);
    if (bar.re) {
      if (!second) {
        second = true;
        i = start - 1;
      } else {
        second = false;
      }
    }
  }
  return order;
}

export function buildSchedule(doc: Doc): Schedule {
  const order = barOrder(doc);
  const notes: SchedNote[] = [];
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
      } else {
        const midi = ev.m + doc.shift;
        if (open && open.midi === midi) {
          open.dur += ev.d;
        } else {
          open = { evId: ev.id, start: t, dur: ev.d, midi };
          notes.push(open);
        }
        if (!ev.tie) open = null;
      }
      t += ev.d;
    }
  }
  return { notes, totalTicks: t };
}
