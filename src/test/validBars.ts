import { expect } from 'vitest';
import { barCap, isPlainLength, isTripletLength } from '../domain/time';
import { tripletGroups } from '../domain/triplets';
import type { Bar, TimeSig } from '../domain/types';

/** Every bar is valid: plain or triplet lengths that sum to `cap`, every triplet length in a group. */
export function expectValidBars(bars: Bar[], ts: TimeSig): void {
  const full = barCap(ts);
  bars.forEach((b, i) => {
    const lengths = b.ev.map(e => e.d);
    const where = `bar ${i}: [${lengths.join(',')}] cap ${b.cap}`;
    expect(lengths.every(d => isPlainLength(d) || isTripletLength(d)), where).toBe(true);
    expect(lengths.reduce((s, d) => s + d, 0), where).toBe(b.cap);
    expect(tripletGroups(b, full), where).not.toBeNull();
  });
}
