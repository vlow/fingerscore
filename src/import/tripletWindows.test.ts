import { describe, expect, it } from 'vitest';
import type { QNote } from './quantise';
import { findWindows } from './tripletWindows';

/** Notes back to back from `start`, lengths in ticks. */
function run(start: number, ...lengths: number[]): QNote[] {
  let t = start;
  return lengths.map(d => { const q = { start: t, dur: d, midi: 60 }; t += d; return q; });
}

describe('findWindows', () => {
  it('finds an eighth triplet on a beat', () => {
    expect(findWindows(run(0, 4, 4, 4, 12, 24), 0, 48, 48)).toEqual([{ start: 0, span: 12 }]);
  });
  it('takes the quarter-triplet window for three triplet quarters', () => {
    expect(findWindows(run(0, 8, 8, 8, 24), 0, 48, 48)).toEqual([{ start: 0, span: 24 }]);
  });
  it('takes two sixteenth-triplet windows for six triplet sixteenths', () => {
    expect(findWindows(run(0, 2, 2, 2, 2, 2, 2, 36), 0, 48, 48)).toEqual([{ start: 0, span: 6 }, { start: 6, span: 6 }]);
  });
  it('finds nothing in plain rhythms', () => {
    expect(findWindows(run(0, 3, 3, 3, 3, 9, 3, 24), 0, 48, 48)).toEqual([]);
  });
  it('gives absolute starts in a later bar', () => {
    expect(findWindows(run(48, 12, 4, 4, 4, 24), 48, 48, 48)).toEqual([{ start: 60, span: 12 }]);
  });
  it('counts a pickup in metric ticks: an eighth triplet may start on its "and"', () => {
    expect(findWindows(run(0, 6, 4, 4, 4), 0, 18, 48)).toEqual([{ start: 6, span: 12 }]);
  });
  it('ignores notes outside the bar and never crosses the bar line', () => {
    expect(findWindows(run(0, 4, 4, 4, 36), 48, 48, 48)).toEqual([]);
    expect(findWindows(run(36, 4, 4, 4), 0, 44, 48)).toEqual([]);
  });
});
