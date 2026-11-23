import { splitDuration } from '../domain/time';
import { canStartGroup, type Span } from '../domain/triplets';
import type { QNote } from './quantise';

/** A stretch of a bar that becomes one triplet group. `start` is an absolute tick. */
export interface Window { start: number; span: Span }

/** One event of a cut: a piece of a note, or a rest when `note` is null. */
export interface Piece { len: number; note: QNote | null }

/** The best cut of a bar, or the first triplet position that no cut explains. */
export type Cut = { windows: Window[] } | { unexplained: number };

const SPANS: readonly Span[] = [6, 12, 24];
const GRID = 3;

/** Member lengths on import, longest first. A quarter-triplet window holds only triplet quarters and halves. */
const IMPORT_MEMBERS: Record<Span, readonly number[]> = { 6: [4, 2], 12: [8, 4, 2], 24: [16, 8] };

function members(ticks: number, span: Span): number[] | null {
  const out: number[] = [];
  let rest = ticks;
  for (const m of IMPORT_MEMBERS[span]) {
    while (rest >= m) { out.push(m); rest -= m; }
  }
  return rest === 0 ? out : null;
}

/**
 * The events of [a, b): note pieces and the silence between them, each split by `split`.
 * Null when a length cannot be split. `notes` are sorted and do not overlap.
 */
function pieces(notes: QNote[], a: number, b: number, split: (ticks: number) => number[] | null): Piece[] | null {
  const out: Piece[] = [];
  let t = a;
  const add = (ticks: number, note: QNote | null): boolean => {
    const lens = split(ticks);
    if (!lens) return false;
    for (const len of lens) out.push({ len, note });
    return true;
  };
  for (const n of notes) {
    const s = Math.max(n.start, a);
    const e = Math.min(n.start + n.dur, b);
    if (e <= s) continue;
    if (s > t && !add(s - t, null)) return null;
    if (!add(e - s, n)) return null;
    t = e;
  }
  if (t < b && !add(b - t, null)) return null;
  return out;
}

const plainSplit = (ticks: number): number[] | null => (ticks % GRID === 0 ? splitDuration(ticks) : null);

/** The members of the window [start, start + span), or null when the notes and silence do not split into members. */
export function windowPieces(notes: QNote[], start: number, span: Span): Piece[] | null {
  return pieces(notes, start, start + span, ticks => members(ticks, span));
}

/** The plain events of [a, b), or null when a position inside is off the sixteenth grid. */
export function plainPieces(notes: QNote[], a: number, b: number): Piece[] | null {
  return pieces(notes, a, b, plainSplit);
}

/** Cost of a cut, compared in order: note events (ties made by cutting), all events, window span. */
type Cost = [number, number, number];
const less = (x: Cost, y: Cost): boolean => x[0] !== y[0] ? x[0] < y[0] : x[1] !== y[1] ? x[1] < y[1] : x[2] < y[2];
const costOf = (ps: Piece[], span: number): Cost => [ps.filter(p => p.note).length, ps.length, span];

/**
 * The cut of one bar with the fewest ties, then the fewest events, then the smallest window span (design 4.2).
 * Every note start or end off the sixteenth grid must lie inside a window. Ticks are absolute; `notes` are sorted
 * and do not overlap. A pickup bar counts window starts in metric ticks (`fullCap` − `cap` ahead).
 */
export function findWindows(notes: QNote[], barStart: number, cap: number, fullCap: number): Cut {
  const barEnd = barStart + cap;
  const shift = fullCap - cap;
  const inBar = notes.filter(n => n.start < barEnd && n.start + n.dur > barStart);
  // Boundaries: ticks on the sixteenth grid of the meter. best[i] is the cheapest cut of [barStart, bounds[i]).
  const bounds: number[] = [];
  for (let p = barStart; p <= barEnd; p++) if ((p - barStart + shift) % GRID === 0 || p === barEnd) bounds.push(p);
  const index = new Map(bounds.map((p, i) => [p, i]));
  const best: ({ cost: Cost; from: number; window: Window | null } | null)[] = bounds.map(() => null);
  best[0] = { cost: [0, 0, 0], from: -1, window: null };
  const offer = (to: number, from: number, step: Cost, window: Window | null) => {
    const prev = best[from];
    if (!prev) return;
    const cost: Cost = [prev.cost[0] + step[0], prev.cost[1] + step[1], prev.cost[2] + step[2]];
    const cur = best[to];
    if (!cur || less(cost, cur.cost)) best[to] = { cost, from, window };
  };
  for (let i = 0; i < bounds.length; i++) {
    if (!best[i]) continue;
    const p = bounds[i];
    for (let j = i + 1; j < bounds.length; j++) {
      const ps = plainPieces(inBar, p, bounds[j]);
      if (!ps) break;                       // a longer stretch holds the same off-grid position
      offer(j, i, costOf(ps, 0), null);
    }
    for (const span of SPANS) {
      const j = index.get(p + span);
      if (j === undefined || !canStartGroup(p - barStart + shift, span)) continue;
      const ps = windowPieces(inBar, p, span);
      if (ps) offer(j, i, costOf(ps, span), { start: p, span });
    }
  }
  const last = bounds.length - 1;
  if (!best[last]) {
    let reached = 0;
    best.forEach((b, i) => { if (b) reached = bounds[i]; });
    const positions = inBar.flatMap(n => [n.start, n.start + n.dur]).filter(t => t > reached && t < barEnd && t % GRID !== 0);
    if (positions.length === 0) throw new Error(`Bar at ${barStart} cannot be cut`);
    return { unexplained: Math.min(...positions) };
  }
  const windows: Window[] = [];
  for (let i = last; i > 0; i = best[i]!.from) {
    const w = best[i]!.window;
    if (w) windows.unshift(w);
  }
  return { windows };
}
