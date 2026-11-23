import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readPdf, renderPdfPage, type PdfPage, type PdfText } from './readPdf';

/** PDF points per millimetre; per unit of the 860-unit line that fills the width between the 12 mm margins. */
const MM = 72 / 25.4;
const MARGIN = 12 * MM;
const unitOf = (p: PdfPage) => (p.width - 2 * MARGIN) / 860;
/** Where the images for looking at go; PDF_OUT overrides it. */
const OUT = process.env.PDF_OUT ?? 'test-results/pdf';

interface Spec {
  inst: string; scale?: string; tonicPc?: number; range?: 'one' | 'two' | 'all'; direction?: 'up' | 'updown';
  showAlternates?: boolean; showNames?: boolean; caption?: string; overrides?: Record<number, number>;
}

interface HookResult { pdf?: string; type?: string; error?: { name: string; message: string }; progress: [number, number][]; progressAfterAbort: number; ms: number }
interface ScaleInput { inst: string; scale: { notes: { spelled: { name: string } }[] }; caption: string; overrides: Record<number, number> }

/** The input of makeScalePdf for a scale page's settings, made in the page by the dev hook's helpers (src/pdf/devHook.ts). */
async function inputOf(page: Page, spec: Spec): Promise<ScaleInput> {
  return page.evaluate(async s => {
    const load = (window as unknown as { fingerscorePdf?: () => Promise<Record<string, (...a: unknown[]) => unknown>> }).fingerscorePdf;
    if (!load) throw new Error('no PDF hook on this page');
    const h = await load();
    const scale = s.scale ?? 'maj';
    const built = h.buildScale({ inst: s.inst, scale, tonicPc: s.tonicPc ?? 0, range: s.range ?? 'one', direction: s.direction ?? 'up' });
    return {
      inst: s.inst, scale: built, scaleName: scale === 'maj' ? 'major' : scale, caption: s.caption ?? 'Alto sax in E♭ · C major · sounds E♭ major',
      chartStyle: 'compact', recorderSystem: 'baroque', showNames: s.showNames ?? true, showAlternates: s.showAlternates ?? false, overrides: s.overrides ?? {},
    };
  }, spec) as Promise<ScaleInput>;
}

async function hookCall<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ([name, rest]) => {
    const load = (window as unknown as { fingerscorePdf?: () => Promise<Record<string, (...a: unknown[]) => Promise<unknown>>> }).fingerscorePdf;
    if (!load) throw new Error('no PDF hook on this page');
    return (await load())[name as string](...(rest as unknown[]));
  }, [fn, args] as const) as Promise<T>;
}

async function makePdf(page: Page, input: ScaleInput, language = 'de-DE'): Promise<{ result: HookResult; bytes: Uint8Array }> {
  const result = await hookCall<HookResult>(page, 'scalePdf', input, { language });
  if (result.error) throw new Error(`${result.error.name}: ${result.error.message}`);
  return { result, bytes: new Uint8Array(Buffer.from(result.pdf!, 'base64')) };
}

const pdfOf = async (page: Page, spec: Spec, language?: string) => {
  const input = await inputOf(page, spec);
  const { bytes } = await makePdf(page, input, language);
  return { input, bytes, info: await readPdf(bytes) };
};

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

