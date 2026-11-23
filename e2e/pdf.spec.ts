import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { readPdf } from './readPdf';

const LOAD_FAILED = 'This part of fingerscore could not be loaded. Check your connection and reload the page.';

/** Starts from an empty browser profile and makes the sheet from the sample song. */
async function openSample(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByTestId('system').first()).toBeVisible();
}

const fileMenu = (page: Page) => page.getByRole('button', { name: /^File/ }).click();
const bytesOf = async (d: Download) => new Uint8Array(readFileSync((await d.path())!));

/** Counts download events from now on. */
function countDownloads(page: Page): () => number {
  let n = 0;
  page.on('download', () => { n++; });
  return () => n;
}

test('sheet: File → Download PDF saves a named PDF with the title in it', async ({ page }) => {
  await openSample(page);
  await fileMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('auld-lang-syne-alto-sax.pdf');
  const bytes = await bytesOf(download);
  expect(Buffer.from(bytes.slice(0, 4)).toString('latin1')).toBe('%PDF');
  const { pages } = await readPdf(bytes);
  expect(pages[0].text.map(t => t.str).join(' ')).toContain('Auld Lang Syne');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Scales: Download PDF saves c-major-….pdf', async ({ page }) => {
  await page.goto('/scales');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('c-major-alto-sax.pdf');
  const bytes = await bytesOf(download);
  expect(Buffer.from(bytes.slice(0, 4)).toString('latin1')).toBe('%PDF');
  expect((await readPdf(bytes)).pages[0].text.map(t => t.str).join(' ')).toContain('C major');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a Cyrillic lyric gives the unsupported-characters message and no download', async ({ page }) => {
  await openSample(page);
  const downloads = countDownloads(page);
  await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Lyrics' }).click();
  await page.locator('[data-hit]').first().click();
  await page.getByRole('group', { name: 'Lyrics panel' }).getByLabel('Lyric').fill('Привіт');
  await fileMenu(page);
  await page.getByRole('menuitem', { name: 'Download PDF' }).click();
  await expect(page.getByRole('alert')).toHaveText(/^The PDF can't show these characters: .*П.*\. Use Print instead\.$/);
  await expect(page.getByRole('alert')).not.toContainText('Preparing');
  await page.waitForTimeout(500);
  expect(downloads()).toBe(0);
  // The entry is usable again.
  await fileMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Download PDF' })).toBeEnabled();
});

test('a PDF chunk that fails to load shows the load message; the next click loads it', async ({ page }) => {
  let blocked = 0;
  await page.route('**/src/pdf/sheetPdf.ts*', route => {
    if (blocked === 0) { blocked++; return route.abort(); }
    return route.continue();
  });
  await openSample(page);
  const downloads = countDownloads(page);
  await fileMenu(page);
  await page.getByRole('menuitem', { name: 'Download PDF' }).click();
  await expect(page.getByRole('alert')).toHaveText(LOAD_FAILED);
  expect(blocked).toBe(1);
  expect(downloads()).toBe(0);

  await fileMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('auld-lang-syne-alto-sax.pdf');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('leaving the page while a 400-bar PDF is prepared downloads nothing', async ({ page }) => {
  test.setTimeout(120_000);
  await openSample(page);
  // A sheet of 400 bars, opened from a file: the sample repeated with new event ids.
  const file = await page.evaluate(async () => {
    const h = await (window as unknown as { fingerscorePdf: () => Promise<{ sampleDoc(): { title: string; score: { ev: { id: string }[] }[]; chords: object } }> }).fingerscorePdf();
    const doc = h.sampleDoc();
    const one = doc.score;
    const score: typeof one = [];
    let n = 0;
    while (score.length < 400) for (const b of one) { if (score.length < 400) score.push({ ...b, ev: b.ev.map(e => ({ ...e, id: `r${++n}` })) }); }
    doc.score = score;
    doc.chords = {};
    doc.title = 'Long sheet';
    return JSON.stringify({ app: 'fingerscore', format: 1, savedAt: new Date().toISOString(), title: doc.title, doc });
  });
  await page.getByLabel('Open JSON file', { exact: true }).setInputFiles({ name: 'long.fingerscore.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await expect(page.getByText(/long\.fingerscore\.json · fingerscore sheet/)).toBeVisible();

  const downloads = countDownloads(page);
  await fileMenu(page);
  await page.getByRole('menuitem', { name: 'Download PDF' }).click();
  await fileMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Preparing PDF…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Scales' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Scales with fingerings' })).toBeVisible();
  // Staying on the page, this PDF arrives after about 5.5 s; wait past that, not only two seconds.
  await page.waitForTimeout(8000);
  expect(downloads()).toBe(0);
});
