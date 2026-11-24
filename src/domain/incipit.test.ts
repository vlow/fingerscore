import { describe, expect, it } from 'vitest';
import { sampleDoc } from './fixture';
import { incipit, INCIPIT_LINES } from './incipit';
import type { Bar, Doc, Ev } from './types';

const ev = (id: string, m: number, patch: Partial<Ev> = {}): Ev => ({ id, m, d: 12, r: false, tie: false, l: '', ...patch });
const bar = (...events: Ev[]): Bar => ({ cap: events.reduce((n, e) => n + e.d, 0), rs: false, re: false, volta: '', ev: events });
const withScore = (...bars: Bar[]): Doc => ({ ...sampleDoc('asax'), score: bars });
const [TOP, , MIDDLE, , BOTTOM] = INCIPIT_LINES;

describe('incipit', () => {
  it('shows the first six notes, spread from 8% to 92% of the staff', () => {
    const notes = incipit(sampleDoc('asax'), 'id');
    expect(notes).toHaveLength(6);
    expect(notes.map(n => n.x)).toEqual([8, 25, 42, 58, 75, 92]);
  });

  it('skips rests and does not count a tied note twice', () => {
    const doc = withScore(
      bar(ev('a', 60, { r: true }), ev('b', 60, { tie: true }), ev('c', 60), ev('d', 64)),
      bar(ev('e', 67), ev('f', 72)),
    );
    const notes = incipit(doc, 'id');
    expect(notes).toHaveLength(4);
    // C, E, G, C: rising, so each note sits higher (smaller y) than the one before.
    expect(notes.map(n => n.y)).toEqual([...notes.map(n => n.y)].sort((a, b) => b - a));
  });

  it('is a contour: a higher pitch is never drawn lower, and every note stays on the staff', () => {
    const doc = withScore(bar(ev('a', 48), ev('b', 84), ev('c', 60), ev('d', 72)));
    const [low, high, c, c2] = incipit(doc, 'id');
    expect(low.y).toBe(BOTTOM);
    expect(high.y).toBe(TOP);
    expect(c.y).toBeLessThan(low.y);
    expect(c2.y).toBeLessThan(c.y);
    expect(c2.y).toBeGreaterThan(high.y);
  });

  it('centres a narrow melody on the staff', () => {
    const doc = withScore(bar(ev('a', 60), ev('b', 62), ev('c', 60)));
    const ys = incipit(doc, 'id').map(n => n.y);
    expect(Math.min(...ys)).toBeGreaterThan(TOP);
    expect(Math.max(...ys)).toBeLessThan(BOTTOM);
  });

  it('stems flip at the middle line: down above it, up on and below it', () => {
    const doc = withScore(bar(ev('a', 60), ev('b', 64), ev('c', 68)));
    for (const n of incipit(doc, 'id')) expect(n.stemDown).toBe(n.y < MIDDLE);
    expect(incipit(doc, 'id').map(n => n.stemDown)).toEqual([false, false, true]);
  });

  it('a sheet with fewer than two notes gets a contour generated from the seed', () => {
    const doc = withScore(bar(ev('a', 60, { r: true }), ev('b', 60)));
    const a = incipit(doc, 'seed-1');
    expect(a).toHaveLength(6);
    expect(incipit(doc, 'seed-1')).toEqual(a);
    expect(incipit(doc, 'another seed')).not.toEqual(a);
    for (const n of a) { expect(n.y).toBeGreaterThanOrEqual(TOP); expect(n.y).toBeLessThanOrEqual(BOTTOM); }
  });
});
