import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectInside, expectSymbolBetween, lineOf, MARGIN, MM, pdfTitle, unitOf } from './pdfHelpers';
import { readPdf, renderPdfPage, type PdfPage, type PdfPath, type PdfText } from './readPdf';

/** Where the images for looking at go; the images test runs only when PDF_OUT is set. */
const OUT = process.env.PDF_OUT;

const REGULAR = 'AtkinsonHyperlegible-Regular';
const BOLD = 'AtkinsonHyperlegible-Bold';

interface Spec {
  inst: string; scale?: string; tonicPc?: number; range?: 'one' | 'two' | 'all'; direction?: 'up' | 'updown';
  sharp?: boolean; showAlternates?: boolean; showNames?: boolean; caption?: string; overrides?: Record<number, number>;
}

interface HookResult { pdf?: string; type?: string; error?: { name: string; message: string }; progress: [number, number][]; progressAfterAbort: number; ms: number }
interface ScaleInput { inst: string; scale: { notes: { spelled: { name: string } }[] }; caption: string; overrides: Record<number, number>; legend: string }

/** What the page model lays out (src/pdf/devHook.ts `scalePlan`), in units of the content box. */
interface Plan {
  pages: { blocks: { kind: string; index?: number; y: number; height: number; scale: number; x0: number }[] }[];
  lines: { viewTop: number; notes: { x: number; name: string; options: { option: number; labelY: number; lines: string[] }[] }[] }[];
}

