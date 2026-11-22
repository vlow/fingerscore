import { chooseFingerings, transitionCost } from './chooser';
import type { FingeringOption } from './fingerings';

const o = (h: number[], x: string[] = [], p = 0): FingeringOption => ({ h, x, n: '', p });

describe('chooseFingerings', () => {
  it('single option notes', () => {
    expect(chooseFingerings([{ id: 'a', written: 60, options: [o([1])] }], {})).toEqual({ a: 0 });
  });
  it('prefers the path with fewer finger changes', () => {
    const items = [
      { id: 'a', written: 60, options: [o([1, 1, 0])] },
      { id: 'b', written: 62, options: [o([0, 0, 1]), o([1, 1, 1], [], 0.4)] },
      { id: 'c', written: 60, options: [o([1, 1, 0])] },
    ];
    expect(chooseFingerings(items, {})).toEqual({ a: 0, b: 1, c: 0 });
  });
  it('penalises same-finger slides', () => {
    expect(transitionCost(o([1], ['tB']), o([1], ['tBb']))).toBe(2 + 3);
    expect(transitionCost(o([1], ['tB']), o([1], ['rEb']))).toBe(2);
  });
  it('avoids bis next to B natural', () => {
    const bb = { id: 'a', written: 70, options: [o([0, 1, 0], ['bis']), o([0, 1, 0], ['sBb'], 0.4)] };
    const b = { id: 'b', written: 71, options: [o([0, 1, 0])] };
    expect(chooseFingerings([bb, b], {}).a).toBe(1);
  });
  it('overrides are fixed points', () => {
    const n = (id: string) => ({ id, written: 60, options: [o([1]), o([0], [], 0.1)] });
    expect(chooseFingerings([n('a'), n('b')], { a: 1 })).toEqual({ a: 1, b: 1 });
  });
  it('ignores out-of-range overrides', () => {
    const n = { id: 'a', written: 60, options: [o([1]), o([0], [], 0.1)] };
    expect(chooseFingerings([n], { a: 5 })).toEqual({ a: 0 });
  });
  it('rests and notes without options break runs and never crash', () => {
    const r = chooseFingerings([null, { id: 'a', written: 10, options: [] }, { id: 'b', written: 60, options: [o([1])] }, null], {});
    expect(r).toEqual({ b: 0 });
    expect(chooseFingerings([], {})).toEqual({});
  });
  it('breaks runs at rests', () => {
    const a = { id: 'a', written: 71, options: [o([1])] };
    const bb = { id: 'b', written: 70, options: [o([0], ['bis']), o([0], ['sBb'], 0.4)] };
    expect(chooseFingerings([a, null, bb], {}).b).toBe(0);
  });
});
