import { expect, test, type Page } from '@playwright/test';

async function clean(page: Page, path = '/') {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(path);
}

const site = (page: Page) => page.getByRole('navigation', { name: 'Site' });

const PAGES = [
  { link: 'About', path: '/about', title: 'About – fingerscore' },
  { link: 'Terms', path: '/terms', title: 'Terms of Use – fingerscore' },
  { link: 'Privacy', path: '/privacy', title: 'Privacy – fingerscore' },
  { link: 'Imprint', path: '/imprint', title: 'Imprint – fingerscore' },
];

for (const p of PAGES) {
  test(`footer link ${p.link} opens ${p.path} and the logo leads back`, async ({ page }) => {
    await clean(page);
    await site(page).getByRole('link', { name: p.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${p.path}$`));
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveTitle(p.title);
    await page.getByRole('banner').getByRole('link').first().click();
    await expect(page).toHaveURL(/\/$/);
  });
}

test('/terms opens directly', async ({ page }) => {
  await clean(page, '/terms');
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
});

test('the notice link on the start page opens /terms', async ({ page }) => {
  await clean(page);
  await expect(page.getByText('Only import songs you have the rights to.')).toBeVisible();
  await page.getByTestId('drop-zone').getByRole('link', { name: 'Terms of Use' }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
});

for (const path of ['/', '/terms']) {
  test(`no horizontal scroll at 320 x 640 on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await clean(page, path);
    await expect(page.locator('h1').first()).toBeVisible();
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(fits).toBe(true);
  });
}

// operator.ts cannot be changed from a test, so the check adds the long value to the rendered article.
test('a 60-character value without spaces does not scroll /imprint sideways at 320 x 640', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await clean(page, '/imprint');
  await expect(page.locator('h1').first()).toBeVisible();
  const fits = await page.evaluate(() => {
    const p = document.createElement('p');
    p.textContent = 'a'.repeat(30) + '@' + 'b'.repeat(29);
    document.querySelector('h1')!.parentElement!.appendChild(p);
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  });
  expect(fits).toBe(true);
});

test('an unsaved change survives a visit to the terms from the File menu', async ({ page }) => {
  await clean(page);
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByTestId('system').first()).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Edit notes' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const status = (t: string) => page.getByRole('status').filter({ hasText: new RegExp(`^${t}$`) });
  await expect(status('Saved')).toBeVisible();

  const id = await page.locator('[data-hit]').nth(1).getAttribute('data-hit');
  await page.locator(`[data-hit="${id}"]`).click();
  await page.getByRole('group', { name: 'Edit notes panel' }).getByRole('button', { name: 'Turn into rest' }).click();
  await expect(status('Unsaved changes')).toBeVisible();
  const rests = await page.locator('[data-rest]').count();

  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Terms of Use' }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await page.goBack();

  await expect(page.getByTestId('system').first()).toBeVisible();
  await expect(status('Unsaved changes')).toBeVisible();
  await expect(page.locator('[data-rest]')).toHaveCount(rests);
});

test('the drop zone keeps the file input under every point except the notice link', async ({ page }) => {
  await clean(page);
  const zone = page.getByTestId('drop-zone');
  const hits = await zone.evaluate(z => {
    const r = z.getBoundingClientRect();
    const at = (x: number, y: number) => document.elementFromPoint(x, y)?.tagName;
    const link = z.querySelector('a')!.getBoundingClientRect();
    const text = z.querySelector('p')!.getBoundingClientRect();
    return {
      center: at(r.left + r.width / 2, r.top + r.height / 2),
      corner: at(r.left + 10, r.top + 10),
      noticeText: at(text.left + 4, text.top + text.height / 2),
      link: at(link.left + link.width / 2, link.top + link.height / 2),
    };
  });
  expect(hits).toEqual({ center: 'INPUT', corner: 'INPUT', noticeText: 'INPUT', link: 'A' });
});
