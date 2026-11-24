import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1600, height: 800 } });

// SPEC §14 acceptance check 8 (play mode, §11a).
test('play mode: only the score, page turns, auto-scroll, size, Esc', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByTestId('system').first()).toBeVisible();

  await page.getByRole('button', { name: 'Play mode' }).click();
  const region = page.getByRole('region', { name: 'Play mode' });
  const scroller = page.getByTestId('play-scroller');
  await expect(region).toBeVisible();
  await expect(region).toBeFocused();

  // Only the score: nothing to type into, nothing to click on the paper, and the editor is out of reach.
  await expect(region.getByRole('textbox')).toHaveCount(0);
  await expect(region.locator('[data-hit]')).toHaveCount(0);
  await expect(region.getByRole('heading', { level: 1 })).toHaveText('Auld Lang Syne');
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await expect(region.getByTestId('system').first()).toBeVisible();

  // → turns by 88 % of the visible height.
  const height = await scroller.evaluate(el => el.clientHeight);
  await expect(region.getByText(/^Page 1 \/ \d+$/)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(height * 0.88 - 2);
  expect(await scroller.evaluate(el => el.scrollTop)).toBeLessThan(height * 0.88 + 2);
  await expect(region.getByText(/^Page 2 \/ \d+$/)).toBeVisible();
  // Space goes on, ← comes back.
  await page.keyboard.press('Space');
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(height * 0.88 + 2);
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);

  // Auto-scroll first lets the music come down to the reading line (35 % of the screen), then moves at the pace
  // the readout names: one zoomed line (290 px × 1.25) in that many seconds.
  const label = await region.getByText(/1 line \/ \d+ s$/).textContent();
  const lineSeconds = Number(/(\d+) s$/.exec(label!)![1]);
  expect(lineSeconds).toBe(10);   // four bars of 4/4 at ♩ = 100: 9.6 s
  await page.keyboard.press('a');
  await expect(region.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
  await expect(region.getByText(/starts in \d+ s$/)).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await scroller.evaluate(el => el.scrollTop)).toBe(0);
  await expect(region.getByText(/1 line \/ 10 s$/)).toBeVisible({ timeout: 15000 });
  const start = await scroller.evaluate(el => el.scrollTop);
  await page.waitForTimeout(2000);
  const moved = (await scroller.evaluate(el => el.scrollTop)) - start;
  const expected = (290 * 1.25 / 9.6) * 2;
  expect(moved).toBeGreaterThan(expected * 0.6);
  expect(moved).toBeLessThan(expected * 1.5);

  // A page turn works while auto-scroll runs.
  const beforeTurn = await scroller.evaluate(el => el.scrollTop);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(beforeTurn + height * 0.8);
  await page.keyboard.press('a');
  await expect(region.getByRole('button', { name: 'Auto-scroll' })).toBeVisible();

  // The wheel scrolls the sheet at the screen edge too, and a click on the toolbar leaves the keys with play mode.
  await scroller.evaluate(el => { el.scrollTop = 0; });
  await page.mouse.move(1560, 300);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(200);
  await region.getByRole('button', { name: 'Previous page' }).click();
  await expect(region).toBeFocused();
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);

  // The size is kept for the next visit.
  await page.keyboard.press('+');
  await expect(page.getByTestId('play-zoom')).toHaveCSS('zoom', '1.5');
  await page.keyboard.press('Escape');
  await expect(region).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Sheet title' })).toBeVisible();
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
  await expect(page.getByRole('button', { name: 'Play mode' })).toBeFocused();
  await page.getByRole('button', { name: 'Play mode' }).click();
  await expect(page.getByTestId('play-zoom')).toHaveCSS('zoom', '1.5');

  // On a narrower screen the paper shrinks to fit: nothing is cut off at the right.
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(async () => (await region.getByTestId('paper').boundingBox())!.width).toBeLessThanOrEqual(1024);
  const box = (await region.getByTestId('paper').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1024);
  expect(await scroller.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1600, height: 800 });
  await expect(page.getByTestId('play-zoom')).toHaveCSS('zoom', '1.5');

  // A tap on the right edge turns the page.
  await page.mouse.click(1560, 300);
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await region.getByRole('button', { name: 'Exit play mode (Esc)' }).click();
  await expect(region).toHaveCount(0);

  expect(errors).toEqual([]);
});
