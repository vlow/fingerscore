import { expect, test, type Page } from '@playwright/test';

const TITLE = 'Auld Lang Syne (mine)';

/** Starts from an empty browser profile for the app's origin. */
async function clean(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

/** The bin asks first: "Delete?" [Delete] [Keep]. */
async function deleteSheet(page: Page, title: string) {
  await page.getByRole('button', { name: `Delete ${title}` }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
}

const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: new RegExp(`^${text}$`) });
const titleBox = (page: Page) => page.getByRole('textbox', { name: 'Sheet title' });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });

/** Sample → sheet → rename → save. Leaves the sheet page open with status "Saved". */
async function saveSample(page: Page) {
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(status(page, 'Not saved yet')).toBeVisible();
  await saveButton(page).click();
  await expect(status(page, 'Saved')).toBeVisible();
  await titleBox(page).fill(TITLE);
  await expect(status(page, 'Unsaved changes')).toBeVisible();
  await saveButton(page).click();
  await expect(status(page, 'Saved')).toBeVisible();
}

/** Downloads the sheet; returns the download and a copy on disk under its real name (Playwright's own copy has none). */
async function downloadJson(page: Page, outputPath: (name: string) => string) {
  await page.getByRole('button', { name: /^File/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download JSON' }).click();
  const download = await pending;
  const path = outputPath(download.suggestedFilename());
  await download.saveAs(path);
  return { name: download.suggestedFilename(), path };
}

test('save, reload, reopen from the gallery, export and import', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await clean(page);

  await saveSample(page);
  await page.reload();
  await expect(status(page, 'Saved')).toBeVisible();

  const { name, path } = await downloadJson(page, name => testInfo.outputPath(name));
  expect(name).toBe('auld-lang-syne-mine.fingerscore.json');

  await page.goto('/');
  const gallery = page.getByRole('region', { name: 'Your sheets' });
  await expect(gallery.getByRole('listitem')).toHaveCount(1);
  await gallery.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/sheet$/);
  await expect(titleBox(page)).toHaveValue(TITLE);
  await expect(page.getByText(/saved in this browser/)).toBeVisible();
  await expect(page.getByText('Change track')).toHaveCount(0);

  await page.goto('/');
  await deleteSheet(page, TITLE);
  await expect(page.getByRole('region', { name: 'Your sheets' })).toHaveCount(0);

  await page.setInputFiles('input[type=file]', path);
  await expect(page.getByText(`✓ "${TITLE}" added to your sheets`)).toBeVisible();
  await page.getByRole('link', { name: /Open sheet/ }).click();
  await expect(titleBox(page)).toHaveValue(TITLE);
  await expect(page.locator('[data-chart]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Undo after deleting a card restores it', async ({ page }) => {
  await clean(page);
  await saveSample(page);
  await page.goto('/');

  const gallery = page.getByRole('region', { name: 'Your sheets' });
  await expect(gallery.getByRole('button', { name: 'All 1' })).toBeVisible();
  await deleteSheet(page, TITLE);
  await expect(gallery).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(gallery.getByRole('link', { name: new RegExp(`^${TITLE.replace(/[()]/g, '\\$&')}`) })).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'All 1' })).toBeVisible();
});

test('File → Open JSON file… opens a saved sheet and refuses a foreign file', async ({ page }, testInfo) => {
  await clean(page);
  await saveSample(page);
  const { path } = await downloadJson(page, name => testInfo.outputPath(name));

  await page.getByLabel('Open JSON file').setInputFiles(path);
  await expect(titleBox(page)).toHaveValue(TITLE);
  await expect(status(page, 'Saved')).toBeVisible();
  await expect(page.getByText(/ · fingerscore sheet · /)).toBeVisible();

  const chip = await page.getByText(/ · fingerscore sheet · /).textContent();
  await page.getByLabel('Open JSON file').setInputFiles({
    name: 'foreign.json', mimeType: 'application/json', buffer: Buffer.from('{"name":"x"}'),
  });
  await expect(page.getByRole('alert')).toHaveText('"foreign.json" isn\'t a fingerscore sheet.');
  await expect(titleBox(page)).toHaveValue(TITLE);
  await expect(status(page, 'Saved')).toBeVisible();
  await expect(page.getByText(/ · fingerscore sheet · /)).toHaveText(chip!);
});

/** Puts sheets straight into the library: the sample document under each title, the first title the newest. */
async function seedLibrary(page: Page, sheets: { title: string; inst: string }[]) {
  await page.goto('/');
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await saveButton(page).click();
  await expect(status(page, 'Saved')).toBeVisible();
  await page.evaluate(list => {
    const key = 'fingerscore.library.v1';
    const [first] = JSON.parse(localStorage.getItem(key)!);
    const now = Date.now();
    localStorage.setItem(key, JSON.stringify(list.map((sh, i) => ({
      ...first, id: `seed-${i}`, title: sh.title, savedAt: new Date(now - i * 60_000).toISOString(),
      doc: { ...first.doc, title: sh.title, inst: sh.inst },
    }))));
  }, sheets);
  await page.goto('/');
}

