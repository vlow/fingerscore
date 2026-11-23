import { expect, test, type Page } from '@playwright/test';

/** Durations in the document are ticks: 48 is a whole note, 12 a quarter. */
const QUARTER = 12;
const HALF = 24;
const WHOLE = 48;

const FIXTURES = {
  'e2e/fixtures/tune.mscx': {
    format: 'MuseScore', track: 'Flute',
    pitches: [64, 67, 69, 67, 64, 62, 60, 62, 64, 67, 69, 67],
    ticks: [QUARTER, QUARTER, QUARTER, QUARTER, QUARTER, QUARTER, HALF, QUARTER, QUARTER, QUARTER, QUARTER, WHOLE],
  },
  'e2e/fixtures/tune.abc': {
    format: 'ABC', track: 'Melody',
    pitches: [67, 71, 74, 79, 78, 74, 71, 69, 72, 76, 72, 71, 67],
    ticks: [QUARTER, QUARTER, QUARTER, QUARTER, QUARTER, QUARTER, HALF, QUARTER, QUARTER, QUARTER, QUARTER, HALF, HALF],
  },
} as const;

/**
 * The notes of the sheet, read from the session copy of the document (`fingerscore.doc`, as written by the store):
 * pitch in the file's own key and duration in ticks. This is the only place that knows the storage shape.
 */
async function sheetNotes(page: Page): Promise<{ pitch: number; ticks: number }[]> {
  return page.evaluate(() => {
    const stored = JSON.parse(sessionStorage.getItem('fingerscore.doc') ?? 'null');
    const doc = stored.doc ?? stored;
    return (doc.score as { ev: { m: number; d: number; r: boolean }[] }[])
      .flatMap(b => b.ev).filter(e => !e.r).map(e => ({ pitch: e.m, ticks: e.d }));
  });
}

for (const [path, want] of Object.entries(FIXTURES)) {
  test(`${want.format} file: one track goes to a sheet with the format in the page bar`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/');
    await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles(path);
    await expect(page.getByText(/Ready — next you pick the part to play/)).toBeVisible();
    // One usable track: Continue goes straight to the sheet, without the track page.
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/sheet$/);
    await expect(page.getByTestId('system').first()).toBeVisible();
    await expect(page.getByText(`${want.format} · track ${want.track} of 1 · ${want.pitches.length} notes`)).toBeVisible();
    await expect(page.getByText(path.split('/').pop()!, { exact: true })).toBeVisible();
    expect(await sheetNotes(page)).toEqual(want.pitches.map((pitch, i) => ({ pitch, ticks: want.ticks[i] })));
    expect(errors).toEqual([]);
  });
}

test('a .txt file is refused with the format message', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles({
    name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not music'),
  });
  await expect(page.getByRole('alert')).toContainText(
    '"notes.txt" is not a format fingerscore reads. Use MIDI, MusicXML, MuseScore or ABC.');
});
