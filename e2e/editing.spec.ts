import { expect, test, type Page } from '@playwright/test';

/** Starts from an empty browser profile, loads the sample and makes the sheet. Returns the list of console and page errors. */
async function openSample(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByTestId('system').first()).toBeVisible();
  return errors;
}

const mode = (page: Page, name: 'View' | 'Edit notes' | 'Lyrics' | 'Chords') =>
  page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name }).click();
const sheet = (page: Page) => page.getByRole('group', { name: 'Sheet music. Arrow keys select a note, Enter plays from it.' });
const undoButton = (page: Page) => page.getByRole('group', { name: 'History' }).getByRole('button', { name: 'Undo' });
const redoButton = (page: Page) => page.getByRole('group', { name: 'History' }).getByRole('button', { name: 'Redo' });
const hit = (page: Page, id: string) => page.locator(`[data-hit="${id}"]`);
const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: new RegExp(`^${text}$`) });
const hitIds = (page: Page) => page.locator('[data-hit]').evaluateAll(els => els.map(e => e.getAttribute('data-hit')!));
const rests = (page: Page) => page.locator('[data-rest]');
const bars = (page: Page) => page.locator('[data-bar]');
const lyrics = (page: Page) => page.locator('[data-lyric]').allTextContents();
/** The key shown for the player (the select labelled "You read", or "Key" for a non-transposing instrument). */
const keyText = (page: Page) => page.getByRole('combobox', { name: /^(You read|Key)/ }).first().evaluate(el => (el as HTMLSelectElement).selectedOptions[0].text);

/** Clicks the columns of the second system one by one until a plain quarter note is selected; returns its id. */
async function selectQuarterNote(page: Page): Promise<string> {
  const second = page.getByTestId('system').nth(1);
  const ids = await second.locator('[data-hit]').evaluateAll(els => els.map(e => e.getAttribute('data-hit')!));
  const panel = page.getByRole('group', { name: 'Edit notes panel' });
  for (const id of ids) {
    await second.locator(`[data-hit="${id}"]`).click();
    const quarter = (await panel.getByRole('button', { name: 'Quarter' }).getAttribute('aria-pressed')) === 'true';
    const isNote = await panel.getByRole('button', { name: 'Turn into rest' }).count() === 1;
    const tied = await second.locator(`[data-ev="${id}"][data-tied]`).count() === 1;
    if (quarter && isNote && !tied) return id;
  }
  throw new Error('no quarter note in the second system');
}

test('edit notes: shorten a note, add a bar, undo both', async ({ page }) => {
  const errors = await openSample(page);
  await mode(page, 'Edit notes');
  const keyBefore = await keyText(page);
  const restsBefore = await rests(page).count();
  const columnsBefore = (await hitIds(page)).length;
  const barsBefore = await bars(page).count();

  const id = await selectQuarterNote(page);
  const panel = page.getByRole('group', { name: 'Edit notes panel' });
  await panel.getByRole('button', { name: 'Eighth' }).click();
  await expect(panel.getByRole('button', { name: 'Eighth' })).toHaveAttribute('aria-pressed', 'true');
  await expect(rests(page)).toHaveCount(restsBefore + 1);
  await expect(page.locator('[data-hit]')).toHaveCount(columnsBefore + 1);
  const ids = await hitIds(page);
  const next = ids[ids.indexOf(id) + 1];
  await expect(page.locator(`[data-ev="${next}"][data-rest]`).or(page.locator(`[data-ev="${next}"] [data-rest]`))).toHaveCount(1);
  expect(await keyText(page)).toBe(keyBefore);

  await page.keyboard.press('Control+Z');
  await expect(rests(page)).toHaveCount(restsBefore);
  await expect(page.locator('[data-hit]')).toHaveCount(columnsBefore);

  await expect(panel).toBeVisible();   // the selected note still exists after the undo
  await panel.getByRole('button', { name: '+ Bar after' }).click();
  await expect(bars(page)).toHaveCount(barsBefore + 1);
  await expect(page.locator('[data-hit]')).toHaveCount(columnsBefore + 1);
  await expect(rests(page)).toHaveCount(restsBefore + 1);

  await undoButton(page).click();
  await expect(bars(page)).toHaveCount(barsBefore);
  await expect(page.locator('[data-hit]')).toHaveCount(columnsBefore);
  await expect(rests(page)).toHaveCount(restsBefore);
  expect(errors).toEqual([]);
});