test('Your sheets: hidden when empty, one bar and four empty bars for one sheet, the library view for many', async ({ page }) => {
  await clean(page);
  const gallery = page.getByRole('region', { name: 'Your sheets' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(gallery).toHaveCount(0);

  // One sheet: one bar, four empty bars, "All 1".
  await seedLibrary(page, [{ title: 'Only', inst: 'asax' }]);
  await expect(gallery.getByRole('listitem')).toHaveCount(1);
  await expect(gallery.locator('li[aria-hidden="true"]')).toHaveCount(4);
  await expect(gallery.getByRole('button', { name: 'All 1' })).toBeVisible();
  // The five bars share one line and the card's width.
  const boxes = await gallery.locator('li').evaluateAll(els => els.map(el => el.getBoundingClientRect()).map(r => ({ top: r.top, width: r.width })));
  expect(new Set(boxes.map(b => Math.round(b.top))).size).toBe(1);
  expect(Math.max(...boxes.map(b => b.width)) - Math.min(...boxes.map(b => b.width))).toBeLessThan(1);
  // An incipit of six notes on the sheet's bar; a whole rest on each empty bar.
  await expect(gallery.getByRole('listitem').locator('ellipse')).toHaveCount(6);
  await expect(gallery.locator('li[aria-hidden="true"] rect')).toHaveCount(4);

  // Many sheets: the strip shows the five newest, "All 7" the library view.
  await seedLibrary(page, [
    { title: 'Greensleeves', inst: 'cl' }, { title: 'Amazing Grace', inst: 'tsax' }, { title: 'Scarborough Fair', inst: 'fl' },
    { title: 'Ode to Joy', inst: 'rs' }, { title: 'Danny Boy', inst: 'asax' }, { title: 'Loch Lomond', inst: 'xc' }, { title: 'Skye Boat Song', inst: 'asax' },
  ]);
  await expect(gallery.getByRole('listitem')).toHaveCount(5);
  await expect(gallery.locator('li[aria-hidden="true"]')).toHaveCount(0);
  await expect(gallery.getByRole('listitem').first()).toContainText('Greensleeves');
  await gallery.getByRole('button', { name: 'All 7' }).click();
  await expect(gallery.getByText('7 sheets saved in this browser')).toBeVisible();
  await expect(gallery.getByRole('searchbox')).toBeFocused();
  const titles = () => gallery.getByRole('listitem').locator('a').first();
  await expect(gallery.getByRole('listitem')).toHaveCount(7);

  // Filter, sort, search.
  await gallery.getByRole('button', { name: 'Saxophone 3' }).click();
  await expect(gallery.getByRole('listitem')).toHaveCount(3);
  await gallery.getByRole('combobox', { name: 'Sort' }).selectOption('Title A–Z');
  await expect(titles()).toHaveText('Amazing Grace');
  await gallery.getByRole('button', { name: 'All 7' }).click();
  await gallery.getByRole('searchbox').fill('recorder');
  await expect(gallery.getByRole('listitem')).toHaveCount(1);
  await expect(titles()).toHaveText('Ode to Joy');
  await gallery.getByRole('searchbox').fill('zzz');
  await expect(gallery.getByText('No sheets match your search.')).toBeVisible();

  // Close goes back to the strip and resets the search.
  await gallery.getByRole('button', { name: 'Close' }).click();
  await expect(gallery.getByRole('listitem')).toHaveCount(5);
  await gallery.getByRole('button', { name: 'All 7' }).click();
  await expect(gallery.getByRole('listitem')).toHaveCount(7);

  // Delete asks first.
  await gallery.getByRole('button', { name: 'Delete Loch Lomond' }).click();
  await gallery.getByRole('button', { name: 'Keep' }).click();
  await expect(gallery.getByRole('listitem')).toHaveCount(7);
  await deleteSheet(page, 'Loch Lomond');
  await expect(gallery.getByRole('listitem')).toHaveCount(6);
});

test('Play in the library opens the sheet in Play mode', async ({ page }) => {
  await clean(page);
  await seedLibrary(page, [{ title: 'Only', inst: 'asax' }]);
  await page.getByRole('link', { name: 'Play Only' }).click();
  await expect(page).toHaveURL(/\/sheet$/);
  const stage = page.getByRole('region', { name: 'Play mode' });
  await expect(stage).toBeVisible();
  await expect(stage.getByText('Only')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(stage).toHaveCount(0);
  await expect(titleBox(page)).toHaveValue('Only');
});

test('Export all as JSON, then Import… and the drop zone add the library again', async ({ page }, testInfo) => {
  await clean(page);
  await seedLibrary(page, [{ title: 'One', inst: 'asax' }, { title: 'Two', inst: 'fl' }]);
  const gallery = page.getByRole('region', { name: 'Your sheets' });
  await gallery.getByRole('button', { name: 'All 2' }).click();
  const pending = page.waitForEvent('download');
  await gallery.getByRole('button', { name: 'Export all as JSON' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('fingerscore-library.json');
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);

  await gallery.getByLabel('Import sheets').setInputFiles(path);
  await expect(gallery.getByText('✓ 2 sheets added to your sheets')).toBeVisible();
  await expect(gallery.getByText('4 sheets saved in this browser')).toBeVisible();
  await gallery.getByRole('button', { name: 'Close' }).click();

  await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles(path);
  await expect(page.getByTestId('drop-zone').getByText('✓ 2 sheets added to your sheets')).toBeVisible();
  await page.getByRole('button', { name: 'Show library' }).click();
  await expect(gallery.getByText('6 sheets saved in this browser')).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Flute 3' })).toBeVisible();
});
