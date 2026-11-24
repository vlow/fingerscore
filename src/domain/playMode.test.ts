import { mkDoc, type BarSpec } from '../test/helpers';
import {
  beatsPerLine, clampSpeed, fitZoom, shownZoom, zoomBelow, clampZoom, lineSeconds, pageCount, pageNumber, scrollSpeed, speedLabel, stepZoom, turnTarget,
} from './playMode';

const bars = (n: number, ticks: number): BarSpec[] => Array.from({ length: n }, () => ({ ev: [[67, ticks]] }));

describe('play mode maths', () => {
  it('counts the quarter-note beats on an average line', () => {
    expect(beatsPerLine(mkDoc(bars(8, 48)), 2)).toBe(16);
    expect(beatsPerLine(mkDoc(bars(8, 36), [6, 8]), 2)).toBe(12);
    expect(beatsPerLine(mkDoc(bars(8, 48)), 0)).toBe(0);
  });

  it('gives a line 9.6 s at ♩ = 100 and 100 %, half of that at 200 %', () => {
    expect(lineSeconds(16, 100, 100)).toBeCloseTo(9.6);
    expect(lineSeconds(16, 100, 200)).toBeCloseTo(4.8);
  });

  it('scrolls one zoomed system per line time', () => {
    expect(scrollSpeed(16, 100, 100, 125)).toBeCloseTo((290 * 1.25) / 9.6);
    expect(scrollSpeed(0, 100, 100, 125)).toBe(0);
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
    expect(clampSpeed(175)).toBe(175);
  });

  it('labels the speed', () => {
    expect(speedLabel(16, 100, 100)).toBe('100% · 1 line / 10 s');
    expect(speedLabel(16, 100, 200)).toBe('200% · 1 line / 5 s');
  });
});
