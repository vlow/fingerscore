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
  expect(downloads()).toBe(0);
  // The entry is usable again.
  await fileMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Download PDF' })).toBeEnabled();
});

test('a PDF chunk that fails to load shows the load message; the next click loads it', async ({ page }) => {
  // Offline until the message shows: the prefetch when the menu focuses Download PDF fails too, and so does the click.
  let offline = true;
  let blocked = 0;
  await page.route('**/src/pdf/sheetPdf.ts*', route => {
    if (offline) { blocked++; return route.abort(); }
    return route.continue();
  });
  await openSample(page);
  const downloads = countDownloads(page);
  await fileMenu(page);
  await page.getByRole('menuitem', { name: 'Download PDF' }).click();
  await expect(page.getByRole('alert')).toHaveText(LOAD_FAILED);
  expect(blocked).toBeGreaterThanOrEqual(1);
  expect(downloads()).toBe(0);
  offline = false;

  await fileMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('auld-lang-syne-alto-sax.pdf');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('opening the File menu prefetches the PDF chunk; a failed prefetch stays silent and the click loads it', async ({ page }) => {
  let blocked = 0;
  await page.route('**/src/pdf/sheetPdf.ts*', route => {
    if (blocked === 0) { blocked++; return route.abort(); }
    return route.continue();
  });
  await openSample(page);
  await fileMenu(page);
  await expect.poll(() => blocked).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('auld-lang-syne-alto-sax.pdf');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

/** Records every PDF Blob that is turned into a download URL (src/ui/download.ts), before the app loads. */
async function recordPdfBlobs(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __pdfBlobs: number };
    w.__pdfBlobs = 0;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      if (obj instanceof Blob && obj.type === 'application/pdf') w.__pdfBlobs++;
      return create(obj);
    };
  });
}
const pdfBlobs = (page: Page) => page.evaluate(() => (window as unknown as { __pdfBlobs: number }).__pdfBlobs);

/** Polls for `ms` that no PDF Blob is made. Staying on the page, a 400-bar PDF is ready about 5.5 s after the click (see the positive control). */
async function noPdfFor(page: Page, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    expect(await pdfBlobs(page)).toBe(0);
    await page.waitForTimeout(250);
  }
}

/** The sample repeated to 400 bars, as the text of a sheet file. */
const longSheet = (page: Page, title: string) => page.evaluate(async t => {
  const h = await (window as unknown as { fingerscorePdf: () => Promise<{ sampleDoc(): { title: string; score: { ev: { id: string }[] }[]; chords: object } }> }).fingerscorePdf();
  const doc = h.sampleDoc();
  const one = doc.score;
  const score: typeof one = [];
  let n = 0;
  while (score.length < 400) for (const b of one) { if (score.length < 400) score.push({ ...b, ev: b.ev.map(e => ({ ...e, id: `r${++n}` })) }); }
  doc.score = score;
  doc.chords = {};
  doc.title = t;
  return JSON.stringify({ app: 'fingerscore', format: 1, savedAt: new Date().toISOString(), title: doc.title, doc });
}, title);

async function openLong(page: Page, title: string): Promise<void> {
  const text = await longSheet(page, title);
  await page.getByLabel('Open JSON file', { exact: true }).setInputFiles({ name: 'long.fingerscore.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByText(/long\.fingerscore\.json · fingerscore sheet/)).toBeVisible();
}

test('positive control: staying on the page, a 400-bar PDF is downloaded once', async ({ page }) => {
  test.setTimeout(120_000);
  await recordPdfBlobs(page);
  await openSample(page);
  await openLong(page, 'Long sheet');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    fileMenu(page).then(() => page.getByRole('menuitem', { name: 'Download PDF' }).click()),
  ]);
  expect(download.suggestedFilename()).toBe('long-sheet-alto-sax.pdf');
  expect(await pdfBlobs(page)).toBe(1);
});

test('leaving the page while a 400-bar PDF is prepared downloads nothing', async ({ page }) => {
  test.setTimeout(120_000);
  await recordPdfBlobs(page);
  await openSample(page);
  await openLong(page, 'Long sheet');
  const downloads = countDownloads(page);
  await fileMenu(page);
  await page.getByRole('menuitem', { name: 'Download PDF' }).click();
  await fileMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Preparing PDF…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Scales' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Scales with fingerings' })).toBeVisible();
  await noPdfFor(page, 6000);
  expect(downloads()).toBe(0);
});

test('opening another sheet while a 400-bar PDF is prepared downloads nothing; the next PDF is the new sheet', async ({ page }) => {
  test.setTimeout(120_000);
  await recordPdfBlobs(page);
  await openSample(page);
  // Save the sample under its name so that the File menu lists it.
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await openLong(page, 'Long sheet');
  const downloads = countDownloads(page);
  await fileMenu(page);
  await page.getByRole('menuitem', { name: 'Download PDF' }).click();
  await fileMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Preparing PDF…' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Open Auld Lang Syne' }).click();
  await expect(page.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('Auld Lang Syne');
  await noPdfFor(page, 6000);
  expect(downloads()).toBe(0);

  await fileMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('auld-lang-syne-alto-sax.pdf');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
