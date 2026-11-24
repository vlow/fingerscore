import { PILL_WIDTH, spreadPills } from './pillSpread';

describe('spreadPills', () => {
  it('leaves pills that are far enough apart where their charts are', () => {
    expect(spreadPills([100, 130, 200])).toEqual([100, 130, 200]);
    expect(spreadPills([100, 126])).toEqual([100, 126]);
  });

  it('moves two pills 20 px apart to 26 px apart around their middle', () => {
    expect(spreadPills([100, 120])).toEqual([97, 123]);
  });

  it('spreads a run of three notes 20 px apart around the middle one', () => {
    const out = spreadPills([100, 120, 140]);
    expect(out).toEqual([94, 120, 146]);
  });

  it('merges a spread run with the pill beside it, never closer than the gap', () => {
    const out = spreadPills([100, 120, 140, 160, 300, 310]);
    for (let i = 1; i < out.length; i++) expect(out[i]! - out[i - 1]!).toBeGreaterThanOrEqual(PILL_WIDTH);
    expect(out).toHaveLength(6);
    expect(out[0]! + out[3]!).toBeCloseTo(100 + 160, 5);   // the run of four stays centred on its notes
    expect(out.slice(4)).toEqual([292, 318]);
  });

  it('handles none and one pill', () => {
    expect(spreadPills([])).toEqual([]);
    expect(spreadPills([42])).toEqual([42]);
  });
});
