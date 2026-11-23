import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('production build: Download PDF fetches six hashed fonts from the app, nothing leaves the origin, no dev hook', async ({ page }) => {
  const requests: { url: string; status: number }[] = [];
  page.on('response', r => requests.push({ url: r.url(), status: r.status() }));
  await page.goto('/');
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByTestId('system').first()).toBeVisible();
  await page.getByRole('button', { name: /^File/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Download PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('auld-lang-syne-alto-sax.pdf');
  expect(readFileSync((await download.path())!).subarray(0, 4).toString('latin1')).toBe('%PDF');

  expect(requests.filter(r => !r.url.startsWith('http://localhost:4179/')), 'requests that leave the origin').toEqual([]);
  const fonts = requests.filter(r => r.url.endsWith('.ttf'));
  expect(fonts.map(r => new URL(r.url).pathname).sort()).toHaveLength(6);
  for (const f of fonts) {
    expect(new URL(f.url).pathname, f.url).toMatch(/^\/assets\/atkinson-hyperlegible-(latin|latin-ext)-(400-normal|700-normal|700-italic)-[\w-]+\.ttf$/);
    expect(f.status, f.url).toBe(200);
  }
  expect(await page.evaluate(() => (window as unknown as { fingerscorePdf?: unknown }).fingerscorePdf)).toBeUndefined();
});
