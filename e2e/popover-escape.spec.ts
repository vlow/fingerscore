import { expect, test, type Page } from '@playwright/test';

// A popover or an overlay whose code arrives late is in the page before React has run its passive effects. A key pressed
// in that window must still be handled: these tests press Escape the moment the thing shows, on a CPU that is slower
// (rate 6) and with the chunk delayed.

async function openSample(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByTestId('system').first()).toBeVisible();
}

const slow = async (page: Page, rate: number) => {
  await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate });
};
const delayed = (page: Page, pattern: string, ms: number) =>
  page.route(pattern, async route => { await new Promise(r => setTimeout(r, ms)); await route.continue(); });

for (const rate of [1, 6]) {
  test(`sheet: Escape the moment the alternate-fingering popover shows closes it and the focus returns to its pill (CPU ${rate}x slower)`, async ({ page }) => {
    await openSample(page);
    await delayed(page, '**/AltFingeringPopover*', 250);
    await slow(page, rate);
    const pill = page.getByRole('button', { name: /^⇅ \d+ alternate fingerings for / }).first();
    await pill.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(pill).toBeFocused();
  });

  test(`scales: the same for the popover on the Scales page (CPU ${rate}x slower)`, async ({ page }) => {
    await page.goto('/scales');
    await slow(page, rate);
    const pill = page.getByRole('button', { name: /^⇅ \d+ alternate fingerings for / }).first();
    await expect(pill).toBeVisible();
    await pill.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(pill).toBeFocused();
  });

  test(`play mode: Escape the moment it shows leaves it, with the page usable again (CPU ${rate}x slower)`, async ({ page }) => {
    await openSample(page);
    await delayed(page, '**/PlayMode*', 250);
    await slow(page, rate);
    await page.getByRole('button', { name: 'Play mode' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Play mode' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Play mode' })).toHaveCount(0);
    await expect(page.locator('#root')).not.toHaveAttribute('inert');
  });
}

test('the File menu opens on a key or a click, which React answers with its effects at once: Escape the moment it shows closes it', async ({ page }) => {
  await openSample(page);
  await slow(page, 6);
  const file = page.getByRole('button', { name: /^File/ });
  await file.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'File' })).toHaveCount(0);
  await expect(file).toBeFocused();
});
