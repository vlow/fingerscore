import { canStartGroup, MEMBER_LENGTHS, tripletRests, type Span } from '../domain/triplets';
import type { QNote } from './quantise';

/** A stretch of a bar that becomes one triplet group. `start` is an absolute tick. */
export interface Window { start: number; span: Span }

/** One member of a window: a piece of a note, or a rest when `note` is null. */
export interface Piece { len: number; note: QNote | null }

const SPANS: readonly Span[] = [6, 12, 24];
const onSixteenth = (tick: number): boolean => tick % 3 === 0;

function restsFor(ticks: number, span: Span): number[] | null {
  try { return tripletRests(ticks, span); } catch { return null; }
}

/**
 * The members of the window [start, start + span): each note piece as one member, silence as triplet rests.
 * Null when they do not tile the window with the span's member lengths. `notes` are sorted and do not overlap.
 */
export function windowPieces(notes: QNote[], start: number, span: Span): Piece[] | null {
  const end = start + span;
  const out: Piece[] = [];
  let t = start;
  const silence = (ticks: number): boolean => {
    const rests = restsFor(ticks, span);
    if (!rests) return false;
    for (const len of rests) out.push({ len, note: null });
    return true;
  };
  for (const n of notes) {
    const a = Math.max(n.start, start);
    const b = Math.min(n.start + n.dur, end);
    if (b <= a) continue;
    if (a > t && !silence(a - t)) return null;
    if (!MEMBER_LENGTHS[span].includes(b - a)) return null;
    out.push({ len: b - a, note: n });
    t = b;
  }
  if (t < end && !silence(end - t)) return null;
  return out;
}

/** The five conditions of a triplet group (design 4.2) for the window [start, start + span). */
function isGroup(notes: QNote[], start: number, span: Span): boolean {
  const end = start + span;
  const grid = span === 6 ? 2 : span / 6;
  let offSixteenth = false;
  for (const n of notes) {
    const stop = n.start + n.dur;
    const startsInside = n.start >= start && n.start < end;
    const endsInside = stop > start && stop <= end;
    for (const p of [startsInside ? n.start : null, endsInside ? stop : null]) {
      if (p === null) continue;
      if ((p - start) % grid !== 0) return false;                         // 1: on the window's grid
      if (!onSixteenth(p)) offSixteenth = true;
    }
    if (startsInside && stop > end && !onSixteenth(stop)) return false;   // 3: belongs to a larger group
    if (n.start < start && endsInside && !onSixteenth(n.start)) return false; // 4
  }
  return offSixteenth && windowPieces(notes, start, span) !== null;       // 2 and 5
}

/**
 * The triplet windows of one bar, left to right; at each allowed start the smallest span first.
 * Ticks are absolute; `notes` are sorted and do not overlap. A pickup bar counts its starts in metric ticks.
 */
export function findWindows(notes: QNote[], barStart: number, cap: number, fullCap: number): Window[] {
  const barEnd = barStart + cap;
  const shift = fullCap - cap;
  const inBar = notes.filter(n => n.start < barEnd && n.start + n.dur > barStart);
  const out: Window[] = [];
  let pos = barStart;
  while (pos < barEnd) {
    const at = pos;
    const span = SPANS.find(s => at + s <= barEnd && canStartGroup(at - barStart + shift, s) && isGroup(inBar, at, s));
    if (span) {
      out.push({ start: pos, span });
      pos += span;
    } else {
      pos += 3;
    }
  }
  return out;
}
