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

/** A sheet of `bars` bars of quarters and no chord, lyric, ending or mark, opened in the app. */
async function openBare(page: Page, bars = 8) {
  await openAbc(page, ['X:1', 'T:Bare', 'M:4/4', 'L:1/4', 'Q:1/4=100', 'K:C', ...Array.from({ length: bars }, () => 'C D E F |')].join('\n'));
}

async function openAbc(page: Page, abc: string) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles({ name: 'bare.abc', mimeType: 'text/plain', buffer: Buffer.from(abc) });
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/sheet$/);
  await expect(page.getByTestId('system').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the systems of a bare sheet are 236 px tall, and those of the sample song, which uses every band but has no high note, 290 px', async ({ page }) => {
  expect(await hook<{ systemHeight: number }>(page, 'geometry', bare)).toMatchObject({ systemHeight: 236 });
  const sample = await hook<{ systemHeight: number }>(page, 'geometry', `h => h.sampleDoc()`);
  expect(sample.systemHeight).toBe(290);
});

test('Lyrics mode stacks the lyric band in every system of a bare sheet (254 px), Chords mode the chord band (252 px), and View takes them away', async ({ page }) => {
  await openBare(page);
  expect(await systemHeights(page)).toEqual([236, 236]);
  await page.getByRole('radio', { name: 'Lyrics' }).click();
  expect(await systemHeights(page)).toEqual([254, 254]);
  await page.getByRole('radio', { name: 'Chords' }).click();
  expect(await systemHeights(page)).toEqual([252, 252]);
  await page.getByRole('radio', { name: 'View' }).click();
  expect(await systemHeights(page)).toEqual([236, 236]);
});

test('a sheet printed while Lyrics mode is on prints without the empty band', async ({ page }) => {
  await openBare(page);
  await page.getByRole('radio', { name: 'Lyrics' }).click();
  expect(await systemHeights(page)).toEqual([254, 254]);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  expect(await systemHeights(page)).toEqual([236, 236]);
  const boxes = await page.getByTestId('system').evaluateAll(els => els.map(e => e.parentElement!.getBoundingClientRect().height));
  expect(boxes).toEqual([236, 236]);
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

/** The 40-bar sheets of the view tests: a chord and an ending in the first four bars, then plain bars (and a lyric in bar 1 when asked). */
const longSheet = (lyric: boolean) => ['X:1', 'T:Long', 'M:4/4', 'L:1/4', 'Q:1/4=100', 'K:C',
  '"C"C D E F |: C D E F |[1 C D E F :|[2 C D E F |', ...(lyric ? ['w: la la la la'] : []), ...Array.from({ length: 36 }, () => 'C D E F |')].join('\n');

/** Scrolls into the sheet, selects a note that is fully on screen and returns its id; `topOf` then gives its column's place on screen. */
async function selectVisibleNote(page: Page) {
  await page.getByTestId('system').nth(5).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  const index = await page.locator('[data-hit]').evaluateAll(els => els.findIndex(e => {
    const r = e.getBoundingClientRect();
    return r.top > 60 && r.bottom < window.innerHeight - 20;
  }));
  expect(index).toBeGreaterThan(8);
  const hit = page.locator('[data-hit]').nth(index);
  const id = (await hit.getAttribute('data-hit'))!;
  await hit.click();
  await expect(page.locator(`[data-ev="${id}"][data-selected="true"]`)).toHaveCount(1);
  return { id, topOf: () => page.locator(`[data-hit="${id}"]`).evaluate(e => e.getBoundingClientRect().top) };
}

test.describe('the view stays where it is when the systems change height', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1300, height: 800 }); });

  test('chords and endings, no lyrics: Lyrics mode brings the shift to 0 and the drawing is remounted; the selected note stays', async ({ page }) => {
    await openAbc(page, longSheet(false));
    expect(await systemHeights(page).then(h => h[0])).toBe(15 + 22 + 14 + 215);      // 51 px above the staff top: shift -24
    const note = await selectVisibleNote(page);
    const before = await note.topOf();
    await page.getByRole('radio', { name: 'Lyrics' }).dispatchEvent('click');
    expect((await systemHeights(page))[0]).toBe(290);                                  // shift 0: no wrapper around the drawing
    expect(Math.abs((await note.topOf()) - before)).toBeLessThanOrEqual(2);
    await page.getByRole('radio', { name: 'View' }).dispatchEvent('click');
    expect((await systemHeights(page))[0]).toBe(266);
    expect(Math.abs((await note.topOf()) - before)).toBeLessThanOrEqual(2);
  });

  test('a Show switch and undo: the selected note stays', async ({ page }) => {
    await openAbc(page, longSheet(true));
    const note = await selectVisibleNote(page);
    const before = await note.topOf();
    const lyrics = page.getByLabel('Lyrics', { exact: true }).and(page.locator('input[type=checkbox]'));
    const h0 = (await systemHeights(page))[0];
    await lyrics.dispatchEvent('click');                                               // switch lyrics off: the band goes in every system
    expect((await systemHeights(page))[0]).toBeLessThan(h0);
    expect(Math.abs((await note.topOf()) - before)).toBeLessThanOrEqual(2);
    await lyrics.dispatchEvent('click');
    expect((await systemHeights(page))[0]).toBe(h0);
    expect(Math.abs((await note.topOf()) - before)).toBeLessThanOrEqual(2);

    // a Segno from the Edit notes panel adds the marks row (30 px); undo takes it away again
    await page.getByRole('radio', { name: 'Edit notes' }).dispatchEvent('click');
    const withPanel = await note.topOf();
    await page.getByRole('group', { name: 'Edit notes panel' }).getByRole('button', { name: 'Segno' }).click();
    expect((await systemHeights(page))[0]).toBe(h0 + 30);
    expect(Math.abs((await note.topOf()) - withPanel)).toBeLessThanOrEqual(2);
    await page.getByRole('button', { name: 'Undo' }).dispatchEvent('click');
    expect((await systemHeights(page))[0]).toBe(h0);
    expect(Math.abs((await note.topOf()) - withPanel)).toBeLessThanOrEqual(2);
  });
});

test('the bar number of a bare sheet\'s second system lies inside the system\'s real box', async ({ page }) => {
  await openBare(page);
  const { svg, text } = await page.evaluate(() => {
    const systems = Array.from(document.querySelectorAll('svg[data-testid="system"]'));
    const t = systems[1].querySelector('[data-bar-number]')!.getBoundingClientRect();
    const s = systems[1].getBoundingClientRect();
    return { svg: { top: s.top, bottom: s.bottom }, text: { top: t.top, bottom: t.bottom } };
  });
  expect(text.top).toBeGreaterThanOrEqual(svg.top);
  expect(text.bottom).toBeLessThanOrEqual(svg.bottom);
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