/** Names of the notes of one line of the page (those within the vertical band between two item y values). */
const namesOf = (input: ScaleInput) => input.scale.notes.map(n => n.spelled.name);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('C major on alto sax, one octave: one A4 page with caption, eight names, legend with discs, site and no footer', async ({ page }) => {
  const { input, info } = await pdfOf(page, { inst: 'asax' });
  const { pages, embeddedFonts } = info;
  expect(pages).toHaveLength(1);
  const p = pages[0];
  expect(p.width / MM).toBeCloseTo(210, 1);
  expect(p.height / MM).toBeCloseTo(297, 1);
  const u = unitOf(p);

  // Caption: 18 bold, centred; the ♭ is an outline between the two pieces of text.
  const caption = lineOf(p, 'Alto sax in E');
  expect(caption.map(t => t.str)).toEqual(['Alto sax in E', ' · C major · sounds E', ' major']);
  expect(caption.every(t => t.font === 'AtkinsonHyperlegible-Bold')).toBe(true);
  expectSymbolBetween(p, caption[0], caption[1], 18 * u);
  expectSymbolBetween(p, caption[1], caption[2], 18 * u);
  const left = caption[0].x;
  const right = caption[2].x + caption[2].width;
  expect((left + right) / 2 / MM).toBeCloseTo(105, 0);

  // Eight note names, in order, on one baseline.
  const names = namesOf(input);
  expect(names).toHaveLength(8);
  const drawn = p.text.filter(t => names.includes(t.str)).sort((a, b) => a.x - b.x);
  expect(drawn.map(t => t.str)).toEqual(names);
  expect(new Set(drawn.map(t => t.y.toFixed(1))).size).toBe(1);

  // Legend: two discs, the rest of it, and the site on the same line.
  const legend = lineOf(p, ' pressed ');
  expect(legend.map(t => t.str)).toEqual([
    ' pressed ', ' open · top left = octave key · small keys around the column = palm, side and pinky keys · fingering data: draft', 'fingerscore.eu',
  ]);
  expectSymbolBetween(p, { ...legend[0], x: MARGIN, width: 0 }, legend[0], 11 * u);
  expectSymbolBetween(p, legend[0], legend[1], 11 * u);
  expect(p.text.filter(t => t.str === 'fingerscore.eu')).toHaveLength(1);
  expect(p.text.filter(t => /page \d+ of \d+/.test(t.str))).toEqual([]);
  expect(embeddedFonts).toContain('AtkinsonHyperlegible-Bold');
});

test('the legend of a xaphoon shows three discs', async ({ page }) => {
  const { pages } = (await pdfOf(page, { inst: 'xc', caption: 'Xaphoon C · C major' })).info;
  const p = pages[0];
  const legend = lineOf(p, ' closed ');
  expect(legend.map(t => t.str).slice(0, 3)).toEqual([' closed ', ' open ', ' half-hole · top hole = thumb']);
  const u = unitOf(p);
  expectSymbolBetween(p, { ...legend[0], x: MARGIN, width: 0 }, legend[0], 11 * u);
  expectSymbolBetween(p, legend[0], legend[1], 11 * u);
  expectSymbolBetween(p, legend[1], legend[2], 11 * u);
});

test('whole range, up and down, alternates shown: several pages, no line split, footer from page 2', async ({ page }) => {
  const caption = 'Alto sax in E♭ · C major · sounds E♭ major';
  const { input, info } = await pdfOf(page, { inst: 'asax', range: 'all', direction: 'updown', showAlternates: true, caption });
  const { pages } = info;
  expect(pages.length).toBeGreaterThan(1);
  // Each page's footer: "… · page n of N" with the caption's ♭ as an outline, so the text pieces are matched by their tail.
  pages.forEach((p, n) => {
    const tail = p.text.find(t => t.str === ` major · page ${n + 1} of ${pages.length}`);
    expect(tail, `footer of page ${n + 1}`).toBeDefined();
  });
  // Every note name is drawn exactly once, and the names of one line lie on one page.
  const names = namesOf(input);
  const perPage = pages.map(p => p.text.filter(t => t.font === 'AtkinsonHyperlegible-Bold' && names.includes(t.str)));
  const lineCount = Math.ceil(names.length / 15);
  expect(lineCount).toBeGreaterThan(2);
  // Lines are consecutive blocks of 15 notes: the names of each block appear together on one page, in order.
  const order = perPage.flatMap((items, n) => items.sort((a, b) => a.y - b.y || a.x - b.x).map(t => ({ page: n, str: t.str })));
  expect(order.map(o => o.str).join(' ')).toBe(names.map(n => n.replace(/[♭♯]/g, '')).join(' '));
  for (let line = 0; line < lineCount; line++) {
    const pagesOfLine = new Set(order.slice(line * 15, (line + 1) * 15).map(o => o.page));
    expect(pagesOfLine.size, `line ${line + 1} on one page`).toBe(1);
  }
  // The option names of the alternates are drawn (one text item per wrapped line, each centred under its note).
  expect(pages[0].text.some(t => t.font === 'AtkinsonHyperlegible-Regular' && t.str.length > 3 && !/page|fingerscore/.test(t.str))).toBe(true);
});

