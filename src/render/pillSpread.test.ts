import { hasPill, PILL_WIDTH, spreadPills } from './pillSpread';

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
