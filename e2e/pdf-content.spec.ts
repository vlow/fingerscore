import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readPdf, renderPdfPage, renderPdfPixels, type PdfPage, type PdfText } from './readPdf';

/** PDF points per millimetre; per unit of the 860-unit system that fills the width between the 12 mm margins. */
const MM = 72 / 25.4;
const MARGIN = 12 * MM;
const unitOf = (p: PdfPage) => (p.width - 2 * MARGIN) / 860;
/** Where the images for looking at go; PDF_OUT overrides it. */
const OUT = process.env.PDF_OUT ?? 'test-results/pdf';

const SYMBOL = /[♭♯♮𝄫𝄪♩Δ‿●○◐]/u;

// Documents are built in the page from the dev hook's helpers (src/pdf/devHook.ts); a builder is passed as source text.
type Builder = string;

const sample: Builder = `h => h.sampleDoc()`;

/** The sample song repeated to `bars` bars, each event with its own id. */
const repeated = (bars: number): Builder => `h => {
  const d = h.sampleDoc();
  const one = d.score;
  const score = [];
  let n = 0;
  while (score.length < ${bars}) for (const b of one) {
    if (score.length === ${bars}) break;
    score.push({ ...b, ev: b.ev.map(e => ({ ...e, id: 'r' + (++n) })) });
  }
  d.score = score;
  d.chords = {};
  return d;
}`;

/** Each of the eleven symbols and extended-Latin letters in title, subtitle, lyrics and chords. */
const symbols: Builder = `h => {
  const d = h.sampleDoc();
  d.title = 'Łódź in B♭';
  d.subtitle = 'a♭b♯c♮d𝄫e𝄪f♩gΔh‿i●j○k◐l';
  const evs = d.score.flatMap(b => b.ev).filter(e => !e.r);
  for (const e of evs) e.l = '';
  evs[0].l = 'Łó♭dź';
  evs[3].l = 'a‿b';
  evs[9].l = 'c●d';
  evs[13].l = 'e𝄪f';
  const tk = h.mod12(d.shift + h.inst(d.inst).off);
  d.chords = {};
  d.chords[evs[0].id] = h.parseChord('B♭m7', tk);
  d.chords[evs[9].id] = h.parseChord('CΔ7', tk);
  d.chords[evs[13].id] = h.parseChord('F♯', tk);
  return d;
}`;

/**
 * Triplets above and below, endings, a tie across systems, notes outside the range, raised chord extensions,
 * a squeezed lyric and a squeezed chord.
 */
const everything: Builder = `h => {
  const d = h.sampleDoc();
  d.show = { ...d.show, raiseExtensions: true };
  const ev = (id, m, dur, l = '') => ({ id, m, d: dur, r: false, tie: false, l });
  d.score[0].ev[2].l = 'everyone';
  d.score[10].ev = [ev('ta1', 57, 8, 'tri'), ev('ta2', 59, 4, 'o'), ev('ta3', 62, 12), ev('ta4', 59, 24)];
  d.score[6].ev = [ev('tb1', 76, 8), ev('tb2', 78, 4), ev('tb3', 76, 12), ev('tb4', 74, 24)];
  d.score[8].ev = [ev('lo1', 40, 12), ev('hi1', 86, 12), ev('lo2', 50, 24)];
  const tk = h.mod12(d.shift + h.inst(d.inst).off);
  d.chords[d.score[0].ev[0].id] = h.parseChord('C♯m7♭5/G♯', tk);
  d.chords[d.score[0].ev[1].id] = h.parseChord('D7sus4/A', tk);
  d.chords[d.score[0].ev[2].id] = h.parseChord('E♭maj7♯11', tk);
  d.chords[d.score[0].ev[3].id] = h.parseChord('F♯m7♭5', tk);
  d.chords[d.score[4].ev[0].id] = h.parseChord('CΔ7', tk);
  return d;
}`;

interface HookResult { pdf?: string; type?: string; error?: { name: string; message: string }; progress: [number, number][]; progressAfterAbort: number; ms: number }

/** Calls a function of src/pdf/devHook.ts, through the dev-only hook of src/main.tsx, with the document the builder makes. */
async function hook<T>(page: Page, fn: string, build: Builder, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ([name, source, rest]) => {
    const load = (window as unknown as { fingerscorePdf?: () => Promise<Record<string, unknown>> }).fingerscorePdf;
    if (!load) throw new Error('no PDF hook on this page');
    const h = await load();
    const doc = (new Function(`return (${source})`)() as (helpers: unknown) => unknown)(h);
    return (h[name] as (...a: unknown[]) => Promise<unknown>)(doc, ...rest);
  }, [fn, build, args] as const) as Promise<T>;
}

