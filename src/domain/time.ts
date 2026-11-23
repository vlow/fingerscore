import type { TimeSig } from './types';

export const TPQ = 12;
export const PLAIN_LENGTHS = [48, 36, 24, 18, 12, 9, 6, 3] as const;
/** Kept under this name for existing callers; it means the plain lengths only. */
export const DURATIONS = PLAIN_LENGTHS;
/** Triplet lengths: the notated value (sixteenth, eighth, quarter, half) times 2/3. */
export const TRIPLET_LENGTHS = [16, 8, 4, 2] as const;

export const isPlainLength = (d: number): boolean => (PLAIN_LENGTHS as readonly number[]).includes(d);
export const isTripletLength = (d: number): boolean => (TRIPLET_LENGTHS as readonly number[]).includes(d);

export function barCap(ts: TimeSig): number {
  return ts[0] * (48 / ts[1]);
}

export function beatTicks(ts: TimeSig): number {
  if (ts[1] === 8) return 18;
  return ts[1] === 2 ? 24 : 12;
}

export function isSupportedTimeSig(n: number, d: number): boolean {
  return (n === 4 && d === 4) || (n === 3 && d === 4) || (n === 2 && d === 4) || (n === 6 && d === 8) || (n === 2 && d === 2);
}

export function splitDuration(ticks: number): number[] {
  if (!Number.isInteger(ticks) || ticks <= 0 || ticks % 3 !== 0) {
    throw new Error(`Duration ${ticks} is not on the 3-tick grid`);
  }
  const parts: number[] = [];
  let rest = ticks;
  for (const d of DURATIONS) {
    while (rest >= d) { parts.push(d); rest -= d; }
  }
  return parts;
}

let counter = 0;
const session = Math.random().toString(36).slice(2, 7);

export function newId(): string {
  counter += 1;
  return `e${session}${counter.toString(36)}`;
}
