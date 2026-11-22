import { barCap, beatTicks, isSupportedTimeSig, newId, splitDuration } from './time';
import type { TimeSig } from './types';

it('bar capacities', () => { expect([[4,4],[3,4],[2,4],[6,8]].map(t => barCap(t as TimeSig))).toEqual([48,36,24,36]); });
it('beam groups', () => { expect(beatTicks([6,8])).toBe(18); expect(beatTicks([3,4])).toBe(12); });
it('supported meters', () => { expect(isSupportedTimeSig(5,4)).toBe(false); expect(isSupportedTimeSig(6,8)).toBe(true); });
it('splits durations greedily', () => {
  expect(splitDuration(48)).toEqual([48]);
  expect(splitDuration(30)).toEqual([24, 6]);
  expect(splitDuration(15)).toEqual([12, 3]);
  expect(splitDuration(21)).toEqual([18, 3]);
});
it('rejects off-grid durations', () => { expect(() => splitDuration(4)).toThrow(); });
it('generates unique ids', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()));
  expect(ids.size).toBe(1000);
  expect([...ids][0]).toMatch(/^e/);
});
