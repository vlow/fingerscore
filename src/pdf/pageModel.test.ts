import { describe, expect, it } from 'vitest';
import { legend } from '../domain/fingerings';
import {
  type Block, MARGIN_MM, UNITS, fitText, footerText, pageHeightUnits, pageSizeFor, paginate, unitMm, wrapLegend,
} from './pageModel';

const A4 = pageSizeFor('de-DE');
const LETTER = pageSizeFor('en-US');

const title = (): Block[] => [
  { kind: 'title', height: 44 }, { kind: 'subtitle', height: 28 }, { kind: 'meta', height: 24 },
];
const systems = (n: number): Block[] => Array.from({ length: n }, (_, i) => ({ kind: 'system', height: 290, index: i }));
const counts = (pages: ReturnType<typeof paginate>) =>
  pages.map(p => p.flatMap(g => g.blocks).filter(b => b.kind === 'system').length);

describe('pageSizeFor', () => {
  it.each(['en-US', 'es-US', 'en-CA', 'fr-CA'])('%s is Letter', l => expect(pageSizeFor(l).name).toBe('Letter'));
  it.each(['en-GB', 'de-DE', 'de', 'en', '', 'zh-Hant-TW', 'es-419'])('"%s" is A4', l => expect(pageSizeFor(l).name).toBe('A4'));
  it.each(['zh-Hant-US', 'en-us', 'sr-Latn-CA'])('the region is the first two-letter segment after the language: %s is Letter', l => expect(pageSizeFor(l).name).toBe('Letter'));
  it('no language is A4', () => {
    expect(pageSizeFor(undefined).name).toBe('A4');
    expect(pageSizeFor(null).name).toBe('A4');
  });
});

describe('units', () => {
  it('860 units fill the width between the margins', () => {
    expect(MARGIN_MM).toBe(12);
    expect(UNITS).toBe(860);
    expect(unitMm(A4) * UNITS).toBeCloseTo(186, 9);
    expect(unitMm(LETTER) * UNITS).toBeCloseTo(191.9, 9);
  });
  it('page height in units', () => {
    expect(pageHeightUnits(A4)).toBeCloseTo(273 / (186 / 860), 6);
    expect(pageHeightUnits(LETTER)).toBeCloseTo(255.4 / (191.9 / 860), 6);
  });
});

