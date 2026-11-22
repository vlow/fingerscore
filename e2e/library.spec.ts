import { expect, test, type Page } from '@playwright/test';

const TITLE = 'Auld Lang Syne (mine)';

/** Starts from an empty browser profile for the app's origin. */
async function clean(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
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
  await expect(gallery.getByRole('link')).toHaveCount(1);
  await gallery.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/sheet/);
  await expect(titleBox(page)).toHaveValue(TITLE);
  await expect(page.getByText(/saved in this browser/)).toBeVisible();
  await expect(page.getByText('Change track')).toHaveCount(0);

  await page.goto('/');
  await page.getByRole('button', { name: `Delete ${TITLE}` }).click();
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
  await expect(gallery.getByText(/^1 sheet · /)).toBeVisible();
  await page.getByRole('button', { name: `Delete ${TITLE}` }).click();
  await expect(gallery).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(gallery.getByRole('link', { name: new RegExp(TITLE.replace(/[()]/g, '\\$&')) })).toBeVisible();
  await expect(gallery.getByText(/^1 sheet · /)).toBeVisible();
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
