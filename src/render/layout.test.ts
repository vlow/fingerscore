import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import { bar44of, bar68of, mkDoc, sixteenthBar } from '../test/helpers';
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
    expect(layoutSheet(doc68, derive(doc68, DEFAULT_PREFS)).beams.map(g => g.ids.length)).toEqual([3,3]);
    const doc44 = mkDoc([bar44of(6,6,3,3,6,12,12)]);
    expect(layoutSheet(doc44, derive(doc44, DEFAULT_PREFS)).beams.map(g => [g.ids.length, g.beams])).toEqual([[2,1],[3,'mixed']]);
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
});