describe('paginate', () => {
  // A4: 1262.1 units. First page: 1262.1 - 96 = 1166.1 -> 4 systems (1160). Later pages: 4 systems.
  // Letter: 1144.6 units. First page: 1144.6 - 96 = 1048.6 -> 3 systems (870). Later pages: 3 (4 = 1160 > 1144.6).
  const expectA4 = [[1], [2], [3], [4], [4, 1], [4, 2], [4, 3], [4, 4], [4, 4, 1]];
  const expectLetter = [[1], [2], [3], [3, 1], [3, 2], [3, 3], [3, 3, 1], [3, 3, 2], [3, 3, 3]];
  it.each(expectA4.map((e, i) => [i + 1, e] as const))('A4 with title, %i systems', (n, expected) => {
    const pages = paginate([...title(), ...systems(n)], pageHeightUnits(A4));
    expect(counts(pages)).toEqual(expected);
    for (const p of pages) expect(p.reduce((s, g) => s + g.blocks.reduce((t, b) => t + b.height, 0), 0)).toBeLessThanOrEqual(pageHeightUnits(A4));
    expect(pages.flatMap(p => p.flatMap(g => g.blocks)).filter(b => b.kind === 'system').map(b => b.index)).toEqual([...Array(n).keys()]);
    expect(pages[0].flatMap(g => g.blocks).slice(0, 3).map(b => b.kind)).toEqual(['title', 'subtitle', 'meta']);
  });
  it.each(expectLetter.map((e, i) => [i + 1, e] as const))('Letter with title, %i systems', (n, expected) => {
    const pages = paginate([...title(), ...systems(n)], pageHeightUnits(LETTER));
    expect(counts(pages)).toEqual(expected);
    for (const p of pages) expect(p.reduce((s, g) => s + g.blocks.reduce((t, b) => t + b.height, 0), 0)).toBeLessThanOrEqual(pageHeightUnits(LETTER));
  });
  it('without title and subtitle, the first page takes 4 systems on A4 and the meta line only', () => {
    const pages = paginate([{ kind: 'meta', height: 24 }, ...systems(5)], pageHeightUnits(A4));
    expect(counts(pages)).toEqual([4, 1]);
  });
  it('a legend that fits stays on the last page', () => {
    const pages = paginate([...title(), ...systems(2), { kind: 'legend', height: 40 }], pageHeightUnits(A4));
    expect(pages).toHaveLength(1);
    const kinds = pages[0].flatMap(g => g.blocks).map(b => b.kind);
    expect(kinds[kinds.length - 1]).toBe('legend');
  });
  it('a legend that would stand alone stays on the page before, whose other blocks shrink to make room', () => {
    // 96 + 4 * 290 = 1256 of 1262.3: the legend of 41 does not fit; (1262.3 - 41) / 1256 = 0.97 >= 0.92.
    const P = pageHeightUnits(A4);
    const pages = paginate([...title(), ...systems(4), { kind: 'legend', height: 41 }], P);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(2);
    expect(pages[0][0].blocks.map(b => b.kind)).toEqual(['title', 'subtitle', 'meta', 'system', 'system', 'system', 'system']);
    expect(pages[0][0].scale).toBeCloseTo((P - 41) / 1256, 9);
    expect(pages[0][1]).toEqual({ blocks: [{ kind: 'legend', height: 41 }], scale: 1 });
  });
  it('five systems: the legend shares the last page and nothing shrinks', () => {
    const pages = paginate([...title(), ...systems(5), { kind: 'legend', height: 41 }], pageHeightUnits(A4));
    expect(counts(pages)).toEqual([4, 1]);
    expect(pages.flat().every(g => g.scale === 1)).toBe(true);
  });
  it('a legend that would need a shrink below 0.92 gets its own page', () => {
    // (P - L) / 1256 just under 0.92
    const P = pageHeightUnits(A4);
    const L = Math.ceil(P - 0.92 * 1256) + 1;
    const pages = paginate([...title(), ...systems(4), { kind: 'legend', height: L }], P);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toEqual([{ blocks: [{ kind: 'legend', height: L }], scale: 1 }]);
    expect(pages[0][0].scale).toBe(1);
  });
  it('a block taller than a page keeps its own rule: the legend after it gets its own page', () => {
    const P = pageHeightUnits(A4);
    const pages = paginate([{ kind: 'line', height: P * 1.02, index: 0 }, { kind: 'legend', height: 41 }], P);
    expect(pages).toHaveLength(2);
    expect(pages[0][0].scale).toBeCloseTo(1 / 1.02, 9);
    expect(pages[1]).toEqual([{ blocks: [{ kind: 'legend', height: 41 }], scale: 1 }]);
  });
  it('a block exactly as tall as the remaining space fits', () => {
    const pages = paginate([{ kind: 'system', height: 100 }, { kind: 'system', height: 200 }], 300);
    expect(pages).toHaveLength(1);
  });
  it('a line taller than the page is scaled down and alone on its page', () => {
    const pages = paginate(
      [{ kind: 'caption', height: 30 }, { kind: 'line', height: 200, index: 0 }, { kind: 'line', height: 1400, index: 1 }, { kind: 'line', height: 200, index: 2 }],
      pageHeightUnits(A4),
    );
    expect(pages).toHaveLength(3);
    expect(pages[0].flatMap(g => g.blocks).map(b => b.index ?? -1)).toEqual([-1, 0]);
    expect(pages[1]).toHaveLength(1);
    expect(pages[1][0].blocks).toHaveLength(1);
    expect(pages[1][0].scale).toBeCloseTo(pageHeightUnits(A4) / 1400, 9);
    expect(pages[1][0].scale).toBeLessThan(1);
    expect(pages[0].every(g => g.scale === 1)).toBe(true);
    expect(pages[2][0].blocks[0].index).toBe(2);
    expect(pages[2][0].scale).toBe(1);
  });
  it('no blocks give no pages', () => {
    expect(paginate([], 1000)).toEqual([]);
  });
});

