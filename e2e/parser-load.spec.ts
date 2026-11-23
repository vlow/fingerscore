import { expect, test } from '@playwright/test';

const LOAD_FAILED = 'This part of fingerscore could not be loaded. Check your connection and reload the page.';
const DEMO = 'public/demo/Auld_Lang_Syne.mid';

test('a MIDI parser chunk that fails to load shows the notice; choosing the file again loads it', async ({ page }) => {
  let blocked = 0;
  await page.route('**/src/import/midi.ts*', route => {
    if (blocked === 0) { blocked++; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  const zone = page.getByTestId('drop-zone');
  await zone.locator('input[type=file]').setInputFiles(DEMO);
  await expect(zone.getByRole('alert')).toContainText(LOAD_FAILED);
  expect(blocked).toBe(1);

  await zone.getByRole('button', { name: 'Try another file' }).click();
  await zone.locator('input[type=file]').setInputFiles(DEMO);
  await expect(zone.getByText(/Ready — next you pick the part to play/)).toBeVisible();
  await expect(zone.getByRole('alert')).toHaveCount(0);
});
