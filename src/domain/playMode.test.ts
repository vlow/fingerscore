import { derive } from './derive';
import { DEFAULT_PREFS } from './transpose';
import { layoutSheet } from '../render/sheetLayout';
import { mkDoc, type BarSpec } from '../test/helpers';
import {
  READ_AT, SCALE_TEMPO, SPEED, clampSpeed, sheetLines, fullLineBeats, leadIn, systemAt, systemBeats, fitZoom, shownZoom, zoomBelow, clampZoom, lineSeconds, pageCount, pageNumber, scrollSpeed, speedLabel, stepZoom, turnTarget,
} from './playMode';

const bars = (n: number, ticks: number): BarSpec[] => Array.from({ length: n }, () => ({ ev: [[67, ticks]] }));

describe('play mode maths', () => {
  const beatsOf = (doc: ReturnType<typeof mkDoc>) => systemBeats(doc, layoutSheet(doc, derive(doc, DEFAULT_PREFS)).systems);

  it('counts the quarter-note beats of every line', () => {
    // Nine bars of 4/4: two lines of four bars and a last line with one.
    expect(beatsOf(mkDoc(bars(9, 48)))).toEqual([16, 16, 4]);
    expect(beatsOf(mkDoc(bars(8, 36), [6, 8]))).toEqual([12, 12]);
  });

  it('gives every system of a sheet its beats and the layout\'s system height', () => {
    const doc = mkDoc(bars(9, 48));
    const layout = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
    expect(sheetLines(doc, layout.systems, layout.systemHeight)).toEqual([16, 16, 4].map(beats => ({ beats, height: layout.systemHeight })));
  });

  it('paces a scale at one note per beat: a full line of 15 notes takes 15 s at 100 %', () => {
    expect(lineSeconds(15, SCALE_TEMPO, 100)).toBe(15);
    expect(speedLabel(15, SCALE_TEMPO, 50)).toBe('50% · 1 line / 30 s');
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

  it('shows the last page at the end of the sheet', () => {
    // 11119 px to scroll, turns of 675.84 px: 16 full turns and a short one to the end
    expect(pageCount(11887, 768)).toBe(18);
    expect(pageNumber(11119, 11887, 768)).toBe(18);
    expect(pageNumber(16 * 0.88 * 768, 11887, 768)).toBe(17);
    expect(pageNumber(11118.6, 11887, 768)).toBe(18); // a scrollTop a fraction of a pixel short of the end
  });

  it('does not count a last turn of a few pixels as a page', () => {
    // 1780 px to scroll, turns of 880 px: the 20 px left after two turns join the page before
    expect(pageCount(2780, 1000)).toBe(3);
    expect(turnTarget(880, 2780, 1000, 1)).toBe(1780);
    expect(pageNumber(1780, 2780, 1000)).toBe(3);
    expect(pageCount(1030, 1000)).toBe(1);
  });

  it('turns by 88 % and stops at both ends', () => {
    expect(turnTarget(0, 2760, 1000, 1)).toBe(880);
    expect(turnTarget(1700, 2760, 1000, 1)).toBe(1760);
    expect(turnTarget(100, 2760, 1000, -1)).toBe(0);
  });

  it('turns back from the end to the start of the page before', () => {
    // 1890 px to scroll: pages start at 0, 880 and 1760, the last page at the end
    expect(pageCount(2890, 1000)).toBe(4);
    expect(turnTarget(1890, 2890, 1000, -1)).toBe(1760);
    expect(pageNumber(1760, 2890, 1000)).toBe(3);
  });

  it('turns from a scrolled position to the next page start', () => {
    // a wheel left the sheet between the starts of page 2 (880) and page 3 (1760)
    expect(turnTarget(1000, 2760, 1000, 1)).toBe(1760);
    expect(turnTarget(1000, 2760, 1000, -1)).toBe(880);
    expect(pageNumber(1000, 2760, 1000)).toBe(2);
  });

  it('shows every page in order, forward and back, whatever the sizes', () => {
    // Browsers round scrollTop: to whole pixels, or to half pixels on a high-density screen.
    const roundings = [(x: number) => Math.round(x), (x: number) => Math.round(x * 2) / 2];
    const wrong: string[] = [];
    for (const round of roundings) {
      for (let scrollHeight = 3000; scrollHeight <= 15000; scrollHeight += 53) {
        for (let clientHeight = 400; clientHeight <= 2000; clientHeight += 41) {
          const of = pageCount(scrollHeight, clientHeight);
          const shown: number[] = [];
          let top = 0;
          for (let i = 0; i < of + 1; i++) {
            shown.push(pageNumber(top, scrollHeight, clientHeight));
            const next = round(turnTarget(top, scrollHeight, clientHeight, 1));
            if (next - top >= clientHeight) wrong.push(`${scrollHeight}/${clientHeight}: a turn skips lines`);
            top = next;
          }
          for (let i = 0; i < of; i++) {
            top = round(turnTarget(top, scrollHeight, clientHeight, -1));
            shown.push(pageNumber(top, scrollHeight, clientHeight));
          }
          const expected = [...Array.from({ length: of }, (_, i) => i + 1), of, ...Array.from({ length: of }, (_, i) => Math.max(1, of - 1 - i))];
          if (shown.join() !== expected.join()) wrong.push(`${scrollHeight}/${clientHeight}: ${shown.join()}`);
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
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