/** Calls a function of src/pdf/devHook.ts with plain arguments. */
async function call<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ([name, rest]) => {
    const load = (window as unknown as { fingerscorePdf?: () => Promise<Record<string, (...a: unknown[]) => Promise<unknown>>> }).fingerscorePdf;
    if (!load) throw new Error('no PDF hook on this page');
    return (await load())[name as string](...(rest as unknown[]));
  }, [fn, args] as const) as Promise<T>;
}

/** Layout constants of the sheet (src/render/layout.ts SHEET) and the title block's height, from the dev hook. */
interface Geometry { chordY: number; lyricY: number; chartY: number; chartBottom: number; systemHeight: number; titleBlock: number }

async function makePdf(page: Page, build: Builder, language = 'de-DE', extra: Record<string, unknown> = {}): Promise<{ result: HookResult; bytes: Uint8Array }> {
  const result = await hook<HookResult>(page, 'sheetPdf', build, { language, ...extra });
  if (result.error) throw new Error(`${result.error.name}: ${result.error.message}`);
  return { result, bytes: new Uint8Array(Buffer.from(result.pdf!, 'base64')) };
}

/** The items on the baseline of the exact item `str`, left to right. */
function lineOf(p: PdfPage, str: string): PdfText[] {
  const item = p.text.find(t => t.str === str);
  expect(item, `text item "${str}"`).toBeDefined();
  return p.text.filter(t => Math.abs(t.y - item!.y) < 0.3).sort((a, b) => a.x - b.x);
}

/** A symbol outline: a filled path inside the gap between two neighbouring items of a line. */
function expectSymbolBetween(p: PdfPage, left: PdfText, right: PdfText | null, em: number): void {
  const from = left.x + left.width;
  const to = right ? right.x : from + 1.2 * em;
  expect(to - from, `gap after "${left.str}"`).toBeGreaterThan(0.2 * em);
  const ink = p.paths.filter(q => q.fill !== null && q.x1 >= from - 0.01 && q.x2 <= to + 0.01
    && q.y2 > left.y - 1.2 * em && q.y1 < left.y + 0.5 * em && q.x2 - q.x1 > 0.1);
  expect(ink.length, `symbol outline between "${left.str}" and "${right?.str ?? '(end)'}"`).toBeGreaterThan(0);
}

/**
 * Width / height of each symbol's outline (glyphs.json bounding boxes; the drawn Δ, ‿ and discs), and the stroke in em
 * that thickens the music font's accidentals beside regular and bold text (src/pdf/drawText.ts).
 */
const ASPECT: Record<string, number> = {
  '♭': 226 / 614, '♯': 249 / 698, '♮': 168 / 676, '𝄫': 411 / 612, '𝄪': 247 / 252, '♩': 332 / 1016,
  'Δ': 823 / 1000, '‿': 1000 / 380, '●': 1, '○': 1, '◐': 1,
};
const ACCIDENTAL_STROKE = { regular: 0.012, bold: 0.03 };
/** Ink height of each symbol in em (drawText's table: as Chromium draws the character beside Atkinson Hyperlegible). */
const INK_EM: Record<string, number> = {
  '♭': 0.565, '♯': 0.605, '♮': 0.605, '𝄫': 0.565, '𝄪': 0.29, '♩': 0.891, 'Δ': 0.705, '‿': 0.176, '●': 0.789, '○': 0.789, '◐': 0.789,
};
const CAP_HEIGHT = 0.668;

/**
 * The outline of `ch` between two items: its box has the outline's aspect ratio (within 15%), an accidental is no taller
 * than the capitals around it, and the gap is at most the outline's width plus 0.3 em.
 */