/** The input of makeScalePdf for a scale page's settings, made in the page by the dev hook's helpers (src/pdf/devHook.ts). */
async function inputOf(page: Page, spec: Spec): Promise<ScaleInput> {
  return page.evaluate(async s => {
    const load = (window as unknown as { fingerscorePdf?: () => Promise<Record<string, (...a: unknown[]) => unknown>> }).fingerscorePdf;
    if (!load) throw new Error('no PDF hook on this page');
    const h = await load();
    const scale = s.scale ?? 'maj';
    const built = h.buildScale({ inst: s.inst, scale, tonicPc: s.tonicPc ?? 0, sharp: s.sharp ?? false, range: s.range ?? 'one', direction: s.direction ?? 'up' });
    return {
      inst: s.inst, legend: h.legend(s.inst) as string, scale: built, scaleName: scale === 'maj' ? 'major' : scale, caption: s.caption ?? 'Alto sax in E♭ · C major · sounds E♭ major',
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

/** The written names of the scale's notes, in order (e.g. "C4", "F♯4"). */
const namesOf = (input: ScaleInput) => input.scale.notes.map(n => n.spelled.name);

const planOf = (page: Page, input: ScaleInput, language = 'de-DE') => hookCall<Plan>(page, 'scalePlan', input, { language });

type Placed = Plan['pages'][number]['blocks'][number];
/** The page with line `index` and the line's block on it. */
function lineOn(plan: Plan, index: number): { page: number; block: Placed } {
  for (let n = 0; n < plan.pages.length; n++) {
    const block = plan.pages[n].blocks.find(b => b.kind === 'line' && b.index === index);
    if (block) return { page: n, block };
  }
  throw new Error(`line ${index} is on no page`);
}

/** Points on the page of a position in units: x along the line, v in the line svg's coordinates. */
const pageX = (p: PdfPage, b: Placed, x: number) => MARGIN + (b.x0 + x * b.scale) * unitOf(p);
const pageY = (p: PdfPage, b: Placed, plan: Plan, line: number, v: number) => MARGIN + (b.y + (v - plan.lines[line].viewTop) * b.scale) * unitOf(p);

const strip = (s: string) => s.replace(/[♭♯♮𝄫𝄪]/gu, '');

/**
 * The texts of one font inside the line's box, one string per note column and baseline: the pieces of a text
 * (symbols are outlines, not text) joined left to right. A text belongs to the column whose note is nearest.
 */
function columnTexts(p: PdfPage, plan: Plan, line: number, b: Placed, font: string): string[] {
  const u = unitOf(p);
  const top = MARGIN + b.y * u - 3 * u;
  const bottom = top + 3 * u + b.height * u + 3 * u;
  const xs = plan.lines[line].notes.map(n => pageX(p, b, n.x));
  const groups = new Map<string, PdfText[]>();
  for (const t of p.text) {
    if (t.font !== font || t.y < top || t.y > bottom) continue;
    const c = t.x + t.width / 2;
    const col = xs.reduce((best, x, k) => (Math.abs(x - c) < Math.abs(xs[best] - c) ? k : best), 0);
    const key = `${col}|${t.y.toFixed(1)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()].map(g => g.sort((a, c) => a.x - c.x).map(t => t.str).join('')).sort();
}

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
  // "● pressed   ○ open · …": the discs are outlines, the white space runs collapse as on the page.
  const [, pressed, open] = input.legend.replace(/\s+/g, ' ').match(/^● (pressed) ○ (open.*)$/)!;
  expect(legend.map(t => t.str)).toEqual([` ${pressed} `, ` ${open}`, 'fingerscore.eu']);
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

/** Ink that may reach past a line's box, in units: measured 0 (the tolerance only absorbs rounding). */
const OVERHANG = 0.1;

const WHOLE: Spec = { inst: 'asax', range: 'all', direction: 'updown', showAlternates: true };

for (const [title, spec] of [
  ['alto sax C major, whole range up and down', WHOLE],
  ['tenor sax C major, whole range up and down (the last page is shrunk to keep the legend)', { ...WHOLE, inst: 'tsax' }],
] as [string, Spec][]) {
  test(`${title}: pages, footer, every line whole with its names, charts and option labels on one page`, async ({ page }) => {
    const input = await inputOf(page, { ...spec, caption: 'Alto sax in E♭ · C major · sounds E♭ major' });
    const plan = await planOf(page, input);
    const { pages } = (await pdfOf(page, { ...spec, caption: input.caption })).info;
    expect(pages).toHaveLength(plan.pages.length);
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((p, n) => expect(p.text.find(t => t.str === ` major · page ${n + 1} of ${pages.length}`), `footer of page ${n + 1}`).toBeDefined());

    const seen = new Set<number>();
    const footerOf = (n: number) => ` major · page ${n + 1} of ${pages.length}`;
    pages.forEach((p, n) => {
      const u = unitOf(p);
      const where = `page ${n + 1}`;

      // The footer is the text pieces on the baseline of the item "… major · page n of N" and the two ♭ outlines among them.
      const footerTail = p.text.filter(t => t.str === footerOf(n));
      expect(footerTail, `one footer on ${where}`).toHaveLength(1);
      const fy = footerTail[0].y;
      const footerTexts = p.text.filter(t => Math.abs(t.y - fy) < 0.3);
      expect(footerTexts.map(t => t.str).join(''), `footer text on ${where}`).toBe(`Alto sax in E · C major · sounds E${footerOf(n)}`);
      const [fx1, fx2] = [Math.min(...footerTexts.map(t => t.x)), Math.max(...footerTexts.map(t => t.x + t.width))];
      const isFooterPath = (q: PdfPath) => q.y1 >= fy - 12 * u && q.y2 <= fy + 3 * u && q.x1 >= fx1 - 0.5 && q.x2 <= fx2 + 0.5;
      expect(p.paths.filter(isFooterPath), `the footer's two ♭ outlines on ${where}`).toHaveLength(2);
      expect(fy, 'the footer stands in the bottom margin').toBeGreaterThan(p.height - MARGIN);
      expect(fx1).toBeGreaterThanOrEqual(MARGIN);
      expect(fx2).toBeLessThanOrEqual(p.width - MARGIN);

      // Everything else ends above the bottom margin line, starts below the top one and lies between the side margins.
      const texts = p.text.filter(t => Math.abs(t.y - fy) >= 0.3);
      const paths = p.paths.filter(q => !isFooterPath(q));
      for (const t of texts) expectInside(p, t.x, t.y, t.x + t.width, t.y, `text "${t.str}" on ${where}`);
      for (const q of paths) expectInside(p, q.x1, q.y1, q.x2, q.y2, `path at ${q.x1.toFixed(1)}, ${q.y1.toFixed(1)} on ${where}`);

      // Each item belongs to exactly one block by its vertical centre (a text's centre: 4 units above its baseline) and lies inside it.
            const blocks = plan.pages[n].blocks.map(blk => ({ blk, top: MARGIN + blk.y * u, bottom: MARGIN + (blk.y + blk.height) * u }));
      const owner = (centre: number) => {
        const hit = blocks.filter(x => centre >= x.top && centre <= x.bottom);
        expect(hit.length, `item centred at y=${centre.toFixed(1)} on ${where} is in exactly one block`).toBe(1);
        return hit[0];
      };
      const items = new Map<Placed, { texts: PdfText[]; paths: PdfPath[] }>(blocks.map(x => [x.blk, { texts: [], paths: [] }]));
      for (const t of texts) {
        const x = owner(t.y - 4 * u);
        items.get(x.blk)!.texts.push(t);
        expect(t.y, `text "${t.str}" in its block`).toBeGreaterThanOrEqual(x.top - OVERHANG * u);
        expect(t.y, `text "${t.str}" in its block`).toBeLessThanOrEqual(x.bottom + OVERHANG * u);
      }
      for (const q of paths) {
        const x = owner((q.y1 + q.y2) / 2);
        items.get(x.blk)!.paths.push(q);
        expect(q.y1, `path at ${q.x1.toFixed(1)}, ${q.y1.toFixed(1)} in its block`).toBeGreaterThanOrEqual(x.top - OVERHANG * u);
        expect(q.y2, `path at ${q.x1.toFixed(1)}, ${q.y1.toFixed(1)} in its block`).toBeLessThanOrEqual(x.bottom + OVERHANG * u);
      }

      // Each line's names, option labels and charts are what the page model plans for it, on the page of the line.
      for (const { blk: b } of blocks.filter(x => x.blk.kind === 'line')) {
        const line = b.index!;
        const mine = items.get(b)!;
        const us = u * b.scale;
        seen.add(line);
        expect(columnTexts(p, plan, line, b, BOLD), `note names of line ${line + 1}`).toEqual(plan.lines[line].notes.map(k => strip(k.name)).sort());
        const labels = plan.lines[line].notes.flatMap(k => k.options.flatMap(o => o.lines.map(strip)));
        expect(labels.length, `line ${line + 1} has option labels`).toBeGreaterThan(0);
        expect(columnTexts(p, plan, line, b, REGULAR), `option labels of line ${line + 1}`).toEqual(labels.sort());
        expect(mine.texts.filter(t => t.font !== BOLD && t.font !== REGULAR), `line ${line + 1} has only names and option labels as texts`).toEqual([]);

        // Charts: each stacked option of each note is one box under its note (88 units tall, ending 12 above its label's baseline).
        // Expected from the plan: one non-empty chart box per (note, option); every path below the names is inside one of them.
        const notes = plan.lines[line].notes;
        const boxes = notes.flatMap((k, c) => k.options.map(o => ({
          c, x: pageX(p, b, k.x), top: pageY(p, b, plan, line, o.labelY - 12 - 88), bottom: pageY(p, b, plan, line, o.labelY - 12),
        })));
        const chartsTop = Math.min(...boxes.map(x => x.top));
        const chartPaths = mine.paths.filter(q => (q.y1 + q.y2) / 2 >= chartsTop - 0.3);
        const claimed = new Set<PdfPath>();
        let nonEmpty = 0;
        for (const x of boxes) {
          const inside = chartPaths.filter(q => q.x1 >= x.x - 25 * us && q.x2 <= x.x + 25 * us && q.y1 >= x.top - 0.3 && q.y2 <= x.bottom + 0.3);
          inside.forEach(q => claimed.add(q));
          if (inside.length > 0) nonEmpty++;
          expect(x.bottom, `chart of note ${x.c + 1} of line ${line + 1} ends inside the line's box`).toBeLessThanOrEqual(MARGIN + (b.y + b.height) * u + OVERHANG * u);
        }
        expect(nonEmpty, `line ${line + 1}: charts drawn = options stacked`).toBe(boxes.length);
        // Under each column's box lies its label band, from the box's bottom to the last label line: it holds the label's symbol
        // outlines (♯, ♭) and the low satellite keys that hang below the column (up to 11.1 units on alto and tenor sax, as on screen).
        const rawLabels = notes.flatMap(k => k.options.flatMap(o => o.lines));
        const symbolCount = rawLabels.join('').replace(/[^♭♯♮𝄫𝄪]/gu, '').length;
        const bands = notes.flatMap(k => k.options.map(o => ({
          x: pageX(p, b, k.x), top: pageY(p, b, plan, line, o.labelY - 12), bottom: pageY(p, b, plan, line, o.labelY + (o.lines.length - 1) * 12 + 4),
        })));
        const inBand = chartPaths.filter(q => !claimed.has(q) && bands.some(z => Math.abs((q.x1 + q.x2) / 2 - z.x) < 25 * us && q.y1 >= z.top - 0.3 && q.y2 <= z.bottom + 0.3));
        expect(inBand.length, `line ${line + 1}: the label bands hold at least the labels' symbol outlines`).toBeGreaterThanOrEqual(symbolCount);
        inBand.forEach(q => claimed.add(q));
        expect(chartPaths.filter(q => !claimed.has(q)).length, `line ${line + 1}: paths under the names outside any chart`).toBe(0);
      }
    });
    expect([...seen].sort((a, b) => a - b)).toEqual(plan.lines.map((_, i) => i));
  });
}

test('names with accidentals are drawn as pieces around an outline, centred on the note', async ({ page }) => {
  const input = await inputOf(page, { inst: 'fl', tonicPc: 6, sharp: true, caption: 'Flute C · F♯ major' });
  const plan = await planOf(page, input);
  const { pages } = await readPdf((await makePdf(page, input)).bytes);
  const { page: n, block } = lineOn(plan, 0);
  const p = pages[n];
  const u = unitOf(p);
  const sharps = plan.lines[0].notes.filter(k => /[♭♯]/.test(k.name));
  expect(sharps.map(k => k.name), 'precondition (spelling): F♯ major on flute names F♯4').toContain('F♯4');
  for (const note of sharps) {
    const cx = pageX(p, block, note.x);
    const items = p.text.filter(t => t.font === BOLD && Math.abs(t.x + t.width / 2 - cx) < 20 * u
      && t.y > MARGIN + block.y * u && t.y < MARGIN + (block.y + block.height) * u && !/[a-z]/.test(t.str))
      .sort((a, c) => a.x - c.x);
    expect(items.map(t => t.str), `pieces of ${note.name}`).toEqual([note.name[0], note.name.slice(-1)]);
    expect(Math.abs(items[0].y - items[1].y)).toBeLessThan(0.3);
    expectSymbolBetween(p, items[0], items[1], 12 * u);
    expect(Math.abs((items[0].x + items[1].x + items[1].width) / 2 - cx), `${note.name} centred`).toBeLessThan(1 * u);
  }
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

test('the fingering the player picked is the chart drawn: it equals the auto PDF\'s block of that option', async ({ page }) => {
  const base: Spec = { inst: 'asax', range: 'all', showAlternates: true };
  const autoInput = await inputOf(page, base);
  const autoPlan = await planOf(page, autoInput);
  // The note with the most options; its last block in the auto stack is the pick.
  let note = { line: 0, col: 0, count: 0 };
  autoPlan.lines.forEach((l, line) => l.notes.forEach((k, col) => { if (k.options.length > note.count) note = { line, col, count: k.options.length }; }));
  expect(note.count, 'precondition (fingering data): a note on alto sax with at least three options').toBeGreaterThanOrEqual(3);
  const index = note.line * 15 + note.col;
  const stack = autoPlan.lines[note.line].notes[note.col].options;
  const pos = note.count - 1;
  const other = stack[pos].option;
  expect(other).not.toBe(stack[0].option);

  const pickedInput = await inputOf(page, { ...base, overrides: { [index]: other } });
  const pickedPlan = await planOf(page, pickedInput);
  expect(pickedPlan.lines[note.line].notes[note.col].options[0].option).toBe(other);

  /** The painted paths of one chart block of the note's column, relative to the column and the block's top, in units. */
  const chart = async (input: ScaleInput, plan: Plan, at: number) => {
    const { page: n, block } = lineOn(plan, note.line);
    const p = (await readPdf((await makePdf(page, input)).bytes)).pages[n];
    const u = unitOf(p) * block.scale;
    const cx = pageX(p, block, plan.lines[note.line].notes[note.col].x);
    const labelY = plan.lines[note.line].notes[note.col].options[at].labelY;
    // A chart is 88 units tall and ends 12 units above its label's baseline.
    const top = pageY(p, block, plan, note.line, labelY - 12 - 88);
    const bottom = pageY(p, block, plan, note.line, labelY - 12);
    return p.paths.filter(q => q.x1 >= cx - 25 * u && q.x2 <= cx + 25 * u && q.y1 >= top - 0.3 && q.y2 <= bottom + 0.3)
      .map(q => [(q.x1 - cx) / u, (q.y1 - top) / u, (q.x2 - cx) / u, (q.y2 - top) / u, q.fill ?? '-', q.stroke ?? '-'] as const)
      .sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2] || a[3] - b[3]);
  };
  const autoFirst = await chart(autoInput, autoPlan, 0);
  const autoAtPos = await chart(autoInput, autoPlan, pos);
  const pickedFirst = await chart(pickedInput, pickedPlan, 0);
  expect(autoFirst.length).toBeGreaterThan(5);
  const same = (a: typeof autoFirst, b: typeof autoFirst) => a.length === b.length
    && a.every((r, i) => [0, 1, 2, 3].every(k => Math.abs((r[k] as number) - (b[i][k] as number)) <= 0.5) && r[4] === b[i][4] && r[5] === b[i][5]);
  expect(same(pickedFirst, autoFirst), 'the picked chart differs from the auto chart').toBe(false);
  expect(same(pickedFirst, autoAtPos), 'the picked chart equals the auto PDF\'s block of that option').toBe(true);
});

test('reading order on the first and the last page: caption, note names, legend, site, footer', async ({ page }) => {
  const input = await inputOf(page, WHOLE);
  const plan = await planOf(page, input);
  const { pages } = (await makePdf(page, input).then(r => readPdf(r.bytes)));
  const u = unitOf(pages[0]);
  const inBlock = (n: number, b: Placed) => pages[n].text.filter(t => t.y >= MARGIN + b.y * u - 3 * u && t.y <= MARGIN + (b.y + b.height) * u + 6 * u);
  const firstPage = plan.pages[0].blocks;
  const caption = pages[0].text.find(t => t.str === 'Alto sax in E')!;
  const firstLine = inBlock(0, firstPage.find(b => b.kind === 'line')!);
  expect(firstLine.length).toBeGreaterThan(0);
  expect(caption.seq).toBeLessThan(Math.min(...firstLine.map(t => t.seq)));

  const n = pages.length - 1;
  const last = pages[n];
  const lastBlocks = plan.pages[n].blocks;
  const lastLine = lastBlocks.filter(b => b.kind === 'line').pop()!;
  const names = columnTexts(last, plan, lastLine.index!, lastLine, BOLD);
  expect(names.length).toBeGreaterThan(0);
  const lineTexts = inBlock(n, lastLine);
  const legend = last.text.find(t => t.str === ' pressed ')!;
  const site = last.text.find(t => t.str === 'fingerscore.eu')!;
  const footer = last.text.find(t => t.str === ` major · page ${n + 1} of ${pages.length}`)!;
  expect(Math.max(...lineTexts.map(t => t.seq))).toBeLessThan(legend.seq);
  expect(legend.seq).toBeLessThan(site.seq);
  expect(site.seq).toBeLessThan(footer.seq);
  expect(Math.max(...last.text.map(t => t.seq))).toBe(footer.seq);
});

test('a legend that would stand alone stays on the page: the lines shrink, the legend keeps its size', async ({ page }) => {
  // Soprano sax, chromatic, two octaves, alternates, no names: one page only because the page model shrinks the lines to 0.98.
  const spec: Spec = { inst: 'ssax', scale: 'chrom', range: 'two', direction: 'up', showAlternates: true, showNames: false, caption: 'Soprano sax · C chromatic' };
  const input = await inputOf(page, spec);
  const plan = await planOf(page, input);
  expect(plan.pages, 'precondition (fingering data): this scale fits one page only with the shrunk lines').toHaveLength(1);
  const blocks = plan.pages[0].blocks;
  const lines = blocks.filter(b => b.kind === 'line');
  expect(lines.length, 'precondition: several lines').toBeGreaterThan(1);
  for (const b of lines) expect(b.scale).toBeCloseTo(0.98, 2);
  const legendBlock = blocks.find(b => b.kind === 'legend')!;
  expect(legendBlock.scale).toBe(1);
  // Without the rule the legend would stand alone on a second page: the caption (40) and the lines (each followed by a gap of
  // 8, src/render/ScaleStaff.module.css, except the last) fit an A4 content box of (297 - 24) / ((210 - 24) / 860) units, the legend added does not.
  const pageUnits = (297 - 24) / ((210 - 24) / 860);
  const beforeLegend = 40 + lines.reduce((sum, b) => sum + b.height / b.scale, 0) + 8 * (lines.length - 1);
  expect(beforeLegend, 'caption and lines fit the page without the legend').toBeLessThanOrEqual(pageUnits);
  expect(beforeLegend + legendBlock.height, 'with the legend they do not: without the rule it would be alone on page 2').toBeGreaterThan(pageUnits);
  expect(lines[0].scale, 'the shrink is exactly what makes room for the legend').toBeCloseTo((pageUnits - legendBlock.height) / beforeLegend, 3);
  const { pages } = await readPdf((await makePdf(page, input)).bytes);
  expect(pages).toHaveLength(1);
  const p = pages[0];
  const u = unitOf(p);
  expect(p.text.some(t => t.str === 'fingerscore.eu')).toBe(true);
  expect(p.text.filter(t => /page \d+ of \d+/.test(t.str))).toEqual([]);
  for (const t of p.text) expectInside(p, t.x, t.y, t.x + t.width, t.y, `text "${t.str}"`);
  for (const q of p.paths) expectInside(p, q.x1, q.y1, q.x2, q.y2, `path at ${q.x1.toFixed(1)}, ${q.y1.toFixed(1)}`);
  // The staff lines of a shrunk line are 860 × 0.98 units wide, centred; the legend's rule is the full width.
  const wide = p.paths.filter((q: PdfPath) => q.x2 - q.x1 > 600 * u && q.y2 - q.y1 < 2 * u);
  const rule = wide.filter(q => q.x2 - q.x1 > 859 * u).length;
  const staff = wide.filter(q => q.x2 - q.x1 <= 859 * u);
  expect(rule).toBe(1);
  expect(staff.length).toBeGreaterThanOrEqual(5);   // the five staff lines of each full-width line
  for (const q of staff.filter(q => q.x2 - q.x1 > 0.97 * 860 * u)) expect((q.x1 + q.x2) / 2).toBeCloseTo(p.width / 2, 0);
  expect(Math.max(...staff.map(q => q.x2 - q.x1)) / u).toBeCloseTo(860 * 0.98, 0);
});

test('the document title is the caption', async ({ page }) => {
  const caption = 'Alto sax in E♭ · C major · sounds E♭ major';
  const { bytes } = await makePdf(page, await inputOf(page, { inst: 'asax', caption }));
  expect(await pdfTitle(bytes)).toBe(caption);
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

test.describe('images for review (set PDF_OUT to run)', () => {
  test.skip(!OUT, 'PDF_OUT is not set');
  test.use({ deviceScaleFactor: 2, viewport: { width: 1100, height: 900 } });

  /** The Scales page with the same settings as the PDF, as stored settings of the page. */
  async function screenshotOf(page: Page, settings: Record<string, unknown>, file: string) {
    await page.evaluate(s => localStorage.setItem('fingerscore.scales', JSON.stringify(s)), settings);
    await page.goto('/scales');
    await page.locator('[data-print-scale]').screenshot({ path: join(OUT!, file) });
  }

  test('page 1 of a one-octave and of an alternates scale PDF, and the same Scales pages on screen', async ({ page }) => {
    mkdirSync(OUT!, { recursive: true });
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
      writeFileSync(join(OUT!, `${name}.pdf`), bytes);
      writeFileSync(join(OUT!, `${name}-p1.png`), await renderPdfPage(bytes, 1, 150));
      await screenshotOf(page, s, `${name}-screen.png`);
    }
  });
});
