import { expect, test, type Page } from '@playwright/test';

async function openSample(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByTestId('system').first()).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Edit notes' }).click();
}

const panel = (page: Page) => page.getByRole('group', { name: 'Edit notes panel' });
const jump = (page: Page) => panel(page).getByLabel('Jump at the end of the bar');
const notice = (page: Page) => page.getByRole('status', { name: 'Jump marks' });
const live = (page: Page) => page.locator('[aria-live=polite]').filter({ hasText: /^Bar / });

test('letters and arrow keys act on the select, not on the note', async ({ page }) => {
  await openSample(page);
  await page.locator('[data-hit]').nth(1).click();
  const note = page.locator('[data-selected="true"]');
  const before = await note.getAttribute('data-ev');
  const pitch = await page.locator('[data-selected="true"] text').allTextContents();
  await jump(page).focus();
  await page.keyboard.press('d');   // in a select the letter picks the option "D.C."; the sheet's D key stays out
  await expect(jump(page)).toHaveValue('dc');
  await expect(notice(page)).toHaveCount(0);   // D.C. adds up
  await page.keyboard.press('ArrowRight');   // the sheet's arrow keys (next note) stay out too
  expect(await note.getAttribute('data-ev')).toBe(before);
  expect(await page.locator('[data-selected="true"] text').allTextContents()).toEqual(pitch);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(jump(page)).toHaveValue('');
});

test('the notice appears for a D.S. without a Segno and goes with a Segno', async ({ page }) => {
  await openSample(page);
  await page.locator('[data-hit]').nth(1).click();
  await jump(page).selectOption({ label: 'D.S.' });
  await expect(notice(page)).toContainText('needs a Segno');
  await expect(live(page)).toHaveText(/^Bar \d+: D\.S\.$/);
  await panel(page).getByRole('button', { name: 'Segno' }).click();
  await expect(notice(page)).toHaveCount(0);
});