describe('fitText', () => {
  const w = (t: string, px: number) => [...t].length * px * 0.5;
  it('keeps a text that fits', () => {
    expect(fitText('Song', w, 860, 26, 14)).toEqual({ text: 'Song', px: 26 });
  });
  it('shrinks to an intermediate size', () => {
    const text = 'x'.repeat(80); // 80 * 0.5 * 26 = 1040 > 860; at 21.5: 860
    const r = fitText(text, w, 860, 26, 14);
    expect(r.text).toBe(text);
    expect(r.px).toBeLessThan(26);
    expect(r.px).toBeGreaterThan(14);
    expect(w(r.text, r.px)).toBeLessThanOrEqual(860);
  });
  it('cuts with an ellipsis at the minimum size', () => {
    const text = 'x'.repeat(200);
    const r = fitText(text, w, 860, 26, 14);
    expect(r.px).toBe(14);
    expect(r.text.endsWith('…')).toBe(true);
    expect(w(r.text, 14)).toBeLessThanOrEqual(860);
    expect(r.text.length).toBeGreaterThan(50);
  });
  it('an empty string stays empty', () => {
    expect(fitText('', w, 860, 26, 14)).toEqual({ text: '', px: 26 });
  });
});

describe('wrapLegend', () => {
  const w = (t: string) => [...t].length * 6;
  it('a short legend and the footer share one line', () => {
    expect(wrapLegend('● open · ○ closed', 'fingerscore.eu', w, 860)).toEqual({ lines: ['● open · ○ closed'], footerOwnLine: false });
  });
  it('the saxophone legend wraps at separators', () => {
    const text = legend('asax');
    const r = wrapLegend(text, 'fingerscore.eu', w, 400);
    expect(r.lines.length).toBeGreaterThan(1);
    for (const l of r.lines) expect(w(l)).toBeLessThanOrEqual(400);
    const segments = text.split(' · ');
    for (const l of r.lines) for (const s of l.split(' · ')) expect(segments).toContain(s);
    expect(r.lines.join(' · ')).toBe(text);
  });
  it('breaks at spaces when one segment is wider than a line', () => {
    const r = wrapLegend('one two three four five six', 'f', w, 100);
    expect(r.lines.length).toBeGreaterThan(1);
    for (const l of r.lines) expect(w(l)).toBeLessThanOrEqual(100);
    expect(r.lines.join(' ')).toBe('one two three four five six');
  });
  it('the footer takes its own line when the last line is full', () => {
    const r = wrapLegend('a'.repeat(100), 'fingerscore.eu', w, 620);
    expect(r.lines).toHaveLength(1);
    expect(r.footerOwnLine).toBe(true);
  });
  it('empty segments leave no separator and no space', () => {
    expect(wrapLegend('● open ·  · top hole = thumb · ', 'f', w, 860).lines).toEqual(['● open · top hole = thumb']);
    expect(wrapLegend('a ·  · b', 'f', w, 20).lines).toEqual(['a', 'b']);
  });
  it('the footer needs a gap of 24 units', () => {
    // legend 600 + footer 84 + gap 24 = 708
    expect(wrapLegend('a'.repeat(100), 'fingerscore.eu'.padEnd(14), w, 708).footerOwnLine).toBe(false);
    expect(wrapLegend('a'.repeat(100), 'fingerscore.eu'.padEnd(14), w, 707).footerOwnLine).toBe(true);
  });
});

describe('footerText', () => {
  it('names title and page', () => expect(footerText('Song', 2, 3)).toBe('Song · page 2 of 3'));
  it('works without a title', () => expect(footerText('', 2, 3)).toBe('page 2 of 3'));
  it('is null for a one-page PDF', () => expect(footerText('Song', 1, 1)).toBeNull());
});
