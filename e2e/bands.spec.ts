import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { renderPdfPage } from './readPdf';

/** Where the pictures for looking at go; the pictures are written only when BANDS_OUT is set. */
const OUT = process.env.BANDS_OUT;

// Documents are built in the page from the dev hook's helpers (src/pdf/devHook.ts); a builder is passed as source text.
type Builder = string;

/** The sample song without chords, lyrics, endings and repeats: no band is in use. */
const BARE = `const d = h.sampleDoc(); d.chords = {}; for (const b of d.score) { b.volta = ''; b.rs = false; b.re = false; for (const e of b.ev) e.l = ''; }`;
const MARKS = `d.score[0].segno = true; d.score[3].fine = true; d.score[4].coda = true; d.score[5].toCoda = true; d.score[16].jump = 'dsCoda';`;
const LYRICS = `for (const e of d.score.flatMap(b => b.ev).filter(e => !e.r)) e.l = 'la';`;
const bare: Builder = `h => { ${BARE} return d; }`;
const bareMarks: Builder = `h => { ${BARE} ${MARKS} return d; }`;
const lyricsMarks: Builder = `h => { ${BARE} ${LYRICS} ${MARKS} return d; }`;
const allMarks: Builder = `h => { const d = h.sampleDoc(); ${MARKS} return d; }`;
/** Lyrics, and a C6 (written pitch 84) in the third bar. */
const highNote: Builder = `h => { ${BARE} ${LYRICS} d.score[2].ev[1].m = 84; return d; }`;

async function hook<T>(page: Page, fn: string, build: Builder, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ([name, source, rest]) => {
    const load = (window as unknown as { fingerscorePdf?: () => Promise<Record<string, unknown>> }).fingerscorePdf;
    if (!load) throw new Error('no PDF hook on this page');
    const h = await load();
    const doc = (new Function(`return (${source})`)() as (helpers: unknown) => unknown)(h);
    return (h[name] as (...a: unknown[]) => Promise<unknown>)(doc, ...rest);
  }, [fn, build, args] as const) as Promise<T>;
}

const systemHeights = (page: Page) => page.getByTestId('system').evaluateAll(els => els.map(e => Number(e.getAttribute('height'))));

/** A sheet of 40 bars of quarters and no chord, lyric, ending or mark, opened in the app. */
async function openBare(page: Page, bars = 8) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  const abc = ['X:1', 'T:Bare', 'M:4/4', 'L:1/4', 'Q:1/4=100', 'K:C', ...Array.from({ length: bars }, () => 'C D E F |')].join('\n');
  await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles({ name: 'bare.abc', mimeType: 'text/plain', buffer: Buffer.from(abc) });
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/sheet$/);
  await expect(page.getByTestId('system').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the systems of a bare sheet are 230 px tall, and those of the sample song, which uses every band but has no high note, 290 px', async ({ page }) => {
  expect(await hook<{ systemHeight: number }>(page, 'geometry', bare)).toMatchObject({ systemHeight: 230 });
  const sample = await hook<{ systemHeight: number }>(page, 'geometry', `h => h.sampleDoc()`);
  expect(sample.systemHeight).toBe(290);
});

test('Lyrics mode adds 24 px to every system of a bare sheet, Chords mode 22 px, and View takes them away', async ({ page }) => {
  await openBare(page);
  expect(await systemHeights(page)).toEqual([230, 230]);
  await page.getByRole('radio', { name: 'Lyrics' }).click();
  expect(await systemHeights(page)).toEqual([254, 254]);
  await page.getByRole('radio', { name: 'Chords' }).click();
  expect(await systemHeights(page)).toEqual([252, 252]);
  await page.getByRole('radio', { name: 'View' }).click();
  expect(await systemHeights(page)).toEqual([230, 230]);
});

test('a sheet printed while Lyrics mode is on prints without the empty band', async ({ page }) => {
  await openBare(page);
  await page.getByRole('radio', { name: 'Lyrics' }).click();
  expect(await systemHeights(page)).toEqual([254, 254]);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  expect(await systemHeights(page)).toEqual([230, 230]);
  const boxes = await page.getByTestId('system').evaluateAll(els => els.map(e => e.parentElement!.getBoundingClientRect().height));
  expect(boxes).toEqual([230, 230]);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(await systemHeights(page)).toEqual([254, 254]);
});

test('switching to Lyrics mode keeps the system under the reader\'s eyes where it is', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 500 });
  await openBare(page, 40);
  const systems = page.getByTestId('system');
  await systems.nth(6).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 100));
  const topOf = (n: number) => systems.nth(n).evaluate(e => e.getBoundingClientRect().top);
  const viewport = 500;
  const reading = await systems.evaluateAll((els, h) => els.findIndex(e => e.getBoundingClientRect().bottom > 0 && e.getBoundingClientRect().top < h), viewport);
  expect(reading).toBeGreaterThan(3);
  const before = await topOf(reading);
  await page.getByRole('radio', { name: 'Lyrics' }).dispatchEvent('click');   // a real click would scroll the toolbar into view
  expect(await systemHeights(page)).toEqual(Array(10).fill(254));
  expect(Math.abs((await topOf(reading)) - before), `system ${reading} stays in place (24 px per system above it would have moved it by ${24 * reading})`).toBeLessThanOrEqual(2);
});

test.describe('pictures (set BANDS_OUT to run)', () => {
  test.skip(!OUT, 'BANDS_OUT is not set');
  test.use({ deviceScaleFactor: 2 });

  test('the sheets of the bands rule on screen, and page 1 of the PDF of a bare sheet with marks', async ({ page }) => {
    mkdirSync(OUT!, { recursive: true });
    await page.emulateMedia({ colorScheme: 'light' });
    for (const [name, build] of [
      ['bands-bare', bare], ['bands-bare-marks', bareMarks], ['bands-lyrics-marks', lyricsMarks], ['bands-all-marks', allMarks], ['bands-high-note', highNote],
    ] as const) {
      await hook(page, 'showPaper', build);
      await page.locator('#pdf-screen [data-testid="paper"]').screenshot({ path: join(OUT!, `${name}.png`) });
    }
    const result = await hook<{ pdf?: string; error?: { message: string } }>(page, 'sheetPdf', bareMarks, { language: 'de-DE' });
    expect(result.error).toBeUndefined();
    writeFileSync(join(OUT!, 'bands-pdf-p1.png'), await renderPdfPage(new Uint8Array(Buffer.from(result.pdf!, 'base64')), 1, 150));
  });

  test('a bare sheet in Lyrics mode', async ({ page }) => {
    mkdirSync(OUT!, { recursive: true });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1300, height: 1500 });
    await openBare(page);
    await page.getByRole('radio', { name: 'Lyrics' }).click();
    await page.getByTestId('paper').screenshot({ path: join(OUT!, 'bands-lyrics-mode.png') });
  });
});