function expectSymbolShape(p: PdfPage, left: PdfText, right: PdfText, ch: string, em: number, weight: 'regular' | 'bold'): void {
  expectSymbolBetween(p, left, right, em);
  const from = left.x + left.width;
  const box = p.paths.filter(q => q.fill !== null && q.x1 >= from - 0.01 && q.x2 <= right.x + 0.01 && q.y2 > left.y - 1.2 * em && q.y1 < left.y + 0.5 * em)
    .reduce((a, q) => ({ x1: Math.min(a.x1, q.x1), x2: Math.max(a.x2, q.x2), y1: Math.min(a.y1, q.y1), y2: Math.max(a.y2, q.y2) }), { x1: Infinity, x2: -Infinity, y1: Infinity, y2: -Infinity });
  const w = box.x2 - box.x1;
  const h = box.y2 - box.y1;
  const stroke = '♭♯♮𝄫𝄪'.includes(ch) ? ACCIDENTAL_STROKE[weight] * em : 0;
  const ink = INK_EM[ch] * em;
  const expected = (ASPECT[ch] * ink + stroke) / (ink + stroke);
  expect(Math.abs(w / h / expected - 1), `aspect of ${ch}`).toBeLessThan(0.15);
  if (stroke > 0) expect(h, `height of ${ch}`).toBeLessThanOrEqual(CAP_HEIGHT * em);
  expect(right.x - from, `gap of ${ch}`).toBeLessThanOrEqual(w + 0.3 * em);
}

function expectInside(p: PdfPage, x1: number, y1: number, x2: number, y2: number, what: string): void {
  const eps = 0.01;
  expect(x1, what).toBeGreaterThanOrEqual(MARGIN - eps);
  expect(x2, what).toBeLessThanOrEqual(p.width - MARGIN + eps);
  expect(y1, what).toBeGreaterThanOrEqual(MARGIN - eps);
  expect(y2, what).toBeLessThanOrEqual(p.height - MARGIN + eps);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the sample song: pages, A4, title block, lyrics, chords, legend, fonts', async ({ page }) => {
  const { result, bytes } = await makePdf(page, sample);
  expect(result.type).toBe('application/pdf');
  const expected = await hook<number>(page, 'expectedPages', sample, 'de-DE');
  const { pages, embeddedFonts } = await readPdf(bytes);
  expect(pages).toHaveLength(expected);
  for (const p of pages) {
    expect(p.width / MM).toBeCloseTo(210, 1);
    expect(p.height / MM).toBeCloseTo(297, 1);
  }
  const p = pages[0];
  const strs = p.text.map(t => t.str);
  expect(strs).toContain('The Water Is Wide');
  expect(strs).toContain('Traditional');
  // "♩ = 100": the note is an outline before the text.
  const tempo = lineOf(p, ' = 100');
  expect(tempo[0].str).toBe(' = 100');
  expectSymbolBetween(p, { ...tempo[0], x: MARGIN, width: 0 }, tempo[0], 12 * unitOf(p));
  expect(tempo.map(t => t.str)).toContain('Alto sax (E');
  // The first system's lyrics, in order.
  const lyrics = lineOf(p, 'The').filter(t => t.x < p.width / 2 + 200);
  expect(lyrics.map(t => t.str).slice(0, 8)).toEqual(['The', 'wat-', 'er', 'is', 'wide,', 'I', 'cross', 'o’er']);
  // The first chord: the alto sax reads the sample's Am as Bm.
  expect(lineOf(p, 'Bm')[0].str).toBe('Bm');
  // Legend with its discs, and the site, after the last system.
  const last = pages[pages.length - 1];
  const legend = lineOf(last, ' pressed ');
  expect(legend.map(t => t.str)).toEqual([
    ' pressed ', ' open · top left = octave key · small keys around the column = palm, side and pinky keys · fingering data: draft', 'fingerscore.eu',
  ]);
  expectSymbolBetween(last, { ...legend[0], x: MARGIN, width: 0 }, legend[0], 11 * unitOf(p));
  expectSymbolBetween(last, legend[0], legend[1], 11 * unitOf(p));
  expect(embeddedFonts).toEqual(['AtkinsonHyperlegible-Bold', 'AtkinsonHyperlegible-Regular']);
});

test('a one-page sheet has no footer', async ({ page }) => {
  const short = repeated(12);
  const { pages } = await readPdf((await makePdf(page, short)).bytes);
  expect(await hook<number>(page, 'expectedPages', short, 'de-DE')).toBe(1);
  expect(pages).toHaveLength(1);
  expect(pages[0].text.map(t => t.str)).toContain('fingerscore.eu');
  expect(pages[0].text.filter(t => /page \d+ of \d+/.test(t.str))).toEqual([]);
});

