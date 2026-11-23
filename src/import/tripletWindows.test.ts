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
    expect(findWindows(run(0, 4, 4, 4, 12, 24), 0, 48, 48)).toMatchObject({ windows: [{ start: 0, span: 12 }] });
  });
  it('takes the quarter-triplet window for three triplet quarters', () => {
    expect(findWindows(run(0, 8, 8, 8, 24), 0, 48, 48)).toMatchObject({ windows: [{ start: 0, span: 24 }] });
  });
  it('six triplet sixteenths: two sixteenth-triplet windows cost the same as one eighth-triplet window; the first found is kept', () => {
    expect(findWindows(run(0, 2, 2, 2, 2, 2, 2, 36), 0, 48, 48)).toMatchObject({ windows: [{ start: 0, span: 12 }] });
  });
  it('prefers one eighth-triplet window to a sixteenth-triplet window and a tie', () => {
    expect(findWindows(run(0, 4, 8, 36), 0, 48, 48)).toMatchObject({ windows: [{ start: 0, span: 12 }] });
  });
  it('never holds triplet eighths in a quarter-triplet window', () => {
    expect(findWindows(run(0, 16, 4, 4, 24), 0, 48, 48)).toMatchObject({ windows: [{ start: 12, span: 12 }] });
  });
  it('names the first position that no cut explains', () => {
    expect(findWindows(run(0, 12, 1, 11, 24), 0, 48, 48)).toEqual({ unexplained: 13 });
  });
  it('finds nothing in plain rhythms', () => {
    expect(findWindows(run(0, 3, 3, 3, 3, 9, 3, 24), 0, 48, 48)).toMatchObject({ windows: [] });
  });
  it('gives absolute starts in a later bar', () => {
    expect(findWindows(run(48, 12, 4, 4, 4, 24), 48, 48, 48)).toMatchObject({ windows: [{ start: 60, span: 12 }] });
  });
  it('counts a pickup in metric ticks: an eighth triplet may start on its "and"', () => {
    expect(findWindows(run(0, 6, 4, 4, 4), 0, 18, 48)).toMatchObject({ windows: [{ start: 6, span: 12 }] });
  });
  it('ignores notes outside the bar and never crosses the bar line', () => {
    expect(findWindows(run(0, 4, 4, 4, 36), 48, 48, 48)).toMatchObject({ windows: [] });
    expect(findWindows(run(36, 8, 8, 8), 0, 48, 48)).toMatchObject({ windows: [{ start: 36, span: 12 }] });   // not [36, 60)
  });
});
