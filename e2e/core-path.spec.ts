import { expect, test } from '@playwright/test';

test('core path: sample → track → sheet → instruments → alternate → playback', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const title = page.getByRole('textbox', { name: 'Sheet title' });

  await page.goto('/');
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await expect(page).toHaveURL(/\/tracks$/);
  await expect(page.getByText('Recommended')).toBeVisible();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page).toHaveURL(/\/sheet$/);
  await expect(page.getByTestId('system').first()).toBeVisible();
  await expect(title).toHaveValue('Auld Lang Syne');

  const picker = page.getByLabel(/Fingerings for/);
  for (const id of ['cl', 'xc', 'rs']) {
    await picker.selectOption(id);
    await expect(page.locator('[data-chart]').first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }

  await picker.selectOption('asax');
  await page.getByRole('button', { name: /⇅/ }).first().click();
  await page.getByRole('dialog').getByRole('button').nth(1).click();
  await expect(page.getByText(/changed by you/)).toBeVisible();

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('[data-playing="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('[data-playing="true"]')).toHaveCount(0);

  await page.reload();
  await expect(title).toHaveValue('Auld Lang Syne'); // session survives reload
  expect(errors).toEqual([]);
});

test('no third-party requests', async ({ page }) => {
  const foreign: string[] = [];
  page.on('request', r => {
    const u = r.url();
    if (!u.startsWith('http://localhost:5173') && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await expect(page).toHaveURL(/\/tracks$/);
  expect(foreign).toEqual([]);
});