test('nine systems make three pages with the footer "… · page 2 of 3" on page 2', async ({ page }) => {
  const nine = repeated(36);
  const { bytes } = await makePdf(page, nine);
  const { pages } = await readPdf(bytes);
  expect(pages).toHaveLength(await hook<number>(page, 'expectedPages', nine, 'de-DE'));
  expect(pages).toHaveLength(3);
  const footer = pages[1].text.find(t => t.str === 'The Water Is Wide · page 2 of 3');
  expect(footer).toBeDefined();
  expect((footer!.x + footer!.width / 2) / MM).toBeCloseTo(105, 1);
  expect((pages[1].height - footer!.y) / MM).toBeCloseTo(5, 1);
  expect(pages[0].text.map(t => t.str)).toContain('The Water Is Wide · page 1 of 3');
});

test('US Letter for en-US', async ({ page }) => {
  const { bytes } = await makePdf(page, sample, 'en-US');
  const { pages } = await readPdf(bytes);
  expect(pages[0].width / MM).toBeCloseTo(215.9, 1);
  expect(pages[0].height / MM).toBeCloseTo(279.4, 1);
});

test('every Latin and extended-Latin character is drawn as text and each symbol as an outline in its gap', async ({ page }) => {
  const { bytes } = await makePdf(page, symbols);
  const { pages, embeddedFonts } = await readPdf(bytes);
  const p = pages[0];
  const u = unitOf(p);

  const title = lineOf(p, 'Ł');
  expect(title.map(t => t.str)).toEqual(['Ł', 'ód', 'ź', ' in B']);
  expectSymbolBetween(p, title[3], null, 26 * u);

  const subtitle = lineOf(p, 'a');
  expect(subtitle.map(t => t.str)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']);
  [...'♭♯♮𝄫𝄪♩Δ‿●○◐'].forEach((ch, i) => expectSymbolShape(p, subtitle[i], subtitle[i + 1], ch, 14 * u, 'bold'));

  /** Some line has the exact items `left` and `right` next to each other, with a symbol outline between them. */
  const pair = (left: string, right: string, px: number) => {
    const found = p.text.filter(t => t.str === left).map(t => {
      const line = p.text.filter(x => Math.abs(x.y - t.y) < 0.3).sort((a, b) => a.x - b.x);
      const i = line.indexOf(t);
      return line[i + 1]?.str === right ? [t, line[i + 1]] : null;
    }).find(x => x !== null);
    expect(found, `"${left}" then "${right}"`).toBeDefined();
    expectSymbolBetween(p, found![0], found![1], px * u);
  };
  // The lyric "Łó♭dź" is the other line that starts with "Ł".
  const firstL = p.text.find(t => t.str === 'Ł' && Math.abs(t.y - title[0].y) > 1);
  expect(firstL).toBeDefined();
  const lyricLine = p.text.filter(t => Math.abs(t.y - firstL!.y) < 0.3).sort((a, b) => a.x - b.x);
  expect(lyricLine.map(t => t.str).slice(0, 4)).toEqual(['Ł', 'ó', 'd', 'ź']);
  pair('ó', 'd', 12);
  pair('a', 'b', 12);
  pair('c', 'd', 12);
  pair('e', 'f', 12);
  pair('B', 'm', 13);
  // "CΔ7": the raised "Δ7" stands on a higher baseline.
  const c = p.text.find(t => t.str === 'C')!;
  const seven = p.text.filter(t => t.str === '7' && t.x > c.x && Math.abs(t.y - c.y) < 13 * u).sort((a, b) => a.x - b.x)[0];
  expect(seven).toBeDefined();
  expectSymbolBetween(p, c, seven, 9 * u);
  const f = p.text.find(t => t.str === 'F' && t.font === 'AtkinsonHyperlegible-Bold');
  expect(f, 'chord "F♯"').toBeDefined();
  expectSymbolBetween(p, f!, null, 13 * u);
  expect(embeddedFonts).toEqual([
    'AtkinsonHyperlegible-Bold', 'AtkinsonHyperlegible-Regular', 'AtkinsonHyperlegibleExt-Bold', 'AtkinsonHyperlegibleExt-Regular',
  ]);
  for (const t of p.text) expect(SYMBOL.test(t.str), `symbol drawn as text: "${t.str}"`).toBe(false);
});

test('with the Show switches off there is no lyric, chord or chart', async ({ page }) => {
  const off = `h => { const d = h.sampleDoc(); d.show = { fingerings: false, chords: false, lyrics: false, raiseExtensions: true }; return d; }`;
  const g = await call<Geometry>(page, 'geometry');
  const tops = (p: PdfPage) => [0, 1, 2, 3].map(i => MARGIN + (g.titleBlock + g.systemHeight * i) * unitOf(p));
  const chartPaths = (p: PdfPage) => p.paths.filter(q => {
    const cy = (q.y1 + q.y2) / 2;
    return tops(p).some(top => cy > top + g.chartY * unitOf(p) && cy < top + g.chartBottom * unitOf(p));
  });
  // The chord band starts at chordY; the lyric baseline is 12 units below lyricY.
  const bands = (p: PdfPage) => p.text.filter(t => tops(p).some(top => t.y > top + g.chordY * unitOf(p) && t.y < top + (g.lyricY + 16) * unitOf(p)));
  const on = (await readPdf((await makePdf(page, sample)).bytes)).pages[0];
  expect(chartPaths(on).length).toBeGreaterThan(0);
  expect(bands(on).length).toBeGreaterThan(0);
  const p = (await readPdf((await makePdf(page, off)).bytes)).pages[0];
  expect(chartPaths(p)).toEqual([]);
  expect(bands(p).map(t => t.str)).toEqual([]);
  for (const s of ['The', 'wat-', 'cross']) expect(p.text.map(t => t.str)).not.toContain(s);
});

test('triplets, endings, a tie across systems, out-of-range notes, raised extensions, squeezed texts: all inside the margins', async ({ page }) => {
  const screen = await hook<{ squeezed: { text: string; textLength: number }[]; tupletSides: string[]; voltas: number; states: string[]; raised: number; systems: number[][] }>(page, 'showPaper', everything);
  expect(new Set(screen.tupletSides)).toEqual(new Set(['above', 'below']));
  expect(screen.voltas).toBeGreaterThan(0);
  expect(screen.states).toEqual(expect.arrayContaining(['bad', 'ext']));
  expect(screen.raised).toBeGreaterThan(0);
  const system = (bar: number) => screen.systems.findIndex(s => s.includes(bar));
  expect(system(3)).not.toBe(system(4));   // bar 3 ties into bar 4
  const lyric = screen.squeezed.find(s => s.text === 'everyone');
  expect(lyric).toBeDefined();
  expect(screen.squeezed.length).toBeGreaterThan(1);

  const { bytes } = await makePdf(page, everything);
  const { pages } = await readPdf(bytes);
  pages.forEach((p, n) => {
    const footer = `The Water Is Wide · page ${n + 1} of ${pages.length}`;
    for (const t of p.text) if (t.str !== footer) expectInside(p, t.x, t.y, t.x + t.width, t.y, `text "${t.str}" on page ${n + 1}`);
    for (const q of p.paths) expectInside(p, q.x1, q.y1, q.x2, q.y2, `path at ${q.x1.toFixed(1)}, ${q.y1.toFixed(1)} on page ${n + 1}`);
  });
  const squeezed = pages[0].text.find(t => t.str === 'everyone');
  expect(squeezed).toBeDefined();
  expect(Math.abs(squeezed!.width / unitOf(pages[0]) - lyric!.textLength)).toBeLessThanOrEqual(1);

  // Page 1 as pixels: the margin strips are white (the footer stands in the bottom margin, 5 mm above the edge).
  const dpi = 100;
  const px = await renderPdfPixels(bytes, 1, dpi);
  const mm = (v: number) => Math.round((v * dpi) / 25.4);
  const inked = (x0: number, y0: number, x1: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = 4 * (y * px.width + x);
      if (px.data[i] < 245 || px.data[i + 1] < 245 || px.data[i + 2] < 245) n++;
    }
    return n;
  };
  const m = mm(12) - 1;
  expect(inked(0, 0, px.width, m), 'top margin').toBe(0);
  expect(inked(0, 0, m, px.height), 'left margin').toBe(0);
  expect(inked(px.width - m, 0, px.width, px.height), 'right margin').toBe(0);
  expect(inked(0, px.height - m, px.width, px.height - mm(7.5)), 'bottom margin above the footer').toBe(0);
  expect(inked(0, px.height - mm(4), px.width, px.height), 'bottom margin below the footer').toBe(0);
});