test('the legend and the site stay together on the last page', async ({ page }) => {
  const { pages } = (await pdfOf(page, { inst: 'asax', range: 'all', direction: 'updown', showAlternates: true })).info;
  const last = pages[pages.length - 1];
  expect(last.text.some(t => t.str === 'fingerscore.eu')).toBe(true);
  expect(last.text.some(t => t.str === ' pressed ')).toBe(true);
  for (const p of pages.slice(0, -1)) expect(p.text.some(t => t.str === 'fingerscore.eu')).toBe(false);
});

test('a page is written in reading order: caption, lines, legend, site, footer', async ({ page }) => {
  const { pages } = (await pdfOf(page, { inst: 'asax', range: 'all', direction: 'updown', showAlternates: true })).info;
  expect(pages.length).toBeGreaterThan(1);
  const byOrder = (p: PdfPage) => [...p.text].sort((a, b) => a.seq - b.seq);
  const first = byOrder(pages[0]);
  expect(first[0].str).toBe('Alto sax in E');
  expect(first[first.length - 1].str).toBe(` major · page 1 of ${pages.length}`);
  const last = pages[pages.length - 1];
  const legend = last.text.find(t => t.str === ' pressed ')!;
  const site = last.text.find(t => t.str === 'fingerscore.eu')!;
  const music = last.text.filter(t => t.y < legend.y - 1);
  expect(music.length).toBeGreaterThan(0);
  expect(Math.max(...music.map(t => t.seq))).toBeLessThan(legend.seq);
  expect(legend.seq).toBeLessThan(site.seq);
  const ordered = byOrder(last);
  expect(ordered[ordered.length - 1].str).toBe(` major · page ${pages.length} of ${pages.length}`);
});

test('the fingering the player picked is the one drawn under the note', async ({ page }) => {
  // The first note with several options: its auto choice and a picked other option, as the option names under it.
  const probe = await page.evaluate(async () => {
    const load = (window as unknown as { fingerscorePdf: () => Promise<Record<string, (...a: unknown[]) => unknown>> }).fingerscorePdf;
    return Object.keys(await load());
  });
  expect(probe).toContain('scalePdf');
  const base: Spec = { inst: 'asax', range: 'all', showAlternates: true };
  const picked = await page.evaluate(async s => {
    const load = (window as unknown as { fingerscorePdf: () => Promise<Record<string, (...a: unknown[]) => unknown>> }).fingerscorePdf;
    const h = await load() as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const scale = h.buildScale({ inst: s.inst, scale: 'maj', tonicPc: 0, range: 'all', direction: 'up' });
    const f = h.scaleFingerings(s.inst, scale.notes, 'baroque', {});
    const index = f.findIndex((x: { options: unknown[] }) => x.options.length >= 2);
    const other = f[index].options.findIndex((_: unknown, j: number) => j !== f[index].auto);
    return { index, other, autoName: f[index].options[f[index].auto].n as string, otherName: f[index].options[other].n as string, note: scale.notes[index].spelled.name as string };
  }, base);
  expect(picked.index).toBeGreaterThanOrEqual(0);
  const first = (name: string) => name.split(' ')[0];

  /** The option name texts directly under the note's chart (the first one under the note name): the picked or auto choice. */
  const underNote = async (overrides: Record<number, number>) => {
    const { info } = await pdfOf(page, { ...base, overrides });
    for (const p of info.pages) {
      const name = p.text.find(t => t.str === picked.note.replace(/[♭♯]/g, ''));
      if (!name) continue;
      const cx = name.x + name.width / 2;
      return p.text.filter(t => Math.abs(t.x + t.width / 2 - cx) < 6 && t.y > name.y && t.str.length > 1)
        .sort((a, b) => a.y - b.y).map(t => t.str);
    }
    throw new Error('note not found');
  };
  const auto = await underNote({});
  const chosen = await underNote({ [picked.index]: picked.other });
  expect(auto[0]).toContain(first(picked.autoName));
  expect(chosen[0]).toContain(first(picked.otherName));
  expect(chosen[0]).not.toBe(auto[0]);
});

test('a caption with ♯ is drawn in full', async ({ page }) => {
  const { pages } = (await pdfOf(page, { inst: 'fl', tonicPc: 6, caption: 'Flute C · F♯ major' })).info;
  const p = pages[0];
  const caption = lineOf(p, 'Flute C · F');
  expect(caption.map(t => t.str)).toEqual(['Flute C · F', ' major']);
  expectSymbolBetween(p, caption[0], caption[1], 18 * unitOf(p));
});

