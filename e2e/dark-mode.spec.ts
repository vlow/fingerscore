import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readPdf } from './readPdf';
import { openState, STATES } from './states';

/**
 * The six acceptance checks of dark mode (handoff DARKMODE.md §8; design 4.5), D01 to D06.
 * src/acceptanceIndex.test.ts fails unless each number appears once.
 */

const DARK_PAGE = 'rgb(15, 17, 20)';
const LIGHT_PAGE = 'rgb(243, 244, 246)';
const WHITE = 'rgb(255, 255, 255)';
const LIGHT_INK = 'rgb(21, 23, 28)';
const PAPER = { night: 'rgb(27, 30, 35)', dimmed: 'rgb(217, 219, 223)', sepia: 'rgb(34, 30, 24)' };
/** Colours that only the light theme has: page, surface, page bar, both borders, text, secondary text, accent. */
const LIGHT_ONLY = [WHITE, LIGHT_PAGE, 'rgb(250, 250, 251)', 'rgb(226, 228, 232)', 'rgb(213, 216, 222)', LIGHT_INK, 'rgb(42, 45, 51)', 'rgb(14, 110, 104)'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const pageBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const htmlTheme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? null);
const paper = (page: Page) => page.getByTestId('paper').first();
const paperBackground = (page: Page) => paper(page).evaluate(el => getComputedStyle(el).backgroundColor);
const headFill = (page: Page) => page.locator('[data-state="ok"] [data-head]').first().evaluate(el => getComputedStyle(el).fill);
const paperChoice = (page: Page, name: 'Night' | 'Dimmed' | 'Sepia') =>
  page.getByRole('radiogroup', { name: 'Paper' }).getByRole('radio', { name });

async function chooseTheme(page: Page, name: 'System' | 'Light' | 'Dark') {
  await page.getByRole('button', { name: /^Theme: / }).click();
  await page.getByRole('menu', { name: 'Theme' }).getByRole('menuitemradio', { name }).click();
  await expect(page.getByRole('button', { name: `Theme: ${name}` })).toBeVisible();
}

/** Records the page as it is when the document has loaded, before anything the test does. */
async function recordAtLoad(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { __atLoad: unknown }).__atLoad = {
        background: getComputedStyle(document.body).backgroundColor,
        theme: document.documentElement.dataset.theme ?? null,
      };
    });
  });
}
const atLoad = (page: Page) => page.evaluate(() => (window as unknown as { __atLoad: { background: string; theme: string | null } }).__atLoad);

/** Elements of the page whose painted background, text, border, fill or stroke is a colour only the light theme has. */
function lightLeftovers(page: Page): Promise<string[]> {
  return page.evaluate(lightOnly => {
    const found = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.getClientRects().length === 0) continue;
      const svg = el instanceof SVGElement;
      for (const prop of svg ? ['fill', 'stroke'] as const : ['backgroundColor', 'color', 'borderTopColor'] as const) {
        if (!lightOnly.includes(cs[prop])) continue;
        if (prop === 'borderTopColor' && cs.borderTopWidth === '0px') continue;
        // A text colour counts where the element holds text of its own.
        if (prop === 'color' && !Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '')) continue;
        if (prop === 'stroke' && (cs.strokeWidth === '0px' || cs.stroke === 'none')) continue;
        const name = `${el.tagName.toLowerCase()}${el.getAttribute('class') ? `.${el.getAttribute('class')!.split(' ')[0]}` : ''} ${prop} ${cs[prop]}`;
        found.set(name, (found.get(name) ?? 0) + 1);
      }
    }
    return Array.from(found, ([name, count]) => `${name} ×${count}`);
  }, LIGHT_ONLY);
}