test('a character outside the fonts: the hook rejects with the message', async ({ page }) => {
  const cyrillic = `h => { const d = h.sampleDoc(); d.score[0].ev[0].l = 'Привет'; return d; }`;
  const result = await hook<HookResult>(page, 'sheetPdf', cyrillic, { language: 'de-DE' });
  expect(result.error).toEqual({ name: 'PdfError', message: 'The PDF can\'t show these characters: П, р, и, в, е, т. Use Print instead.' });
  expect(result.progress).toEqual([]);
});

test('an aborted signal rejects with AbortError and stops reporting progress', async ({ page }) => {
  const before = await hook<HookResult>(page, 'sheetPdf', repeated(36), { language: 'de-DE', abortBefore: true });
  expect(before.error?.name).toBe('AbortError');
  expect(before.progress).toEqual([]);
  const during = await hook<HookResult>(page, 'sheetPdf', repeated(36), { language: 'de-DE', abortAtPage: 1 });
  expect(during.error?.name).toBe('AbortError');
  expect(during.progressAfterAbort).toBeLessThanOrEqual(1);
  expect(during.progress.length).toBeLessThan(3);
});

test('a 400-bar sheet completes and reports every page', async ({ page }) => {
  test.setTimeout(240_000);
  const long = repeated(400);
  const { result, bytes } = await makePdf(page, long);
  const total = await hook<number>(page, 'expectedPages', long, 'de-DE');
  expect(result.progress).toEqual(Array.from({ length: total }, (_, i) => [i + 1, total]));
  expect((await readPdf(bytes)).pages).toHaveLength(total);
  console.log(`400 bars: ${total} pages, ${bytes.length} bytes, ${Math.round(result.ms)} ms`);
});

