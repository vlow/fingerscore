import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { LOAD_FAILED } from '../src/shell/loadFailed';

// The layer report of the build under test (scripts/bundle-layers): which files each route needs beyond the shell.
const layers = JSON.parse(readFileSync('build-report/layers.json', 'utf8')) as { routes: Record<string, { entry: string; files: string[] }> };
const sheetOnly = layers.routes['/sheet'].files.filter(f => !layers.routes['/'].files.includes(f));

async function makeSheet(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
}

test('a cold / requests no chunk that only /sheet uses', async ({ page }) => {
  expect(sheetOnly.length).toBeGreaterThan(0);
  const urls: string[] = [];
  page.on('request', r => urls.push(new URL(r.url()).pathname));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(urls.filter(u => sheetOnly.includes(u.slice(1)))).toEqual([]);
});

test('a cold /sheet preloads its route', async ({ page }) => {
  await makeSheet(page);
  await page.reload();
  const preloaded = await page.locator('head link[rel="modulepreload"]').evaluateAll(ls => ls.map(l => l.getAttribute('href')));
  for (const f of layers.routes['/sheet'].files.filter(f => f.endsWith('.js'))) expect(preloaded).toContain(`/${f}`);
});

test('a cold /sheet never shows the route fallback', async ({ page }) => {
  await makeSheet(page);
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector('main [aria-busy="true"]')) (window as unknown as { busySeen: boolean }).busySeen = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await expect(page.getByTestId('paper')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { busySeen?: boolean }).busySeen)).toBeFalsy();
});

test('a failed route chunk shows the reload notice', async ({ page }) => {
  await page.route(`**/${layers.routes['/about'].entry}`, r => r.abort());
  await page.goto('/about');
  await expect(page.getByRole('alert')).toHaveText(new RegExp(LOAD_FAILED.replace(/[.]/g, '\\.')));
  await expect(page.getByRole('link', { name: 'Songs' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Imprint' })).toBeVisible();
});
