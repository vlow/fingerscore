import { describe, expect, it } from 'vitest';
import type { Bar } from './types';
import { groupOf, notatedLength, tripletGroups, tripletRestLayouts } from './triplets';
import { isPlainLength, isTripletLength } from './time';
import { lengthName } from './edit';

let n = 0;
function bar(lengths: number[], cap = 48, rests = false): Bar {
  return { cap, rs: false, re: false, volta: '', ev: lengths.map(d => ({ id: `t${n++}`, m: 60, d, r: rests, tie: false, l: '' })) };
}
/** Fills the bar to its capacity with plain lengths after the given ones. */
function filled(head: number[], cap = 48, rests = false): Bar {
  let left = cap - head.reduce((a, b) => a + b, 0);
  const tail: number[] = [];
  for (const d of [48, 36, 24, 18, 12, 9, 6, 3]) while (left >= d) { tail.push(d); left -= d; }
  return bar([...head, ...tail], cap, rests);
}
/** Same, but the plain lengths come first up to `at` ticks. */
function at(lead: number[], head: number[], cap = 48, rests = false): Bar {
  let left = cap - lead.concat(head).reduce((a, b) => a + b, 0);
  const tail: number[] = [];
  for (const d of [48, 36, 24, 18, 12, 9, 6, 3]) while (left >= d) { tail.push(d); left -= d; }
  return bar([...lead, ...head, ...tail], cap, rests);
}
const shape = (b: Bar, full = 48) => tripletGroups(b, full)?.map(g => [g.start, g.span]);

describe('triplet groups in 4/4', () => {
  it.each([
    [[4, 4, 4], [[0, 12]]], [[8, 4], [[0, 12]]], [[4, 8], [[0, 12]]],
    [[2, 2, 2], [[0, 6]]], [[4, 2], [[0, 6]]], [[2, 4], [[0, 6]]],
    [[2, 2, 2, 2, 2, 2], [[0, 6], [6, 6]]],
    [[8, 8, 8], [[0, 24]]], [[16, 8], [[0, 24]]], [[8, 16], [[0, 24]]],
    [Array(12).fill(4), [[0, 12], [12, 12], [24, 12], [36, 12]]],
    [[4, 4, 2, 2], [[0, 12]]], [[2, 2, 8], [[0, 12]]], [[8, 2, 2], [[0, 12]]],
    [[8, 4, 4, 8], [[0, 12], [12, 12]]],
  ])('%j from tick 0', (head, groups) => {
    expect(shape(filled(head as number[]))).toEqual(groups);
  });

  it.each([
    [[12], [8, 4], [[12, 12]]], [[6], [4, 4, 4], [[6, 12]]], [[3], [2, 2, 2], [[3, 6]]], [[12], [8, 8, 8], [[12, 24]]],
  ])('%j then %j', (lead, head, groups) => {
    expect(shape(at(lead as number[], head as number[]))).toEqual(groups);
  });

  it('a bar without triplets has no groups', () => {
    expect(tripletGroups(filled([]), 48)).toEqual([]);
  });

  it.each([
    ['two 4s then plain', filled([4, 4])], ['a lone 4', filled([4])], ['start 3 is not a multiple of 6', at([3], [4, 4, 4])],
    ['start 6 is not a multiple of 12', at([6], [8, 8, 8])], ['two 2s then plain', filled([2, 2])], ['a 16 then 2', filled([16, 2])],
  ])('refuses %s', (_n, b) => {
    expect(tripletGroups(b as Bar, 48)).toBeNull();
  });

  it('returns the member ids and finds a group by id', () => {
    const b = filled([4, 4, 4]);
    const g = tripletGroups(b, 48)!;
    expect(g[0].ids).toEqual(b.ev.slice(0, 3).map(e => e.id));
    expect(groupOf(g, b.ev[1].id)).toBe(g[0]);
    expect(groupOf(g, b.ev[3].id)).toBeNull();
  });

  it('rests as members give the same groups', () => {
    expect(shape(filled([8, 4, 4, 8], 48, true))).toEqual([[0, 12], [12, 12]]);
  });
});

describe('triplet groups in 6/8 and pickups', () => {
  it('6/8', () => {
    expect(shape(bar([4, 4, 4, 6, 6, 6, 6], 36), 36)).toEqual([[0, 12]]);
    expect(shape(bar([18, 4, 4, 4, 6], 36), 36)).toEqual([[18, 12]]);
  });

  it('pickups count metric ticks', () => {
    expect(shape(bar([4, 4, 4], 12), 48)).toEqual([[0, 12]]);
    expect(shape(bar([6, 4, 4, 4], 18), 48)).toEqual([[6, 12]]);
    expect(shape(bar([2, 2, 2], 6), 48)).toEqual([[0, 6]]);
    expect(shape(bar([3, 4, 4, 4], 15), 48)).toEqual([[3, 12]]);
  });

  it('a pickup start off the grid is refused', () => {
    expect(tripletGroups(bar([4, 4, 4, 12, 9], 33), 36)).toBeNull();
  });
});

describe('triplet helpers', () => {
  it('notated length', () => {
    expect([2, 4, 8, 16, 12].map(notatedLength)).toEqual([3, 6, 12, 24, 12]);
  });

  it('keeps the two lists apart', () => {
    expect([2, 4, 8, 16].some(isPlainLength)).toBe(false);
    expect([3, 6, 9, 12, 18, 24, 36, 48].some(isTripletLength)).toBe(false);
  });

  it('triplet rest layouts: fewest rests first, longest first among equals', () => {
    expect(tripletRestLayouts(8, 12)).toEqual([[8], [4, 4], [4, 2, 2], [2, 4, 2], [2, 2, 4], [2, 2, 2, 2]]);
    expect(tripletRestLayouts(6, 12)).toEqual([[4, 2], [2, 4], [2, 2, 2]]);
    expect(tripletRestLayouts(4, 6)).toEqual([[4], [2, 2]]);
    expect(tripletRestLayouts(12, 24)).toEqual([[8, 4], [4, 8], [4, 4, 4]]);
    expect(tripletRestLayouts(20, 24)[0]).toEqual([16, 4]);
    expect(tripletRestLayouts(3, 12)).toEqual([]);
  });

  it('spoken lengths', () => {
    expect([2, 4, 8, 16].map(lengthName)).toEqual(['triplet sixteenth', 'triplet eighth', 'triplet quarter', 'triplet half']);
    expect(lengthName(9)).toBe('dotted eighth');
  });
});