test('a character outside the fonts rejects with the message', async ({ page }) => {
  const input = await inputOf(page, { inst: 'asax', caption: 'Саксофон' });
  const result = await hookCall<HookResult>(page, 'scalePdf', input, { language: 'de-DE' });
  expect(result.error?.name).toBe('PdfError');
  expect(result.error?.message).toContain('The PDF can\'t show these characters: С, а, к, с, о, ф, н.');
  expect(result.progress).toEqual([]);
});

test('US Letter for en-US', async ({ page }) => {
  const { pages } = (await pdfOf(page, { inst: 'asax' }, 'en-US')).info;
  expect(pages[0].width / MM).toBeCloseTo(215.9, 1);
  expect(pages[0].height / MM).toBeCloseTo(279.4, 1);
});

test('a block taller than a page is drawn scaled down, centred, alone on its page', async ({ page }) => {
  const r = await hookCall<{ pdf: string; scale: number; pageUnits: number }>(page, 'scaledBlockPdf', 2000);
  expect(r.scale).toBeCloseTo(r.pageUnits / 2000, 6);
  expect(r.scale).toBeLessThan(1);
  const { pages } = await readPdf(new Uint8Array(Buffer.from(r.pdf, 'base64')));
  expect(pages).toHaveLength(1);
  const p = pages[0];
  const u = unitOf(p);
  const fill = p.paths.filter(q => q.fill !== null).sort((a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1))[0];
  expect(fill).toBeDefined();
  expect(fill.y1).toBeCloseTo(MARGIN, 0);
  expect(fill.y2).toBeCloseTo(p.height - MARGIN, 0);
  expect((fill.x2 - fill.x1) / u).toBeCloseTo(860 * r.scale, 0);
  expect((fill.x1 + fill.x2) / 2).toBeCloseTo(p.width / 2, 0);
  // The text is scaled with the block: 20 units × scale.
  const t = p.text.find(x => x.str === 'tall block')!;
  expect(t).toBeDefined();
  expect(t.y).toBeCloseTo(MARGIN + 40 * r.scale * u, 0);
});

test('an aborted signal rejects with AbortError', async ({ page }) => {
  const input = await inputOf(page, { inst: 'asax', range: 'all', direction: 'updown', showAlternates: true });
  const before = await hookCall<HookResult>(page, 'scalePdf', input, { language: 'de-DE', abortBefore: true });
  expect(before.error?.name).toBe('AbortError');
  const during = await hookCall<HookResult>(page, 'scalePdf', input, { language: 'de-DE', abortAtPage: 1 });
  expect(during.error?.name).toBe('AbortError');
  expect(during.progressAfterAbort).toBeLessThanOrEqual(1);
});

test.describe('images for review', () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 1100, height: 900 } });

  /** The Scales page with the same settings as the PDF, as stored settings of the page. */
  async function screenshotOf(page: Page, settings: Record<string, unknown>, file: string) {
    await page.evaluate(s => localStorage.setItem('fingerscore.scales', JSON.stringify(s)), settings);
    await page.goto('/scales');
    await page.locator('[data-print-scale]').screenshot({ path: join(OUT, file) });
  }

  test('page 1 of a one-octave and of an alternates scale PDF, and the same Scales pages on screen', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const base = { inst: 'asax', scale: 'maj', tonicPc: 0, sharp: false, by: 'read', chartStyle: 'compact', recorderSystem: 'baroque', showNames: true, overrides: {} };
    const one = { ...base, range: 'one', direction: 'up', showAlternates: false };
    const all = { ...base, range: 'all', direction: 'updown', showAlternates: true };
    for (const [name, s] of [['scale', one], ['scale-alternates', all]] as const) {
      const caption = await page.goto('/scales').then(async () => {
        await page.evaluate(v => localStorage.setItem('fingerscore.scales', JSON.stringify(v)), s);
        await page.goto('/scales');
        return page.locator('h2').first().textContent();
      });
      const input = await inputOf(page, { inst: s.inst, range: s.range as 'one', direction: s.direction as 'up', showAlternates: s.showAlternates, caption: caption! });
      const { bytes } = await makePdf(page, input);
      writeFileSync(join(OUT, `${name}.pdf`), bytes);
      writeFileSync(join(OUT, `${name}-p1.png`), await renderPdfPage(bytes, 1, 150));
      await screenshotOf(page, s, `${name}-screen.png`);
    }
  });
});
