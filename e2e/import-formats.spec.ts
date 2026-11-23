import { expect, test, type Page } from '@playwright/test';

/** First notes of each fixture as MIDI numbers in the file's own key. */
const FIRST_NOTES = {
  'e2e/fixtures/tune.mscx': { format: 'MuseScore', track: 'Flute', notes: 12, first: [64, 67, 69, 67] },
  'e2e/fixtures/tune.abc': { format: 'ABC', track: 'Melody', notes: 13, first: [67, 71, 74, 79] },
} as const;

/** The pitches of the sheet's first events, from the session copy of the sheet. */
async function firstPitches(page: Page, count: number): Promise<number[]> {
  return page.evaluate(n => {
    const raw = sessionStorage.getItem('fingerscore.doc');
    const doc = JSON.parse(raw ?? 'null');
    const stored = doc.doc ?? doc;
    return (stored.score as { ev: { m: number; r: boolean }[] }[])
      .flatMap(b => b.ev).filter(e => !e.r).slice(0, n).map(e => e.m);
  }, count);
}

for (const [path, want] of Object.entries(FIRST_NOTES)) {
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
    const file = path.split('/').pop()!;
    await expect(page.getByText(`${want.format} · track ${want.track} of 1 · ${want.notes} notes`)).toBeVisible();
    await expect(page.getByText(file, { exact: true })).toBeVisible();
    // The chip names the track by its name; the spec's example reads "track 1 of 3" (reported).
    expect(await firstPitches(page, want.first.length)).toEqual(want.first);
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