async function downloadPdf(page: Page, target: string): Promise<{ fills: string[]; strokes: string[]; paths: number }> {
  await page.getByRole('button', { name: /^File/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download PDF' }).click();
  await (await pending).saveAs(target);
  const { pages } = await readPdf(new Uint8Array(readFileSync(target)));
  const paths = pages.flatMap(p => p.paths);
  const unique = (values: (string | null)[]) => Array.from(new Set(values.filter((v): v is string => v !== null))).sort();
  return { fills: unique(paths.map(p => p.fill)), strokes: unique(paths.map(p => p.stroke)), paths: paths.length };
}

test('D01 dark system, first visit: the page is dark when it has loaded, and follows the system live', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await recordAtLoad(page);
  await page.goto('/');
  expect(await atLoad(page)).toEqual({ background: DARK_PAGE, theme: null });
  await expect(page.getByRole('button', { name: 'Theme: System' })).toBeVisible();
  expect(await pageBackground(page)).toBe(DARK_PAGE);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => pageBackground(page)).toBe(LIGHT_PAGE);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => pageBackground(page)).toBe(DARK_PAGE);

  // System on a light system: the sheet is white although it carries the Night paper of dark mode.
  await page.emulateMedia({ colorScheme: 'light' });
  await openState(page, 'sheet-view');
  await expect(paper(page)).toHaveAttribute('data-paper', 'night');
  expect(await paperBackground(page)).toBe(WHITE);
  expect(await headFill(page)).toBe(LIGHT_INK);
  await expect(page.getByRole('radiogroup', { name: 'Paper' })).toHaveCount(0);
});

test('D02 Light and Dark from the header persist across a reload and override the system; System follows it again', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await recordAtLoad(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await chooseTheme(page, 'Dark');
  expect(await pageBackground(page)).toBe(DARK_PAGE);
  await page.reload();
  // Dark from the first moment: the attribute is there before the app has run.
  expect(await atLoad(page)).toEqual({ background: DARK_PAGE, theme: 'dark' });
  await expect(page.getByRole('button', { name: 'Theme: Dark' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await pageBackground(page)).toBe(DARK_PAGE);

  await page.emulateMedia({ colorScheme: 'dark' });
  await chooseTheme(page, 'Light');
  expect(await pageBackground(page)).toBe(LIGHT_PAGE);
  await page.reload();
  expect(await atLoad(page)).toEqual({ background: LIGHT_PAGE, theme: 'light' });
  await expect(page.getByRole('button', { name: 'Theme: Light' })).toBeVisible();

  await chooseTheme(page, 'System');
  expect(await htmlTheme(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('fingerscore.theme'))).toBeNull();
  expect(await pageBackground(page)).toBe(DARK_PAGE);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => pageBackground(page)).toBe(LIGHT_PAGE);
});

test('D03 every state of the app in dark mode shows no colour that only the light theme has', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const found: Record<string, string[]> = {};
  for (const state of STATES) {
    await state.open(page);
    const leftovers = await lightLeftovers(page);
    if (leftovers.length > 0) found[state.id] = leftovers;
  }
  expect(found).toEqual({});

  // The check can fail: the same page in light mode has such colours.
  await page.emulateMedia({ colorScheme: 'light' });
  expect((await lightLeftovers(page)).length).toBeGreaterThan(0);
});