test('keyboard: pitch, rest, redo', async ({ page }) => {
  const errors = await openSample(page);
  await mode(page, 'Edit notes');
  await hit(page, (await hitIds(page))[1]).click();
  await sheet(page).focus();
  const ids = await hitIds(page);
  const id = ids[1];
  const group = page.locator(`[data-ev="${id}"]`);
  const head = group.locator('[data-head]').first();
  const y0 = await head.getAttribute('cy');
  const chart0 = await group.locator('[data-chart]').innerHTML();

  await page.keyboard.press('ArrowUp');
  await expect(page.locator(`[data-ev="${id}"] [data-head]`).first()).not.toHaveAttribute('cy', y0!);
  await expect.poll(() => page.locator(`[data-ev="${id}"] [data-chart]`).innerHTML()).not.toBe(chart0);

  const restsBefore = await rests(page).count();
  await page.keyboard.press('r');
  await expect(rests(page)).toHaveCount(restsBefore + 1);
  await expect(page.locator(`[data-ev="${id}"] [data-rest], [data-ev="${id}"][data-rest]`)).toHaveCount(1);

  await page.keyboard.press('Control+Z');
  await expect(rests(page)).toHaveCount(restsBefore);
  await page.keyboard.press('Control+Shift+Z');
  await expect(rests(page)).toHaveCount(restsBefore + 1);
  expect(errors).toEqual([]);
});

test('lyrics: type, bulk fill, restore from file', async ({ page }) => {
  const errors = await openSample(page);
  await mode(page, 'Lyrics');
  const ids = await hitIds(page);
  await hit(page, ids[0]).click();
  const field = page.getByRole('group', { name: 'Lyrics panel' }).getByLabel('Lyric');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('Should');
  await field.fill('La');
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('auld');   // the next syllable's own text; typing replaces it
  await field.fill('li');
  await expect.poll(async () => (await lyrics(page)).slice(0, 2)).toEqual(['La', 'li']);

  await page.getByRole('textbox', { name: 'Type or paste a verse' }).fill('Should auld ac-quain-tance be for-got');
  await hit(page, ids[0]).click();   // the selection moved to note 2; choose note 1 again
  await page.getByRole('button', { name: 'Fill lyrics' }).click();
  await expect.poll(async () => (await lyrics(page)).slice(0, 7)).toEqual(['Should', 'auld', 'ac-', 'quain-', 'tance', 'be', 'for-']);
  // This verse is the sample's own text, so the fill changes nothing against the file. A different verse does.
  await expect(page.getByText('0 edits to lyrics and chords')).toBeVisible();
  await page.getByRole('textbox', { name: 'Type or paste a verse' }).fill('wat-er _ la');
  await page.getByRole('button', { name: 'Fill lyrics' }).click();   // note 1 is still selected
  await expect.poll(async () => (await lyrics(page)).slice(0, 2)).toEqual(['wat-', 'er']);
  await expect(page.getByText(/^[1-9]\d* edits to lyrics and chords$/)).toBeVisible();

  await page.getByRole('button', { name: 'Restore from file' }).click();
  await expect.poll(async () => (await lyrics(page))[0]).toBe('Should');
  await expect(page.getByText('0 edits to lyrics and chords')).toBeVisible();
  expect(errors).toEqual([]);
});

test('chords: type, change instrument, invalid text', async ({ page }) => {
  const errors = await openSample(page);
  await mode(page, 'Chords');
  const ids = await hitIds(page);
  await hit(page, ids[0]).click();
  const panel = page.getByRole('group', { name: 'Chords panel' });
  const field = panel.getByLabel('Chord');
  await expect(field).toBeFocused();
  await field.fill('');
  await page.keyboard.type('Bb');
  await expect(field).toHaveValue('B♭');
  const chord = page.locator(`[data-ev="${ids[0]}"] [data-chord="ok"]`);
  await expect(chord).toHaveCount(1);
  const before = await chord.textContent();
  expect(before).toContain('B');

  await page.getByLabel(/Fingerings for/).selectOption('cl');
  await expect(page.locator(`[data-ev="${ids[0]}"] [data-chord="ok"]`)).toHaveCount(1);
  // a B♭ clarinet reads the chord a whole tone up
  await expect(page.locator(`[data-ev="${ids[0]}"] [data-chord="ok"]`)).not.toHaveText(before!);
  await expect(page.locator('[data-chord="bad"]')).toHaveCount(0);

  await hit(page, ids[1]).click();
  await expect(field).toBeFocused();
  await field.fill('xyz');
  await expect(panel.getByText('Not a chord we can transpose. Start with a note name A–G.')).toBeVisible();
  await expect(page.locator(`[data-ev="${ids[1]}"] [data-chord="bad"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('save and reload: the edit stays, history starts empty', async ({ page }) => {
  const errors = await openSample(page);
  await mode(page, 'Edit notes');
  await expect(status(page, 'Not saved yet')).toBeVisible();
  await expect(undoButton(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status(page, 'Saved')).toBeVisible();
  const id = (await hitIds(page))[1];
  await hit(page, id).click();
  await page.getByRole('group', { name: 'Edit notes panel' }).getByRole('button', { name: 'Turn into rest' }).click();
  const restsAfter = await rests(page).count();
  await expect(status(page, 'Unsaved changes')).toBeVisible();
  await expect(undoButton(page)).toBeEnabled();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status(page, 'Saved')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('system').first()).toBeVisible();
  await expect(rests(page)).toHaveCount(restsAfter);
  await expect(page.locator(`[data-ev="${id}"] [data-rest], [data-ev="${id}"][data-rest]`)).toHaveCount(1);
  await expect(undoButton(page)).toBeDisabled();
  expect(errors).toEqual([]);
});
