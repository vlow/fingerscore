import { expect, type Locator, type Page } from '@playwright/test';

/** One named state of the app, reached from an empty browser profile. */
export interface AppState {
  id: string;
  /** Something that is visible once the state is reached. */
  landmark: (page: Page) => Locator;
  /** Starts from cleared storage, reaches the state, waits for `landmark` and for the fonts. */
  open: (page: Page) => Promise<void>;
}

/** Starts from an empty browser profile for the app's origin, then opens `path`. */
async function clean(page: Page, path = '/') {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(path);
}

const SAMPLE = /Try a sample/;
const MAKE = /Make the sheet from/;
const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: new RegExp(`^${text}$`) });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const gallery = (page: Page) => page.getByRole('region', { name: 'Your sheets' });
const system = (page: Page) => page.getByTestId('system').first();
const mode = (page: Page, name: 'View' | 'Edit notes' | 'Lyrics' | 'Chords') =>
  page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name }).click();
const heading = (name: string | RegExp) => (page: Page) => page.getByRole('heading', { level: 1, name });
const scalesPage = (page: Page) => page.getByRole('heading', { name: 'Scales with fingerings' });

async function sample(page: Page) {
  await clean(page);
  await page.getByRole('button', { name: SAMPLE }).click();
}

/** Sample, track, sheet. */
async function sheet(page: Page) {
  await sample(page);
  await page.getByRole('button', { name: MAKE }).click();
  await expect(system(page)).toBeVisible();
}

/** The sheet, saved once, back on the start page. */
async function startWithSavedSheet(page: Page) {
  await sheet(page);
  await saveButton(page).click();
  await expect(status(page, 'Saved')).toBeVisible();
  await page.goto('/');
}

async function altPopover(page: Page) {
  const pill = page.getByRole('button', { name: /^⇅ \d+ alternate fingerings for / }).first();
  await pill.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await pill.click();
}

const RAW: AppState[] = [
  {
    id: 'start-empty',
    landmark: page => page.getByTestId('drop-zone'),
    open: async page => {
      await clean(page);
      await expect(page.getByRole('navigation', { name: 'Site' })).toBeVisible();
    },
  },
  {
    id: 'start-strip',
    landmark: page => gallery(page).getByRole('button', { name: 'All 1' }),
    open: startWithSavedSheet,
  },
  {
    id: 'start-library',
    landmark: page => gallery(page).getByText(/saved in this browser/),
    open: async page => {
      await startWithSavedSheet(page);
      await gallery(page).getByRole('button', { name: 'All 1' }).click();
    },
  },
  {
    id: 'start-refusal',
    landmark: page => page.getByRole('alert').filter({ hasText: 'is not a format fingerscore reads' }),
    open: async page => {
      await clean(page);
      await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles({
        name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not music'),
      });
    },
  },
  {
    id: 'tracks',
    landmark: page => page.getByRole('button', { name: MAKE }),
    open: sample,
  },
  {
    id: 'sheet-view',
    landmark: system,
    open: sheet,
  },
  {
    id: 'sheet-edit-selected',
    landmark: page => page.locator('[aria-live=polite]').filter({ hasText: /^Selected: / }),
    open: async page => {
      await sheet(page);
      await mode(page, 'Edit notes');
      await page.locator('[data-hit]').nth(1).click();
    },
  },
  {
    id: 'sheet-lyrics',
    landmark: page => page.getByRole('group', { name: 'Lyrics panel' }).getByLabel('Lyric'),
    open: async page => {
      await sheet(page);
      await mode(page, 'Lyrics');
      await page.locator('[data-hit]').first().click();
    },
  },
  {
    id: 'sheet-chords',
    landmark: page => page.getByRole('group', { name: 'Chords panel' }).getByLabel('Chord'),
    open: async page => {
      await sheet(page);
      await mode(page, 'Chords');
      await page.locator('[data-hit]').first().click();
    },
  },
  {
    id: 'sheet-out-of-range',
    landmark: page => page.getByRole('alert').filter({ hasText: 'out of range' }),
    open: async page => {
      await sheet(page);
      for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Octave up' }).click();
    },
  },
  {
    id: 'sheet-alt-popover',
    landmark: page => page.getByRole('dialog'),
    open: async page => {
      await sheet(page);
      await altPopover(page);
    },
  },
  {
    id: 'sheet-file-menu',
    landmark: page => page.getByRole('menu', { name: 'File' }),
    open: async page => {
      await sheet(page);
      await page.getByRole('button', { name: /^File/ }).click();
    },
  },
  {
    id: 'sheet-pdf-message',
    landmark: page => page.getByRole('alert').filter({ hasText: "The PDF can't show these characters" }),
    open: async page => {
      await sheet(page);
      await mode(page, 'Lyrics');
      await page.locator('[data-hit]').first().click();
      await page.getByRole('group', { name: 'Lyrics panel' }).getByLabel('Lyric').fill('Привіт');
      await page.getByRole('button', { name: /^File/ }).click();
      await page.getByRole('menuitem', { name: 'Download PDF' }).click();
    },
  },
  {
    id: 'play-mode',
    landmark: page => page.getByRole('region', { name: 'Play mode' }),
    open: async page => {
      await sheet(page);
      await page.getByRole('button', { name: 'Play mode' }).click();
    },
  },
  {
    id: 'scales',
    landmark: page => page.locator('[data-note]').first(),
    open: async page => {
      await clean(page, '/scales');
      await expect(scalesPage(page)).toBeVisible();
    },
  },
  {
    id: 'scales-alt-popover',
    landmark: page => page.getByRole('dialog'),
    open: async page => {
      await clean(page, '/scales');
      await page.getByRole('radiogroup', { name: 'Key', exact: true }).getByRole('radio', { name: 'F · sounds A♭', exact: true }).click();
      await altPopover(page);
    },
  },
  { id: 'about', landmark: heading('Why I made fingerscore'), open: page => clean(page, '/about') },
  { id: 'imprint', landmark: heading('Imprint'), open: page => clean(page, '/imprint') },
  { id: 'privacy', landmark: heading('Privacy'), open: page => clean(page, '/privacy') },
  { id: 'terms', landmark: heading('Terms of Use'), open: page => clean(page, '/terms') },
];

/** Each state's `open` also waits for its landmark and for the fonts. */
export const STATES: AppState[] = RAW.map(state => ({
  ...state,
  open: async page => {
    await state.open(page);
    await expect(state.landmark(page).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
  },
}));

/** Brings the app into the state `id`. */
export async function openState(page: Page, id: string): Promise<void> {
  const state = STATES.find(s => s.id === id);
  if (!state) throw new Error(`unknown state: ${id}`);
  await state.open(page);
}
