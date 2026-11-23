import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { TimeSig } from '../domain/types';
import { bar44of, bar68of, mkDoc, sixteenthBar, type BarSpec, type EvSpec } from '../test/helpers';
import { SHEET, headerWidth, layoutSheet } from './layout';

describe('layoutSheet', () => {
  it('plain 4/4 song: four equal bars per system as in the prototype', () => {
    const doc = sampleDoc('xc'); const L = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
    expect(L.systems).toHaveLength(5);                                   // 17 bars
    expect(L.systems.slice(0,4).every(s => s.bars.length === 4)).toBe(true);
    const w = L.systems[1].bars.map(b => b.width); expect(Math.max(...w) - Math.min(...w)).toBeLessThan(0.01);
    expect(L.systems[0].showTimeSig).toBe(true); expect(L.systems[1].barNumber).toBe(4);      // pickup is bar 0 and unnumbered; system 2 starts at score index 4 = bar 4
    expect(L.systems[4].bars[0].width).toBeCloseTo(L.systems[3].bars[0].width, 0);            // last system is not stretched
  });
  it('sixteenths reduce bars per system', () => {
    const doc = mkDoc([sixteenthBar(), sixteenthBar(), sixteenthBar(), sixteenthBar()]);       // 16 × d=3 each
    const L = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
    expect(L.systems[0].bars.length).toBe(2);
    expect(L.systems.every(s => s.bars.length < 4)).toBe(true);
    for (const s of L.systems) for (const b of s.bars) {
      for (let k = 1; k < b.events.length; k++) expect(b.events[k].x - b.events[k - 1].x).toBeGreaterThanOrEqual(20);
    }
  });
  it.each([
    ['one sharp', sampleDoc('asax'), 1],
    ['five flats', { ...sampleDoc('asax'), shift: 2 }, -5],                 // written D♭ major
  ])('eighth-note song with %s: four equal bars on every full system', (_, doc, sig) => {
    const d = derive(doc, DEFAULT_PREFS); const L = layoutSheet(doc, d);
    expect(d.sig).toBe(sig);
    const full = L.systems.slice(0, -1);
    expect(full.every(s => s.bars.length === 4)).toBe(true);
    for (const s of full) {
      const w = s.bars.map(b => b.width); expect(Math.max(...w) - Math.min(...w)).toBeLessThan(0.01);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(SHEET.systemWidth - s.headerWidth, 6);
    }
  });
  it('beams follow the meter', () => {
    const doc68 = mkDoc([bar68of(6,6,6,6,6,6)], [6,8]);
    expect(layoutSheet(doc68, derive(doc68, DEFAULT_PREFS)).beams.flat().map(g => g.ids.length)).toEqual([3,3]);
    const doc44 = mkDoc([bar44of(6,6,3,3,6,12,12)]);
    expect(layoutSheet(doc44, derive(doc44, DEFAULT_PREFS)).beams.flat().map(g => [g.ids.length, g.beams])).toEqual([[2,1],[3,'mixed']]);
  });
  it('beams in 2/2 group four eighths per half-note beat', () => {
    const doc = mkDoc([{ ev: Array.from({ length: 8 }, () => [64, 6] as [number, number]) }], [2,2]);
    expect(layoutSheet(doc, derive(doc, DEFAULT_PREFS)).beams.flat().map(g => g.ids.length)).toEqual([4,4]);
  });
  it('first system has no number; without a pickup bars count from 1', () => {
    const doc = mkDoc([bar44of(12,12,12,12), bar44of(12,12,12,12), bar44of(12,12,12,12), bar44of(12,12,12,12), bar44of(48)]);
    const L = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
    expect(L.systems.map(s => s.barNumber)).toEqual([null, 5]);
    expect(L.systems.map(s => s.showTimeSig)).toEqual([true, false]);
  });
  it('places notes on the staff and centres a whole-bar rest', () => {
    const doc = mkDoc([{ ev: [[64, 24], [71, 24]] }, { ev: [[0, 48]] }]);   // E4 bottom line, B4 middle line
    const L = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
    const [b0, b1] = L.systems[0].bars;
    expect(b0.x).toBe(headerWidth(0, true));
    expect(b0.events.map(e => e.y)).toEqual([SHEET.staffBottom, SHEET.staffBottom - 20]);
    expect(b0.events[0].x).toBe(b0.x + SHEET.barPad);
    expect(b1.events[0]).toMatchObject({ x: b1.x + b1.width / 2, y: SHEET.staffBottom - 20 });
  });
  it('header widths match the prototype', () => {
    expect(headerWidth(0, true)).toBe(68);
    expect(headerWidth(0, false)).toBe(42);
    expect(headerWidth(-5, false)).toBe(97);   // 11px per Bravura key-signature accidental
  });

  describe('triplets', () => {
    const N = 67;
    const bar = (...specs: (number | 'r')[]): BarSpec => ({ ev: specs.map((d): EvSpec => d === 'r' ? [0, 4] : [N, d]) });
    const run = (bars: BarSpec[], ts: TimeSig = [4, 4]) => {
      const doc = mkDoc(bars, ts);
      const d = derive(doc, DEFAULT_PREFS);
      const sheet = layoutSheet(doc, d);
      return { doc, d, L: { ...sheet, beams: sheet.beams.flat(), tuplets: sheet.tuplets.flat() } };
    };
    const idsOf = (d: ReturnType<typeof derive>, ...idx: number[]) => idx.map(i => d.events[i].id);

    it('three triplet eighths: one beam of one level, the number stands alone', () => {
      const { d, L } = run([bar(4, 4, 4, 12, 24)]);
      expect(L.beams).toEqual([{ ids: idsOf(d, 0, 1, 2), beams: 1 }]);
      expect(L.tuplets).toEqual([{ bar: 0, ids: idsOf(d, 0, 1, 2), beamed: true }]);
    });
    it('triplet sixteenths: two groups, two beams each', () => {
      const { d, L } = run([bar(2, 2, 2, 2, 2, 2, 12, 24)]);
      expect(L.beams).toEqual([{ ids: idsOf(d, 0, 1, 2), beams: 2 }, { ids: idsOf(d, 3, 4, 5), beams: 2 }]);
      expect(L.tuplets.map(t => t.beamed)).toEqual([true, true]);
    });
    it('a long-short figure has no beam and a bracket', () => {
      const { L } = run([bar(8, 4, 12, 24)]);
      expect(L.beams).toEqual([]);
      expect(L.tuplets).toHaveLength(1);
      expect(L.tuplets[0].beamed).toBe(false);
    });
    it('a rest inside a group breaks the beam; the mark gets a bracket', () => {
      const { L } = run([bar(4, 'r', 4, 12, 24)]);
      expect(L.beams).toEqual([]);
      expect(L.tuplets[0].beamed).toBe(false);
    });
    it('mixed values beam as one group with a stub-capable mixed beam', () => {
      const { d, L } = run([bar(4, 4, 2, 2, 24, 12)]);
      expect(L.beams).toEqual([{ ids: idsOf(d, 0, 1, 2, 3), beams: 'mixed' }]);
      expect(L.tuplets).toEqual([{ bar: 0, ids: idsOf(d, 0, 1, 2, 3), beamed: true }]);
    });
    it('a group beams across the beat boundary inside it (6/8, ticks 12 to 24)', () => {
      const { d, L } = run([bar(12, 4, 4, 4, 12)], [6, 8]);
      expect(L.beams).toEqual([{ ids: idsOf(d, 1, 2, 3), beams: 1 }]);
      expect(L.tuplets[0].beamed).toBe(true);
    });
    it('a plain eighth never beams with a triplet eighth', () => {
      const { d, L } = run([bar(6, 6, 4, 4, 4, 12, 12), bar(6, 4, 4, 4, 6, 12, 12)]);
      expect(L.beams).toEqual([
        { ids: idsOf(d, 0, 1), beams: 1 },
        { ids: idsOf(d, 2, 3, 4), beams: 1 },
        { ids: idsOf(d, 8, 9, 10), beams: 1 },
      ]);
    });
    it('plain eighths still beam by beat', () => {
      const doc = mkDoc([bar68of(6, 6, 6, 6, 6, 6), bar68of(6, 6, 6, 6, 6, 6)], [6, 8]);
      expect(layoutSheet(doc, derive(doc, DEFAULT_PREFS)).beams.flat().map(g => g.ids.length)).toEqual([3, 3, 3, 3]);
    });
    it('a bar of 24 twos: increasing x, eight beam groups of three', () => {
      const { L } = run([bar(...Array<number>(24).fill(2))]);
      const xs = L.systems.flatMap(s => s.bars.flatMap(b => b.events.map(e => e.x)));
      expect(xs).toHaveLength(24);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      expect(L.beams.map(g => g.ids.length)).toEqual(Array<number>(8).fill(3));
      expect(L.tuplets).toHaveLength(8);
    });
    it('triplet bars are wider than plain eighth bars', () => {
      const plain = run(Array.from({ length: 4 }, () => bar44of(6, 6, 6, 6, 6, 6, 6, 6)));
      expect(plain.L.systems[0].bars).toHaveLength(4);
      const eighths = run(Array.from({ length: 6 }, () => bar(4, 4, 4, 12, 24)));
      expect(eighths.L.systems.every(s => s.bars.length < 4)).toBe(true);
      expect(eighths.L.systems.slice(0, -1).every(s => s.bars.length >= 2)).toBe(true);
      const sixteenths = run(Array.from({ length: 3 }, () => bar(...Array<number>(24).fill(2))));
      expect(sixteenths.L.systems.map(s => s.bars.length)).toEqual([1, 1, 1]);
    });
  });
});