test('D04 the sheet in dark mode is on Night paper; Dimmed and Sepia switch at once, persist, and are no edit', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openState(page, 'sheet-view');
  const undo = page.getByRole('button', { name: /^Undo/ });
  const status = page.getByRole('status').filter({ hasText: /saved/i }).first();
  const before = { undo: await undo.isDisabled(), status: await status.textContent() };
  expect(before.undo).toBe(true);

  await expect(paperChoice(page, 'Night')).toBeChecked();
  expect(await paperBackground(page)).toBe(PAPER.night);
  expect(await headFill(page)).toBe('rgb(232, 234, 237)');

  await paperChoice(page, 'Dimmed').click();
  expect(await paperBackground(page)).toBe(PAPER.dimmed);
  expect(await headFill(page)).toBe(LIGHT_INK);
  await paperChoice(page, 'Sepia').click();
  expect(await paperBackground(page)).toBe(PAPER.sepia);
  expect(await headFill(page)).toBe('rgb(234, 223, 203)');

  // No edit: nothing to undo, and the save status has not moved.
  expect({ undo: await undo.isDisabled(), status: await status.textContent() }).toEqual(before);

  await page.reload();
  await expect(paperChoice(page, 'Sepia')).toBeChecked();
  expect(await paperBackground(page)).toBe(PAPER.sepia);
  expect(await page.evaluate(() => localStorage.getItem('fingerscore.paper'))).toBe('sepia');

  // Play mode and the Scales page draw on the same paper.
  await page.getByRole('button', { name: 'Play mode' }).click();
  const playPaper = page.getByRole('region', { name: 'Play mode' }).getByTestId('paper');
  expect(await playPaper.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(PAPER.sepia);
  await page.getByRole('button', { name: 'Paper: Sepia' }).click();
  await page.getByRole('menuitemradio', { name: 'Night' }).click();
  // Night is a step darker in play mode.
  expect(await playPaper.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(20, 23, 27)');

  for (const [name, colour] of [['dimmed', PAPER.dimmed], ['sepia', PAPER.sepia], ['night', PAPER.night]] as const) {
    await page.evaluate(p => localStorage.setItem('fingerscore.paper', p), name);
    await page.goto('/scales');
    const scale = page.getByRole('region', { name: 'Scale' });
    await expect(scale).toHaveAttribute('data-paper', name);
    expect(await scale.evaluate(el => getComputedStyle(el).backgroundColor), `Scales on ${name} paper`).toBe(colour);
  }
});

test('D05 print and PDF from dark mode are light: white paper, dark notation', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openState(page, 'sheet-view');
  const light = await downloadPdf(page, testInfo.outputPath('light.pdf'));
  expect(light.paths).toBeGreaterThan(100);

  await chooseTheme(page, 'Dark');
  expect(await paperBackground(page)).toBe(PAPER.night);
  expect(await downloadPdf(page, testInfo.outputPath('dark.pdf'))).toEqual(light);
  await paperChoice(page, 'Sepia').click();
  expect(await downloadPdf(page, testInfo.outputPath('sepia.pdf'))).toEqual(light);

  for (const choice of ['Night', 'Dimmed', 'Sepia'] as const) {
    await page.emulateMedia({ media: 'screen' });
    await paperChoice(page, choice).click();
    await page.emulateMedia({ media: 'print' });
    expect(await paperBackground(page), `printed paper, Dark, ${choice}`).toBe(WHITE);
    expect(await headFill(page), `printed notation, Dark, ${choice}`).toBe(LIGHT_INK);
    expect(await pageBackground(page)).toBe(WHITE);
  }

  // System on a dark system prints light as well.
  await page.emulateMedia({ media: 'screen', colorScheme: 'dark' });
  await chooseTheme(page, 'System');
  expect(await paperBackground(page)).toBe(PAPER.sepia);
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  expect(await paperBackground(page)).toBe(WHITE);
  expect(await headFill(page)).toBe(LIGHT_INK);
});

test('D06 the accessibility scan passes in dark mode on Night, Dimmed and Sepia paper: sheet, Scales and Play mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const scan = async (where: string) => {
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.join(' ')}`)), `axe findings: ${where}`).toEqual([]);
  };
  await openState(page, 'sheet-out-of-range');
  for (const choice of ['Night', 'Dimmed', 'Sepia'] as const) {
    await paperChoice(page, choice).click();
    await scan(`sheet on ${choice} paper`);
  }
  for (const choice of ['Dimmed', 'Sepia'] as const) {
    await paperChoice(page, choice).click();
    await page.getByRole('button', { name: 'Play mode' }).click();
    await expect(page.getByRole('region', { name: 'Play mode' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Paper: ${choice}` })).toBeVisible();
    await scan(`Play mode on ${choice} paper`);
    await page.keyboard.press('Escape');
    await page.goto('/scales');
    await expect(page.getByRole('region', { name: 'Scale' })).toHaveAttribute('data-paper', choice.toLowerCase());
    await scan(`Scales on ${choice} paper`);
    await page.goBack();
    await expect(paper(page)).toBeVisible();
  }
});
