import { hasPill, PILL_WIDTH, pillCentres, spreadPills } from './pillSpread';

const W = 860;

describe('spreadPills', () => {
  it('leaves pills that are far enough apart where their charts are', () => {
    expect(spreadPills([100, 130, 200], W)).toEqual([100, 130, 200]);
    expect(spreadPills([100, 126], W)).toEqual([100, 126]);
  });

  it('moves two pills 20 px apart to 26 px apart around their middle', () => {
    expect(spreadPills([100, 120], W)).toEqual([97, 123]);
  });

  it('spreads a run of three notes 20 px apart around the middle one', () => {
    expect(spreadPills([100, 120, 140], W)).toEqual([94, 120, 146]);
  });

  it('spreads a run of six notes 20 px apart around their middle, in order, 26 px apart', () => {
    const out = spreadPills([100, 120, 140, 160, 180, 200], W);
    expect(out).toEqual([85, 111, 137, 163, 189, 215]);
  });

  it('merges a spread run with the pill beside it, never closer than the gap', () => {
    const out = spreadPills([100, 120, 140, 160, 300, 310], W);
    for (let i = 1; i < out.length; i++) expect(out[i]! - out[i - 1]!).toBeGreaterThanOrEqual(PILL_WIDTH);
    expect(out[0]! + out[3]!).toBe(100 + 160);
    expect(out.slice(4)).toEqual([292, 318]);
  });

  it('keeps a run at the right edge inside the drawing and spreads it to the left', () => {
    const out = spreadPills([840, 850, 858], W);
    expect(out).toEqual([795, 821, 847]);
  });

  it('keeps a pill at the left edge inside the drawing', () => {
    expect(spreadPills([2, 10], W)).toEqual([13, 39]);
  });

  it('rounds fractional positions to whole pixels', () => {
    expect(spreadPills([100.4, 300.6], W)).toEqual([100, 301]);
    expect(spreadPills([100.3, 120.9], W)).toEqual([98, 124]);
  });

  it('handles none and one pill', () => {
    expect(spreadPills([], W)).toEqual([]);
    expect(spreadPills([42], W)).toEqual([42]);
  });
});

describe('hasPill', () => {
  it('is true from two options on', () => {
    expect(hasPill({ options: [] })).toBe(false);
    expect(hasPill({ options: [1] })).toBe(false);
    expect(hasPill({ options: [1, 2] })).toBe(true);
  });
});

describe('pillCentres', () => {
  const note = (id: string, x: number, options: number) => ({ id, x, options: Array.from({ length: options }, (_, k) => k) });

  it('gives no room to a note with one fingering between two notes with a pill', () => {
    const centres = pillCentres([note('a', 100, 2), note('b', 120, 1), note('c', 140, 3)], 860);
    expect([...centres.keys()]).toEqual(['a', 'c']);
    // 40 px apart: as if the middle note were not there. With a slot for it they would sit at 94 and 146.
    expect(centres.get('a')).toBe(100);
    expect(centres.get('c')).toBe(140);
  });

  it('spreads neighbours that both draw a pill', () => {
    const centres = pillCentres([note('a', 100, 2), note('b', 120, 2)], 860);
    expect([centres.get('a'), centres.get('b')]).toEqual([97, 123]);
  });
});

describe('spreadPills with more pills than room', () => {
  it('shares the width evenly between the bounds, in order, 40 pills on 860 px', () => {
    const out = spreadPills(Array.from({ length: 40 }, (_, i) => 20 * i + 50), 860);
    expect(out).toHaveLength(40);
    expect(out.slice(0, 4)).toEqual([13, 34, 56, 77]);
    expect(out[39]).toBe(847);
    expect(out.every((x, i) => x >= 13 && x <= 847 && (i === 0 || x > out[i - 1]!))).toBe(true);
  });

  it('puts two pills on 30 px at both bounds', () => {
    expect(spreadPills([5, 25], 30)).toEqual([13, 17]);
  });

  it('keeps the full gap when the pills just fit: 33 pills on 860 px', () => {
    const out = spreadPills(Array.from({ length: 33 }, () => 430), 860);
    expect(out[1]! - out[0]!).toBe(PILL_WIDTH);
    expect(out[0]).toBeGreaterThanOrEqual(13);
    expect(out[32]).toBeLessThanOrEqual(847);
  });
});
