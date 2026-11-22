import type { TimeSig } from './types';

export const TPQ = 12;
export const DURATIONS = [48, 36, 24, 18, 12, 9, 6, 3] as const;

export function barCap(ts: TimeSig): number {
  return ts[0] * (48 / ts[1]);
}

export function beatTicks(ts: TimeSig): number {
  return ts[1] === 8 ? 18 : 12;
}

export function isSupportedTimeSig(n: number, d: number): boolean {
  return (n === 4 && d === 4) || (n === 3 && d === 4) || (n === 2 && d === 4) || (n === 6 && d === 8);
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
