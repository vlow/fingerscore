import { derive } from './derive';
import { DEFAULT_PREFS } from './transpose';
import { layoutSheet } from '../render/sheetLayout';
import { mkDoc, type BarSpec } from '../test/helpers';
import {
  READ_AT, SPEED, clampSpeed, fullLineBeats, leadIn, systemAt, systemBeats, fitZoom, shownZoom, zoomBelow, clampZoom, lineSeconds, pageCount, pageNumber, scrollSpeed, speedLabel, stepZoom, turnTarget,
} from './playMode';

const bars = (n: number, ticks: number): BarSpec[] => Array.from({ length: n }, () => ({ ev: [[67, ticks]] }));

describe('play mode maths', () => {
  const beatsOf = (doc: ReturnType<typeof mkDoc>) => systemBeats(doc, layoutSheet(doc, derive(doc, DEFAULT_PREFS)).systems);

  it('counts the quarter-note beats of every line', () => {
    // Nine bars of 4/4: two lines of four bars and a last line with one.
    expect(beatsOf(mkDoc(bars(9, 48)))).toEqual([16, 16, 4]);
    expect(beatsOf(mkDoc(bars(8, 36), [6, 8]))).toEqual([12, 12]);
  });

  it('names the pace by a full line, whatever a short last line holds', () => {
    expect(fullLineBeats([16, 16, 4])).toBe(16);
    expect(fullLineBeats([13, 16, 16, 16, 4])).toBe(16);
    expect(fullLineBeats([])).toBe(0);
  });

  it('finds the line at a height on the sheet', () => {
    // First line starts 200 px down, lines are 290 px apart, three lines.
    expect(systemAt(0, 200, 290, 3)).toBe(0);      // above the first line: the first line's pace
    expect(systemAt(200, 200, 290, 3)).toBe(0);
    expect(systemAt(489, 200, 290, 3)).toBe(0);
    expect(systemAt(490, 200, 290, 3)).toBe(1);
    expect(systemAt(5000, 200, 290, 3)).toBe(2);   // below the last line: the last line's pace
    expect(systemAt(100, 0, 0, 3)).toBe(0);        // nothing measured
    expect(systemAt(100, 0, 290, 0)).toBe(0);
  });

  it('holds the scroll until the music reaches the reading line, 35 % down the screen', () => {
    expect(READ_AT).toBe(0.35);
    expect(leadIn(1000)).toBe(350);
    expect(leadIn(0)).toBe(0);
  });

  it('offers more room to slow down than to speed up', () => {
    expect(SPEED).toEqual({ min: 25, max: 150, step: 5, initial: 100 });
  });

  it('gives a line 9.6 s at ♩ = 100 and 100 %, twice that at 50 %', () => {
    expect(lineSeconds(16, 100, 100)).toBeCloseTo(9.6);
    expect(lineSeconds(16, 100, 50)).toBeCloseTo(19.2);
  });

  it('scrolls one zoomed system per line time', () => {
    expect(scrollSpeed(16, 100, 100, 125, 290)).toBeCloseTo((290 * 1.25) / 9.6);
    expect(scrollSpeed(0, 100, 100, 125, 290)).toBe(0);
    // a sheet with marks has taller systems: one system per line time at the layout's height
    expect(scrollSpeed(16, 100, 100, 125, 320)).toBeCloseTo((320 * 1.25) / 9.6);
  });

  it('counts pages of 88 % of the visible height', () => {
    expect(pageCount(1000, 1000)).toBe(1);
    expect(pageCount(2760, 1000)).toBe(3);
    expect(pageCount(0, 0)).toBe(1);
    expect(pageNumber(0, 2760, 1000)).toBe(1);
    expect(pageNumber(880, 2760, 1000)).toBe(2);
    expect(pageNumber(1760, 2760, 1000)).toBe(3);
    expect(pageNumber(5000, 2760, 1000)).toBe(3);
    expect(pageNumber(0, 0, 0)).toBe(1);
  });

  it('turns by 88 % and stops at both ends', () => {
    expect(turnTarget(0, 2760, 1000, 1)).toBe(880);
    expect(turnTarget(1700, 2760, 1000, 1)).toBe(1760);
    expect(turnTarget(100, 2760, 1000, -1)).toBe(0);
  });

  it('steps the zoom by 25 between 75 and 200', () => {
    expect(stepZoom(125, 1)).toBe(150);
    expect(stepZoom(200, 1)).toBe(200);
    expect(stepZoom(75, -1)).toBe(75);
  });

  it('caps the zoom at the width of the screen', () => {
    expect(fitZoom(964)).toBeCloseTo(100);        // 940 px of paper + 24 px of padding
    expect(fitZoom(1024)).toBeCloseTo(106.38, 1);
    expect(fitZoom(0)).toBe(Infinity);            // not measured yet: no cap
    expect(shownZoom(125, fitZoom(1024))).toBeCloseTo(106.38, 1);
    expect(shownZoom(100, fitZoom(1024))).toBe(100);
    expect(shownZoom(125, Infinity)).toBe(125);
  });

  it('steps down from the size on screen to the next size on the grid', () => {
    expect(zoomBelow(125)).toBe(100);
    expect(zoomBelow(106.4)).toBe(100);
    expect(zoomBelow(100)).toBe(75);
    expect(zoomBelow(75)).toBe(75);
    expect(zoomBelow(40)).toBe(75);
  });

  it('falls back to the defaults for stored values it cannot use', () => {
    expect(clampZoom('x')).toBe(125);
    expect(clampZoom(300)).toBe(125);
    expect(clampZoom(150)).toBe(150);
    expect(clampSpeed(NaN)).toBe(100);
    expect(clampSpeed(20)).toBe(100);
    expect(clampSpeed(25)).toBe(25);
    expect(clampSpeed(200)).toBe(100);
    expect(clampSpeed(125)).toBe(125);
  });

  it('labels the speed', () => {
    expect(speedLabel(16, 100, 100)).toBe('100% · 1 line / 10 s');
    expect(speedLabel(16, 100, 50)).toBe('50% · 1 line / 19 s');
    expect(speedLabel(16, 100, 100, 7.2)).toBe('100% · starts in 8 s');
  });
});
