import type { Bar } from './types';
import { isTripletLength } from './time';

export type Span = 6 | 12 | 24;

export interface TripletGroup {
  /** Tick from the bar start. */
  start: number;
  span: Span;
  ids: string[];
}

/** Member lengths of a group by span, longest first. */
export const MEMBER_LENGTHS: Record<Span, readonly number[]> = {
  6: [4, 2],
  12: [8, 4, 2],
  24: [16, 8, 4],
};

const SPANS: readonly Span[] = [6, 12, 24];

/** A group of span S may start on a multiple of S/2 in metric ticks. */
export function canStartGroup(metricTick: number, span: Span): boolean {
  return metricTick % (span / 2) === 0;
}

/** Length as written: a triplet length × 3/2, a plain length as it is. */
export function notatedLength(d: number): number {
  return isTripletLength(d) ? (d * 3) / 2 : d;
}

/**
 * Every ordering of member lengths of `span` that sums to `ticks`: fewest members first, longest-first order among
 * lists of equal count. Empty when no such list exists.
 */
export function tripletRestLayouts(ticks: number, span: Span): number[][] {
  const out: number[][] = [];
  const walk = (left: number, acc: number[]) => {
    if (left === 0) { out.push(acc); return; }
    for (const m of MEMBER_LENGTHS[span]) if (m <= left) walk(left - m, [...acc, m]);
  };
  walk(ticks, []);
  return out.sort((x, y) => x.length - y.length);   // stable: equal counts keep the longest-first order
}

/**
 * The triplet groups of a bar, left to right, or null when a triplet-valued event is in no group.
 * `fullCap` is the capacity of a full bar of the meter; a pickup counts its ticks so it ends on the bar line.
 */
export function tripletGroups(bar: Bar, fullCap: number): TripletGroup[] | null {
  const groups: TripletGroup[] = [];
  const shift = fullCap - bar.cap;
  const ev = bar.ev;
  let tick = 0;
  let i = 0;
  while (i < ev.length) {
    if (!isTripletLength(ev[i].d)) { tick += ev[i].d; i += 1; continue; }
    let found: TripletGroup | null = null;
    let next = i;
    for (const span of SPANS) {
      if (!canStartGroup(tick + shift, span)) continue;
      const members = MEMBER_LENGTHS[span];
      let sum = 0;
      let j = i;
      while (j < ev.length && sum < span && members.includes(ev[j].d)) { sum += ev[j].d; j += 1; }
      if (sum === span) {
        found = { start: tick, span, ids: ev.slice(i, j).map(e => e.id) };
        next = j;
        break;
      }
    }
    if (!found) return null;
    groups.push(found);
    tick += found.span;
    i = next;
  }
  return groups;
}

export function groupOf(groups: TripletGroup[], id: string): TripletGroup | null {
  return groups.find(g => g.ids.includes(id)) ?? null;
}