test('a page is written in reading order: title block, systems, legend, site, footer', async ({ page }) => {
  const { pages } = await readPdf((await makePdf(page, sample)).bytes);
  const seqOf = (p: PdfPage, str: string) => {
    const t = p.text.find(x => x.str === str);
    expect(t, `text item "${str}"`).toBeDefined();
    return t!.seq;
  };
  const byOrder = (p: PdfPage) => [...p.text].sort((a, b) => a.seq - b.seq);
  const first = pages[0];
  expect(byOrder(first).slice(0, 3).map(t => t.str)).toEqual(['The Water Is Wide', 'Traditional', ' = 100']);
  expect(seqOf(first, ' = 100')).toBeLessThan(seqOf(first, 'The'));
  expect(byOrder(first).pop()!.str).toBe('The Water Is Wide · page 1 of 2');
  const last = pages[pages.length - 1];
  const legendSeq = seqOf(last, ' pressed ');
  const legendY = last.text.find(t => t.str === ' pressed ')!.y;
  const music = last.text.filter(t => t.y < legendY - 1);
  expect(music.length).toBeGreaterThan(0);
  expect(Math.max(...music.map(t => t.seq))).toBeLessThan(legendSeq);
  expect(legendSeq).toBeLessThan(seqOf(last, 'fingerscore.eu'));
  expect(byOrder(last).pop()!.str).toBe('The Water Is Wide · page 2 of 2');
});

test('the triplet\'s white outline is a shape under the one text item "3"', async ({ page }) => {
  const screen = await hook<{ tupletSides: string[] }>(page, 'showPaper', everything);
  const { pages, embeddedFonts } = await readPdf((await makePdf(page, everything)).bytes);
  expect(embeddedFonts).toEqual(['AtkinsonHyperlegible-Bold', 'AtkinsonHyperlegible-BoldItalic', 'AtkinsonHyperlegible-Regular']);
  const threes = pages.flatMap(p => p.text.filter(t => t.str === '3' && t.font === 'AtkinsonHyperlegible-BoldItalic').map(t => ({ p, t })));
  expect(threes).toHaveLength(screen.tupletSides.length);
  for (const { p, t } of threes) {
    const halo = p.paths.filter(q => q.fill === '#ffffff' && q.stroke === null && q.seq < t.seq
      && q.x1 < t.x && q.x2 > t.x + t.width && q.y2 > t.y && q.y1 < t.y - 6 * unitOf(p));
    expect(halo, `white shape under the 3 at ${t.x.toFixed(1)}`).toHaveLength(1);
    expect(halo[0].x2 - halo[0].x1).toBeLessThan(16 * unitOf(p));
  }
});

