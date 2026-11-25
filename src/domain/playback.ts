import { jumpProblems, skippedEndings } from './jumps';
import { walkRepeats } from './repeats';
import type { Doc, Jump } from './types';

/** Ticks; midi is the sounding pitch (m + shift). */
export interface SchedNote { evId: string; start: number; dur: number; midi: number }
/** A highlight point: the event shown as playing from `start` until the next mark. Notes and rests both get one. */
export interface SchedMark { evId: string; start: number }
export interface Schedule { notes: SchedNote[]; marks: SchedMark[]; totalTicks: number }

export function ticksToSeconds(ticks: number, tempo: number): number {
  return (ticks * 60) / (tempo * 12);
}

/** The bars after a jump: no repeat is taken, and of a group of endings only the last one present is played. */
function playAfterJump(doc: Doc, jumpBar: number, order: number[], cuts: Set<number>, cap: number): void {
  const bars = doc.score;
  const jump = bars[jumpBar].jump as Jump;
  const skipped = skippedEndings(bars);
  const stopAtFine = !jump.endsWith('Coda') && bars.some(b => b.fine);
  const coda = bars.findIndex(b => b.coda);
  const viaCoda = jump.endsWith('Coda');
  let i = jump.startsWith('ds') ? bars.findIndex(b => b.segno) : 0;
  cuts.add(order.length); // the first bar after a jump starts fresh
  while (i >= 0 && i < bars.length && order.length < cap) {
    if (skipped[i]) { i++; continue; }
    order.push(i);
    if (stopAtFine && bars[i].fine) return;
    if (viaCoda && bars[i].toCoda) {
      cuts.add(order.length); // a tie does not carry from the To Coda into the Coda, also when the Coda is the next bar
      i = coda;
      continue;
    }
    i++;
  }
}

/**
 * Bar indices in play order, and the positions in that order where a jump starts (a tie does not carry across).
 * A jump mark (D.C., D.S.) is taken once, at the end of its bar, after that bar's repeat is played out;
 * a document whose marks do not add up plays without it (see `jumpProblems`).
 */
function playPlan(doc: Doc): { order: number[]; cuts: Set<number> } {
  const jumpBar = jumpProblems(doc).length === 0 ? doc.score.findIndex(b => b.jump) : -1;
  const { order, fired } = walkRepeats(doc, jumpBar);
  const cuts = new Set<number>();
  if (fired) playAfterJump(doc, jumpBar, order, cuts, 4 * doc.score.length);
  return { order, cuts };
}

/** Bar indices in play order: repeats, endings and the jump of D.C. and D.S. are followed. */
export function playOrder(doc: Doc): number[] {
  return playPlan(doc).order;
}

export function buildSchedule(doc: Doc): Schedule {
  const { order, cuts } = playPlan(doc);
  const notes: SchedNote[] = [];
  const marks: SchedMark[] = [];
  let t = 0;
  let open: SchedNote | null = null;
  let prevBar = -2;
  for (const [k, bi] of order.entries()) {
    const bar = doc.score[bi];
    if (bi !== prevBar + 1 || cuts.has(k)) open = null; // a jump cuts any tie chain
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
  for (const bi of playOrder(doc)) {
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
