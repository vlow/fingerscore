/** The page is blocked for 1.8 s from 6.3 s into the playback of ds-coda.abc (22 highlights at the fastest tempo): marks and the end come due together. */
import { test, expect } from '@playwright/test';

test('a stall of the page near the end of the song still shows every highlight, the last one included', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles('e2e/fixtures/ds-coda.abc');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByTestId('system').first().waitFor();
  const slider = page.getByRole('group', { name: 'Playback' }).getByRole('slider');
  await slider.fill(await slider.evaluate(el => (el as HTMLInputElement).max));
  const last = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('[data-ev]')).map(e => e.getAttribute('data-ev'));
    return ids[ids.length - 1];
  });
  await page.evaluate(([at, ms]) => {
    const w = window as unknown as { __ids: string[] };
    w.__ids = [];
    new MutationObserver(() => { const id = document.querySelector('[data-playing="true"]')?.getAttribute('data-ev'); if (id) w.__ids.push(id); })
      .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-playing'] });
    window.setTimeout(() => { const e = performance.now() + ms; while (performance.now() < e) { /* busy */ } }, at);
  }, [6300, 1800]);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await page.getByRole('button', { name: 'Listen', exact: true }).waitFor({ timeout: 60_000 });
  const ids = await page.evaluate(() => (window as unknown as { __ids: string[] }).__ids);
  expect(ids[ids.length - 1]).toBe(last);
  expect(ids).toHaveLength(22);
});