test('a squeezed text with symbols is scaled as a whole, outlines included', async ({ page }) => {
  const items = [
    { text: 'B♭m7', px: 13, weight: 700, squeezeTo: 24 },
    { text: 'a‿b', px: 12, weight: 400, squeezeTo: 12 },
  ];
  const result = await call<{ pdf: string; natural: number[] }>(page, 'drawTextPdf', items);
  const p = (await readPdf(new Uint8Array(Buffer.from(result.pdf, 'base64')))).pages[0];
  const u = unitOf(p);
  const check = (left: string, right: string, squeezeTo: number, natural: number, px: number) => {
    const l = p.text.find(t => t.str === left)!;
    const r = p.text.find(t => t.str === right && Math.abs(t.y - l.y) < 0.3)!;
    expect(l, left).toBeDefined();
    expect(r, right).toBeDefined();
    expect(natural).toBeGreaterThan(squeezeTo);
    expect((r.x + r.width - l.x) / u).toBeCloseTo(squeezeTo, 1);
    expectSymbolBetween(p, l, r, px * u * (squeezeTo / natural));
  };
  check('B', 'm7', 24, result.natural[0], 13);
  check('a', 'b', 12, result.natural[1], 12);
});

test('nothing stays in the document: not after a failed render, a finished PDF or an aborted one', async ({ page }) => {
  expect(await call<{ before: number; after: number; error: string }>(page, 'renderFailure')).toEqual(expect.objectContaining({ error: 'render failed' }));
  const failed = await call<{ before: number; after: number }>(page, 'renderFailure');
  expect(failed.after).toBe(failed.before);
  const done = await hook<HookResult & { bodyBefore: number; bodyAfter: number }>(page, 'sheetPdf', sample, { language: 'de-DE' });
  expect(done.pdf).toBeDefined();
  expect(done.bodyAfter).toBe(done.bodyBefore);
  const aborted = await hook<HookResult & { bodyBefore: number; bodyAfter: number }>(page, 'sheetPdf', repeated(36), { language: 'de-DE', abortAtPage: 1 });
  expect(aborted.error?.name).toBe('AbortError');
  expect(aborted.bodyAfter).toBe(aborted.bodyBefore);
});

test('four systems: one page, the legend kept on it by shrinking the systems, centred, no footer', async ({ page }) => {
  const four = repeated(16);
  const { bytes } = await makePdf(page, four);
  const { pages } = await readPdf(bytes);
  expect(await hook<number>(page, 'expectedPages', four, 'de-DE')).toBe(1);
  expect(pages).toHaveLength(1);
  const p = pages[0];
  const u = unitOf(p);
  const strs = p.text.map(t => t.str);
  expect(strs).toContain(' pressed ');
  expect(strs).toContain('fingerscore.eu');
  expect(strs.filter(s => /page \d+ of \d+/.test(s))).toEqual([]);
  for (const t of p.text) expectInside(p, t.x, t.y, t.x + t.width, t.y, `text "${t.str}"`);
  for (const q of p.paths) expectInside(p, q.x1, q.y1, q.x2, q.y2, `path at ${q.x1.toFixed(1)}, ${q.y1.toFixed(1)}`);
  // Staff lines: the widest paths of the systems, narrower than the content width and centred on the page.
  const ruleY = p.paths.find(q => q.fill === '#e3e3e8' || q.fill === '#e2e4e8')?.y1 ?? Infinity;
  const staff = p.paths.filter(q => q.y2 < ruleY && q.x2 - q.x1 > 600 * u);
  expect(staff.length).toBeGreaterThanOrEqual(20);
  for (const q of staff) {
    expect(q.x2 - q.x1).toBeLessThan(860 * u - 5);
    expect((q.x1 + q.x2) / 2).toBeCloseTo(p.width / 2, 0);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'sheet-four-systems.pdf'), bytes);
  writeFileSync(join(OUT, 'sheet-four-systems-p1.png'), await renderPdfPage(bytes, 1, 150));
});

