import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const marks = (page: Page) => page.locator('[data-tuplet]');
const panel = (page: Page) => page.getByRole('group', { name: 'Edit notes panel' });
const pitchText = (page: Page) => panel(page).getByRole('group', { name: 'Pitch' }).innerText();
const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: new RegExp(`^${text}$`) });

test('triplets: import, make, change, undo, save, reload, download and open', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles('e2e/fixtures/triplet.abc');
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/sheet$/);
  await expect(page.getByTestId('system').first()).toBeVisible();

  // The imported group: one mark with the number 3, and no simplified notice.
  await expect(marks(page)).toHaveCount(1);
  await expect(marks(page).locator('text')).toHaveText('3');
  await expect(page.getByText(/Rhythm simplified/)).toHaveCount(0);

  // Make a second group on the first note (a plain quarter).
  await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Edit notes' }).click();
  await page.locator('[data-hit]').first().click();
  await expect(panel(page).getByRole('button', { name: 'Quarter' })).toHaveAttribute('aria-pressed', 'true');
  const first = await pitchText(page);
  await page.keyboard.press('p');
  await expect(marks(page)).toHaveCount(2);
  await expect(panel(page).getByRole('button', { name: 'Triplet' })).toHaveAttribute('aria-pressed', 'true');

  // Second member: its note name changes with the arrow key.
  await page.keyboard.press('ArrowRight');
  const second = await pitchText(page);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => pitchText(page)).not.toBe(second);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => pitchText(page)).toBe(first);   // the first member keeps its pitch
  await page.keyboard.press('ArrowRight');

  // P again removes the group; P once more makes it.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('p');
  await expect(marks(page)).toHaveCount(1);
  await expect(panel(page).getByRole('button', { name: 'Triplet' })).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('p');
  await expect(marks(page)).toHaveCount(2);

  // Save. The app keeps the session's current sheet across a reload (sessionStorage), so a plain reload proves little:
  // clear the session copy and open the saved sheet from the gallery on the start page.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status(page, 'Saved')).toBeVisible();
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/');
  await page.getByRole('region', { name: 'Your sheets' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/sheet$/);
  await expect(page.getByTestId('system').first()).toBeVisible();
  await expect(marks(page)).toHaveCount(2);

  // Download the JSON: exactly six events have a triplet length (two groups of three).
  await page.getByRole('button', { name: /^File/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download JSON' }).click();
  const download = await pending;
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const file = JSON.parse(readFileSync(path, 'utf8')) as { doc: { score: { ev: { d: number }[] }[] } };
  expect(file.doc.score.flatMap(b => b.ev).filter(e => [2, 4, 8, 16].includes(e.d))).toHaveLength(6);

  // Change the sheet on screen (undo the made triplet: 1 mark), then open the file: 2 marks must come from it.
  await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Edit notes' }).click();
  await page.locator('[data-hit]').first().click();
  await page.keyboard.press('p');
  await expect(marks(page)).toHaveCount(1);
  await page.getByLabel('Open JSON file').setInputFiles(path);
  await expect(marks(page)).toHaveCount(2);
  expect(errors).toEqual([]);
});
