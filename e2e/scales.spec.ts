import { expect, test, type Page } from '@playwright/test';

/** Starts from an empty browser profile for the app's origin. */
async function clean(page: Page, path = '/') {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(path);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

const notes = (page: Page) => page.locator('[data-note]');
const lines = (page: Page) => page.locator('[data-testid="scale-line"]');
const instrument = (page: Page) => page.getByRole('combobox', { name: 'Instrument' });
const scale = (page: Page) => page.getByRole('combobox', { name: 'Scale' });
const radio = (page: Page, group: string, name: string) =>
  page.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true });
const alternates = (page: Page) => page.getByRole('checkbox', { name: 'Show alternate fingerings' });

test('scales: header link, harmonic minor, up and down, two octaves', async ({ page }) => {
  const errors = collectErrors(page);
  await clean(page);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Scales' }).click();
  await expect(page.getByRole('heading', { name: 'Scales with fingerings' })).toBeVisible();
  await expect(notes(page)).toHaveCount(8);
  await expect(radio(page, 'Key', 'C · sounds E♭')).toHaveAttribute('aria-checked', 'true');

  await scale(page).selectOption('hmin');
  await radio(page, 'Key', 'A · sounds C').click();
  await expect(page.locator('[data-name]')).toHaveText(['A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G♯5', 'A5']);

  await radio(page, 'Direction', 'Up & down').click();
  await expect(notes(page)).toHaveCount(15);

  await radio(page, 'Range', '2 octaves').click();
  await expect(notes(page).nth(15)).toBeAttached();   // more than 15 notes
  await expect(lines(page)).toHaveCount(2);

  expect(errors).toEqual([]);
});

test('scales: a second octave that does not fit is cut with a notice', async ({ page }) => {
  const errors = collectErrors(page);
  await clean(page, '/scales');

  await instrument(page).selectOption('xc');
  await radio(page, 'Key', 'B').click();
  await radio(page, 'Range', '2 octaves').click();
  await expect(page.getByRole('status').filter({
    hasText: 'The second octave does not fit this instrument. Shown up to B5.',
  })).toBeVisible();

  // Diatonic height of every drawn name: octave * 7 + letter. Nothing may sit above B5, the last note shown.
  const names = await page.locator('[data-name]').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  const letters = 'CDEFGAB';
  for (const n of names) {
    const height = Number(n.slice(-1)) * 7 + letters.indexOf(n[0]);
    expect(height, `${n} is above B5`).toBeLessThanOrEqual(5 * 7 + 6);
  }

  expect(errors).toEqual([]);
});

test('scales: alternate fingerings and settings survive a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await clean(page, '/scales');

  await expect(page.locator('[data-alt]')).toHaveCount(0);
  await instrument(page).selectOption('cl');
  await scale(page).selectOption('hmin');
  await radio(page, 'Key', 'F · sounds E♭').click();
  await alternates(page).check();
  await expect(page.locator('[data-alt]').first()).toBeAttached();

  await page.reload();
  await expect(instrument(page)).toHaveValue('cl');
  await expect(scale(page)).toHaveValue('hmin');
  await expect(radio(page, 'Key', 'F · sounds E♭')).toHaveAttribute('aria-checked', 'true');
  await expect(alternates(page)).toBeChecked();
  await expect(page.locator('[data-alt]').first()).toBeAttached();

  expect(errors).toEqual([]);
});

test('scales: print shows the scale only', async ({ page }) => {
  const errors = collectErrors(page);
  await clean(page, '/scales');
  await expect(page.getByRole('heading', { name: 'Scales with fingerings' })).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('combobox', { name: 'Instrument' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('[data-print-scale]')).toBeVisible();
  await expect(lines(page).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('scales: the page loads as its own chunk on first visit', async ({ page }) => {
  const errors = collectErrors(page);
  // Listen from the first navigation on, so "no Scales request before the click" covers loading the start page.
  const scriptRequests: string[] = [];
  page.on('request', r => { if (r.resourceType() === 'script') scriptRequests.push(r.url()); });
  const isScalesChunk = (url: string) => url.includes('Scales');
  await clean(page);
  await expect(page.getByRole('link', { name: 'Songs' })).toBeVisible();
  expect(scriptRequests.length).toBeGreaterThan(0);
  expect(scriptRequests.filter(isScalesChunk)).toEqual([]);

  await page.getByRole('link', { name: 'Scales' }).click();
  await expect(page.getByRole('heading', { name: 'Scales with fingerings' })).toBeVisible();
  expect(scriptRequests.filter(isScalesChunk).length).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('scales: a chunk that fails to load shows the notice, not a blank page', async ({ page }) => {
  // Console errors are expected here: the aborted request and the boundary both log.
  await clean(page);
  await page.route(url => url.pathname.includes('Scales'), route => route.abort());

  await page.getByRole('link', { name: 'Scales' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    /This part of fingerscore could not be loaded\. Check your connection and reload the page\./,
  );
  await expect(page.getByRole('link', { name: 'Songs' })).toBeVisible();
});