test('ink above a system\'s box is drawn where the paper draws it: a high triplet mark', async ({ page }) => {
  const high = `h => {
    const d = h.sampleDoc();
    const ev = (id, m, dur) => ({ id, m, d: dur, r: false, tie: false, l: '' });
    d.score[2].ev = [ev('c1', 40, 8), ev('c2', 96, 4), ev('c3', 62, 12), ev('c4', 62, 24)];
    return d;
  }`;
  const screen = await hook<{ tuplets: { x: number; y: number; system: number }[] }>(page, 'showPaper', high);
  const mark = screen.tuplets.find(t => t.system === 0)!;
  expect(mark.y).toBeLessThan(0);
  const g = await call<Geometry>(page, 'geometry');
  const p = (await readPdf((await makePdf(page, high)).bytes)).pages[0];
  const u = unitOf(p);
  const top = MARGIN + g.titleBlock * u;
  const three = p.text.find(t => t.str === '3');
  expect(three).toBeDefined();
  expect(three!.y).toBeCloseTo(top + mark.y * u, 0);
  expect(three!.x + three!.width / 2).toBeCloseTo(MARGIN + mark.x * u, 0);
  const bracket = p.paths.filter(q => q.stroke !== null && q.y1 < top && Math.abs((q.x1 + q.x2) / 2 - (MARGIN + mark.x * u)) < 10 * u);
  expect(bracket.length).toBeGreaterThan(0);
});

test.describe('degenerate documents', () => {
  test('no title and no subtitle: the page starts with the tempo line', async ({ page }) => {
    const bare = `h => { const d = h.sampleDoc(); d.title = ''; d.subtitle = ''; return d; }`;
    const { pages } = await readPdf((await makePdf(page, bare)).bytes);
    expect(pages).toHaveLength(await hook<number>(page, 'expectedPages', bare, 'de-DE'));
    const first = [...pages[0].text].sort((a, b) => a.seq - b.seq)[0];
    expect(first.str).toBe(' = 100');
    expect(first.y).toBeLessThan(MARGIN + 20 * unitOf(pages[0]));
    expect(pages[1].text.map(t => t.str)).toContain('page 2 of 2');
  });

  test('a 300-character title is one line ending in "…", inside the margins', async ({ page }) => {
    const long = `h => { const d = h.sampleDoc(); d.title = 'Long title '.repeat(28).slice(0, 300); return d; }`;
    const p = (await readPdf((await makePdf(page, long)).bytes)).pages[0];
    const title = p.text.filter(t => t.str.startsWith('Long title') && t.font === 'AtkinsonHyperlegible-Bold');
    expect(title).toHaveLength(1);
    expect(title[0].str.endsWith('…')).toBe(true);
    expectInside(p, title[0].x, title[0].y, title[0].x + title[0].width, title[0].y, 'title');
  });

  test('a sheet of rests only', async ({ page }) => {
    const rests = `h => { const d = h.sampleDoc(); d.score = d.score.slice(1, 5).map((b, i) => ({ ...b, rs: false, re: false, volta: '', ev: [{ id: 'z' + i, m: 0, d: b.cap, r: true, tie: false, l: '' }] })); d.chords = {}; return d; }`;
    const { pages } = await readPdf((await makePdf(page, rests)).bytes);
    expect(pages).toHaveLength(1);
    expect(pages[0].text.map(t => t.str)).toContain('fingerscore.eu');
  });

  test('a document with one bar', async ({ page }) => {
    const one = `h => { const d = h.sampleDoc(); d.score = d.score.slice(0, 1); return d; }`;
    const { pages } = await readPdf((await makePdf(page, one)).bytes);
    expect(pages).toHaveLength(1);
    const strs = pages[0].text.map(t => t.str);
    expect(strs).toEqual(expect.arrayContaining(['The Water Is Wide', 'The', 'fingerscore.eu']));
  });
});

test.describe('images for review', () => {
  test.use({ deviceScaleFactor: 2 });

  test('page 1 of the sample song and of the "everything" sheet, and both sheets on screen', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, build] of [['sample', sample], ['everything', everything], ['symbols', symbols]] as const) {
      const { bytes } = await makePdf(page, build);
      writeFileSync(join(OUT, `sheet-${name}.pdf`), bytes);
      writeFileSync(join(OUT, `sheet-${name}-p1.png`), await renderPdfPage(bytes, 1, 150));
      await hook(page, 'showPaper', build);
      await page.locator('#pdf-screen [data-testid="paper"]').screenshot({ path: join(OUT, `sheet-${name}-screen.png`) });
    }
    const nine = await makePdf(page, repeated(36));
    console.log(`one page (12 bars): ${(await makePdf(page, repeated(12))).bytes.length} bytes; nine systems: ${nine.bytes.length} bytes`);
  });
});
