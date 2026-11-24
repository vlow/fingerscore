/**
 * Acceptance suite: one numbered test for each of the 12 checks of the handoff (SPEC section 16, A01 to A12) and for
 * each of 10 additions of version 2 (V01 to V10). `src/acceptanceIndex.test.ts` keeps the numbering whole.
 *
 * The shipped sample is "Auld Lang Syne"; the handoff's numbers describe "The Water Is Wide". The A tests pin what the
 * sample gives. Unit tests pin the handoff's own numbers on the handoff song, by title:
 *   src/domain/transpose.test.ts   "check 1: Xaphoon C suggests F major, C4–C5"
 *                                  "check 2: shift 0 on Xaphoon C has 8 notes below C4"
 *                                  "check 3: written and sounding keys"
 *                                  "check 4: alto sax, sounds in D → reads B"
 *   src/domain/playback.test.ts    "check 5: demo playback" (73 notes; 78.6 s where the handoff says "≈ 76 s")
 *   src/pages/SheetPage.test.tsx   "check 2: red banner at shift 0 on Xaphoon C, fix button applies the best key"
 *                                  "check 4: key bridge, sounds in D → reads B"
 *                                  "check 6: quarter → eighth leaves an eighth rest; undo restores; the key does not change"
 *                                  "check 7: typing Bb shows B♭; F#m7b5/C# is stored and drawn; transposing moves chords"
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openState } from './states';
import { readPdf } from './readPdf';

// ---- helpers ----

/** The parts of the stored document these tests read. The session copy is written by the store on every change. */
interface StoredDoc {
  score: { cap: number; rs?: boolean; re?: boolean; volta: string; ev: { id: string; d: number; r: boolean }[] }[];
  timeSig: [number, number]; tempo: number; shift: number; originalTonicPc: number; originalMode: string;
  imported: { lyrics: Record<string, string>; chords: Record<string, string> };
  chords: Record<string, { raw: string; ok: boolean; pc: number; rest: string; bass: number | null; tk: number }>;
  source: { file: string; format: string; track: string; trackCount: number; simplified: boolean };
}
async function storedDoc(page: Page): Promise<StoredDoc> {
  return page.evaluate(() => {
    const stored = JSON.parse(sessionStorage.getItem('fingerscore.doc') ?? 'null');
    return stored.doc ?? stored;
  });
}

const picker = (page: Page) => page.getByLabel(/Fingerings for/);
const mode = (page: Page, name: 'View' | 'Edit notes' | 'Lyrics' | 'Chords') =>
  page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name }).click();
const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: new RegExp(`^${text}$`) });
const selectedText = (select: Locator) => select.evaluate(el => (el as HTMLSelectElement).selectedOptions[0].text);
const concertKey = (page: Page) => page.getByLabel(/^Sounds in/);
const writtenKey = (page: Page) => page.getByLabel(/^You read/);
const fileMenuItem = async (page: Page, name: string) => {
  await page.getByRole('button', { name: /^File/ }).click();
  await page.getByRole('menuitem', { name }).click();
};
const alerts = (page: Page) => page.getByRole('alert');
const hitIds = (page: Page) => page.locator('[data-hit]').evaluateAll(els => els.map(e => e.getAttribute('data-hit')!));
const dropZoneInput = (page: Page) => page.getByTestId('drop-zone').locator('input[type=file]');

/** Opens a fixture from the start page; a file with one usable track goes straight to the sheet. */
async function importFixture(page: Page, path: string): Promise<void> {
  await openState(page, 'start-empty');
  await dropZoneInput(page).setInputFiles(path);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/sheet$/);
  await expect(page.getByTestId('system').first()).toBeVisible();
}

/** The ids of the events that a playing sheet highlights, in order, from now on. Read with `highlighted`. */
async function recordHighlights(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __seq: { id: string; t: number }[] };
    w.__seq = [];
    new MutationObserver(() => {
      const id = document.querySelector('[data-playing="true"]')?.getAttribute('data-ev');
      if (id && (w.__seq.length === 0 || w.__seq[w.__seq.length - 1].id !== id)) w.__seq.push({ id, t: performance.now() });
    }).observe(document.body, { subtree: true, attributes: true, childList: true });
  });
}
const highlighted = (page: Page) => page.evaluate(() => (window as unknown as { __seq: { id: string; t: number }[] }).__seq);

/** Downloads through the File menu and returns the saved copy's path. */
async function download(page: Page, item: string, path: (name: string) => string): Promise<string> {
  await page.getByRole('button', { name: /^File/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: item }).click();
  const file = await pending;
  const target = path(file.suggestedFilename());
  await file.saveAs(target);
  return target;
}

// ---- the 12 checks of the handoff ----

test('A01 Xaphoon C: the sample needs no shift, reads F major, spans C4–D5 and is all playable', async ({ page }) => {
  await openState(page, 'sheet-view');
  await picker(page).selectOption('xc');
  await expect(page.getByText('Suggested key applied: F major (0 from the original F major).')).toBeVisible();
  await expect(page.getByText('semitones from original').locator('..')).toHaveText(/^0\s*semitones from original$/);
  expect(await selectedText(page.getByLabel('Key', { exact: true }))).toBe('F major');
  await expect(page.getByText('This song: C4 – D5 · all playable')).toBeVisible();
  await expect(alerts(page)).toHaveCount(0);
  await expect(page.locator('[data-state="bad"]')).toHaveCount(0);
  await expect(page.locator('[data-missing]')).toHaveCount(0);
});

test('A02 Xaphoon C: shifted down, the notes below C4 get the red banner, red noteheads and "!" charts, in the count the banner names', async ({ page }) => {
  await openState(page, 'sheet-view');
  await picker(page).selectOption('xc');
  const down = page.getByRole('button', { name: 'One semitone down' });
  for (let i = 0; i < 12 && await alerts(page).count() === 0; i++) await down.click();
  const banner = alerts(page);
  await expect(banner).toContainText('below C4 — out of range for the xaphoon');
  const count = Number(/(\d+) notes? (?:is|are) below C4/.exec((await banner.textContent())!)![1]);
  expect(count).toBeGreaterThan(0);
  const red = page.locator('[data-state="bad"] [data-head]');
  await expect(red).toHaveCount(count);
  for (const head of await red.all()) {
    expect(await head.evaluate(el => el.getAttribute('fill') ?? el.getAttribute('stroke'))).toBe('#B91C1C');
  }
  await expect(page.locator('[data-missing="bad"]')).toHaveCount(count);
  await expect(page.locator('[data-missing="bad"] text')).toHaveText(Array(count).fill('!'));
});

test('A03 sample: alto sax writes F major and sounds A♭ major; B♭ clarinet C and B♭; tenor sax F and E♭', async ({ page }) => {
  await openState(page, 'sheet-view');
  for (const [id, sounds, reads] of [['asax', 'A♭ major', 'F major'], ['cl', 'B♭ major', 'C major'], ['tsax', 'E♭ major', 'F major']]) {
    await picker(page).selectOption(id);
    await expect(writtenKey(page)).toBeVisible();
    expect(await selectedText(concertKey(page)), `${id} sounds`).toBe(sounds);
    expect(await selectedText(writtenKey(page)), `${id} reads`).toBe(reads);
  }
});

test('A04 alto sax: "Sounds in" D major writes B major', async ({ page }) => {
  await openState(page, 'sheet-view');
  await picker(page).selectOption('asax');
  await concertKey(page).selectOption({ label: 'D major' });
  expect(await selectedText(concertKey(page))).toBe('D major');
  expect(await selectedText(writtenKey(page))).toBe('B major');
  await expect(page.getByText('Alto sax (E♭) · you read B major · sounds D major')).toBeVisible();
});

test('A05 playback: the sample has 56 notes and 39.0 s at ♩ = 100; a repeat with two endings plays bars 1 2 3 4 then 2 3 5', async ({ page }) => {
  // The sample. The file's length shows on the track page, the note count on the sheet; the sheet shows no total, so
  // the exact length comes from the tempo shown and the beats of the bars: 65 quarters at 100 per minute.
  await openState(page, 'tracks');
  await expect(page.getByText('Auld_Lang_Syne.mid · MIDI · 4 tracks · 4/4 · ♩ = 100 · 0:39')).toBeVisible();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByText('MIDI · track Melody of 4 · 56 notes')).toBeVisible();
  await expect(page.getByText('♩ = 100').first()).toBeVisible();
  const sample = await storedDoc(page);
  const quarters = sample.score.reduce((sum, bar) => sum + bar.cap, 0) / 12;
  expect(quarters).toBe(65);
  expect((quarters * 60) / sample.tempo).toBeCloseTo(39.0, 5);

  // The repeat, at the fastest tempo the transport offers.
  await importFixture(page, 'e2e/fixtures/repeat.abc');
  await expect(page.getByText('ABC · track Melody of 1 · 20 notes')).toBeVisible();
  const bars = (await storedDoc(page)).score;
  expect(bars.map(b => ({ rs: !!b.rs, re: !!b.re, volta: b.volta }))).toEqual([
    { rs: false, re: false, volta: '' }, { rs: false, re: false, volta: '' }, { rs: true, re: false, volta: '' },
    { rs: false, re: false, volta: '' }, { rs: false, re: true, volta: '1' }, { rs: false, re: false, volta: '2' },
  ]);
  const slider = page.getByRole('group', { name: 'Playback' }).getByRole('slider');
  await slider.fill(await slider.evaluate(el => (el as HTMLInputElement).max));
  await recordHighlights(page);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeVisible({ timeout: 30_000 });
  const played = (await highlighted(page)).map(h => h.id);
  const order = [0, 1, 2, 3, 4, 2, 3, 5];
  expect(played).toEqual(order.flatMap(i => bars[i].ev.map(e => e.id)));
  expect(played).toHaveLength(28);   // pickup 1, bar 1 4, bars 2 and 3 twice 16, first ending 4, second ending 3
});

test('A06 Edit notes: quarter to eighth inserts an eighth rest, a length that does not fit is disabled, undo restores the bar, the key stays', async ({ page }) => {
  await openState(page, 'sheet-view');
  await mode(page, 'Edit notes');
  const panel = page.getByRole('group', { name: 'Edit notes panel' });
  const key = () => selectedText(page.getByRole('combobox', { name: /^(You read|Key)/ }).first());
  const keyBefore = await key();
  const snapshot = () => page.locator('[data-ev]').evaluateAll(els => els.map(e =>
    `${e.getAttribute('data-ev')}:${e.querySelector('[data-head]')?.getAttribute('cy') ?? 'rest'}`));

  // A plain quarter note, found in the second system as editing.spec.ts does.
  const second = page.getByTestId('system').nth(1);
  let chosen = '';
  for (const id of await second.locator('[data-hit]').evaluateAll(els => els.map(e => e.getAttribute('data-hit')!))) {
    await second.locator(`[data-hit="${id}"]`).click();
    const quarter = (await panel.getByRole('button', { name: 'Quarter' }).getAttribute('aria-pressed')) === 'true';
    const isNote = await panel.getByRole('button', { name: 'Turn into rest' }).count() === 1;
    const tied = await second.locator(`[data-ev="${id}"][data-tied]`).count() === 1;
    if (quarter && isNote && !tied) { chosen = id; break; }
  }
  expect(chosen).not.toBe('');
  const before = await snapshot();
  const restsBefore = await page.locator('[data-rest]').count();
  await expect(panel.getByRole('button', { name: 'Whole' })).toBeDisabled();   // four beats do not fit behind a quarter note

  await panel.getByRole('button', { name: 'Eighth' }).click();
  await expect(panel.getByRole('button', { name: 'Eighth' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-rest]')).toHaveCount(restsBefore + 1);
  const ids = await hitIds(page);
  await expect(page.locator(`[data-ev="${ids[ids.indexOf(chosen) + 1]}"] [data-rest="restEighth"], [data-ev="${ids[ids.indexOf(chosen) + 1]}"][data-rest="restEighth"]`)).toHaveCount(1);
  expect(await key()).toBe(keyBefore);

  await page.keyboard.press('Control+Z');
  await expect(page.locator('[data-rest]')).toHaveCount(restsBefore);
  expect(await snapshot()).toEqual(before);
  expect(await key()).toBe(keyBefore);
});

test('A07 Chords: "Bb" shows B♭, "F#m7b5/C#" is drawn with a raised extension and moves with +2 semitones', async ({ page }) => {
  await openState(page, 'sheet-chords');
  const field = page.getByRole('group', { name: 'Chords panel' }).getByLabel('Chord');
  await field.fill('');
  await page.keyboard.type('Bb');
  await expect(field).toHaveValue('B♭');

  const id = (await page.locator('[data-selected="true"]').getAttribute('data-ev'))!;
  await field.fill('');
  await page.keyboard.type('F#m7b5/C#');
  const chord = page.locator(`[data-ev="${id}"] [data-chord="ok"]`);
  await expect(chord).toHaveText('F♯m7♭5/C♯');
  // "7♭5" is a smaller tspan raised above the baseline; the root, the quality and the bass stay on it.
  await expect(chord.locator('[data-ext]')).toHaveText('7♭5');
  await expect(chord.locator('[data-ext]')).toHaveAttribute('dy', '-6');

  const shiftBefore = (await storedDoc(page)).shift;
  const up = page.getByRole('button', { name: 'One semitone up' });
  await up.click();
  await up.click();
  await expect(page.locator(`[data-ev="${id}"] [data-chord="ok"]`)).toHaveText('G♯m7♭5/D♯');
  // The stored chord keeps the root F♯ (pc 6) and the bass C♯ (pc 1) relative to the original key; the shift moves
  // by 2, and the drawn chord follows it.
  const after = await storedDoc(page);
  expect(after.chords[id]).toEqual({ raw: 'F♯m7♭5/C♯', ok: true, pc: 6, rest: 'm7♭5', bass: 1, tk: 0 });
  expect(after.shift).toBe(shiftBefore + 2);
});

test('A08 Play mode: only the score, → and Space turn by 88 % of the screen, auto-scroll moves one system per 9.6 s, Esc exits', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await openState(page, 'sheet-view');
  await page.getByRole('button', { name: 'Play mode' }).click();
  const region = page.getByRole('region', { name: 'Play mode' });
  const scroller = page.getByTestId('play-scroller');
  await expect(region).toBeFocused();

  await expect(region.getByRole('textbox')).toHaveCount(0);
  await expect(region.locator('[data-hit]')).toHaveCount(0);
  await expect(page.locator('#root')).toHaveAttribute('inert', '');

  const height = await scroller.evaluate(el => el.clientHeight);
  const top = () => scroller.evaluate(el => el.scrollTop);
  await page.keyboard.press('ArrowRight');
  await expect.poll(top).toBeGreaterThan(height * 0.88 - 2);
  expect(await top()).toBeLessThan(height * 0.88 + 2);
  await page.keyboard.press('PageUp');
  await expect.poll(top).toBe(0);
  await page.keyboard.press('Space');
  await expect.poll(top).toBeGreaterThan(height * 0.88 - 2);
  expect(await top()).toBeLessThan(height * 0.88 + 2);

  // Four bars of 4/4 at ♩ = 100 are 9.6 s. One system is 290 units tall, drawn at the play mode's zoom.
  const zoom = Number(await page.getByTestId('play-zoom').evaluate(el => getComputedStyle(el).zoom));
  await page.keyboard.press('a');
  await expect(region.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
  await expect(region.getByText(/starts in \d+ s$/)).toBeVisible();   // the music first comes down to the reading line
  await expect(region.getByText(/1 line \/ 10 s$/)).toBeVisible({ timeout: 15_000 });   // the label rounds 9.6 up
  const pixelsPerSecond = await scroller.evaluate(async el => {
    const t0 = performance.now(), y0 = el.scrollTop;
    await new Promise(resolve => setTimeout(resolve, 3000));
    return (el.scrollTop - y0) / ((performance.now() - t0) / 1000);
  });
  const expected = (290 * zoom) / 9.6;
  // The same band as play-mode.spec.ts: 0.6 to 1.5 times the expected pace.
  expect(pixelsPerSecond).toBeGreaterThan(expected * 0.6);
  expect(pixelsPerSecond).toBeLessThan(expected * 1.5);

  await page.keyboard.press('Escape');
  await expect(region).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Sheet title' })).toBeVisible();
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
});

test('A09 Library: one sheet shows 1 bar and 4 empty bars with "All 1"; All opens the library; filter, sort, search, delete and Play work', async ({ page }) => {
  await openState(page, 'start-strip');
  const gallery = page.getByRole('region', { name: 'Your sheets' });
  await expect(gallery.getByRole('listitem')).toHaveCount(1);
  await expect(gallery.locator('li[aria-hidden="true"]')).toHaveCount(4);
  await expect(gallery.getByRole('button', { name: 'All 1' })).toBeVisible();

  // Two more sheets: the saved one under other titles and instruments.
  await page.evaluate(() => {
    const key = 'fingerscore.library.v1';
    const [first] = JSON.parse(localStorage.getItem(key)!);
    const now = Date.now();
    const sheets = [['Zebra Tune', 'cl'], ['Apple Tune', 'asax'], ['Moss Tune', 'asax']];
    localStorage.setItem(key, JSON.stringify(sheets.map(([title, inst], i) => ({
      ...first, id: `seed-${i}`, title, savedAt: new Date(now - i * 60_000).toISOString(), doc: { ...first.doc, title, inst },
    }))));
  });
  await page.goto('/');
  await gallery.getByRole('button', { name: 'All 3' }).click();
  await expect(gallery.getByText('3 sheets saved in this browser')).toBeVisible();
  const titles = () => gallery.getByRole('listitem').locator('a').first();
  await expect(gallery.getByRole('listitem')).toHaveCount(3);

  // The default order is the newest first: Zebra, Apple, Moss. Title A–Z differs from it, with no filter active.
  const order = () => gallery.getByRole('listitem').evaluateAll(items => items.map(li => /^\w+ Tune/.exec(li.querySelector('a')!.textContent!)![0]));
  const sort = gallery.getByRole('combobox', { name: 'Sort' });
  await expect.poll(order).toEqual(['Zebra Tune', 'Apple Tune', 'Moss Tune']);
  await sort.selectOption('Title A–Z');
  await expect.poll(order).toEqual(['Apple Tune', 'Moss Tune', 'Zebra Tune']);
  await sort.selectOption('Recently saved');
  await expect.poll(order).toEqual(['Zebra Tune', 'Apple Tune', 'Moss Tune']);

  await gallery.getByRole('button', { name: 'Saxophone 2' }).click();
  await expect.poll(order).toEqual(['Apple Tune', 'Moss Tune']);   // the clarinet sheet is filtered out
  await gallery.getByRole('button', { name: 'All 3' }).click();
  await gallery.getByRole('searchbox').fill('clarinet');
  await expect(gallery.getByRole('listitem')).toHaveCount(1);
  await expect(titles()).toHaveText('Zebra Tune');
  await gallery.getByRole('searchbox').fill('');

  await gallery.getByRole('button', { name: 'Delete Moss Tune' }).click();
  await gallery.getByRole('button', { name: 'Keep' }).click();
  await expect(gallery.getByRole('listitem')).toHaveCount(3);
  await gallery.getByRole('button', { name: 'Delete Moss Tune' }).click();
  await gallery.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(gallery.getByRole('listitem')).toHaveCount(2);

  await page.getByRole('link', { name: 'Play Zebra Tune' }).click();
  await expect(page.getByRole('region', { name: 'Play mode' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Play mode' }).getByText('Zebra Tune')).toBeVisible();
});

test('A10 Lyrics bulk: "Oh love is gen-tle" fills Oh, love, is, gen-, tle on five consecutive notes', async ({ page }) => {
  await openState(page, 'sheet-lyrics');
  const ids = await hitIds(page);
  await page.getByRole('textbox', { name: 'Type or paste a verse' }).fill('Oh love is gen-tle');
  await page.locator(`[data-hit="${ids[0]}"]`).click();
  await page.getByRole('button', { name: 'Fill lyrics' }).click();
  const owners = await page.locator('[data-lyric]').evaluateAll(els => els.slice(0, 5).map(e => ({
    text: e.textContent, ev: e.closest('[data-ev]')?.getAttribute('data-ev'),
  })));
  expect(owners.map(o => o.text)).toEqual(['Oh', 'love', 'is', 'gen-', 'tle']);
  expect(owners.map(o => o.ev)).toEqual(ids.slice(0, 5));
});

test('A11 Save, edit, download and open JSON: Saved, Unsaved changes, the same document back, a foreign file refused', async ({ page }, testInfo) => {
  await openState(page, 'sheet-view');
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(status(page, 'Not saved yet')).toBeVisible();
  await save.click();
  await expect(status(page, 'Saved')).toBeVisible();

  await mode(page, 'Edit notes');
  const rest = async () => {
    await page.locator('[data-hit]').nth(1).click();
    await page.getByRole('group', { name: 'Edit notes panel' }).getByRole('button', { name: 'Turn into rest' }).click();
  };
  await rest();
  await expect(status(page, 'Unsaved changes')).toBeVisible();
  await save.click();
  await expect(status(page, 'Saved')).toBeVisible();

  const sourceAtDownload = (await storedDoc(page)).source;
  const first = await download(page, 'Download JSON', name => testInfo.outputPath(`a-${name}`));
  const restsAtDownload = await page.locator('[data-rest]').count();
  await page.locator('[data-hit]').nth(3).click();   // a second change, so that opening the file has something to replace
  await page.getByRole('group', { name: 'Edit notes panel' }).getByRole('button', { name: 'Turn into rest' }).click();
  await expect(page.locator('[data-rest]')).toHaveCount(restsAtDownload + 1);

  await page.getByLabel('Open JSON file').setInputFiles(first);
  await expect(status(page, 'Saved')).toBeVisible();
  await expect(page.locator('[data-rest]')).toHaveCount(restsAtDownload);
  const second = await download(page, 'Download JSON', name => testInfo.outputPath(`b-${name}`));
  const parse = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { title: string; doc: object };
  // The document comes back as it went out, except `source`. That is decided behaviour since version 1, not a
  // defect: a sheet opened from a file records that file as its source, and the page bar shows it ("… · fingerscore
  // sheet · …"). The downloaded file keeps the source the open document had; the reopened one has the file form.
  const withoutSource = (path: string) => { const { source, ...rest } = parse(path).doc as { source: { format: string } }; return { source, rest }; };
  expect(withoutSource(second).rest).toEqual(withoutSource(first).rest);
  expect(withoutSource(first).source).toEqual(sourceAtDownload);
  expect(withoutSource(first).source.format).toBe('MIDI');
  expect(withoutSource(second).source).toMatchObject({ file: 'a-auld-lang-syne.fingerscore.json', format: 'file', track: '', trackCount: 0 });
  await expect(page.getByText('a-auld-lang-syne.fingerscore.json · fingerscore sheet · ')).toBeVisible();
  expect(parse(second).title).toBe(parse(first).title);

  await page.getByLabel('Open JSON file').setInputFiles({ name: 'foreign.json', mimeType: 'application/json', buffer: Buffer.from('{"name":"x"}') });
  await expect(alerts(page)).toHaveText('"foreign.json" isn\'t a fingerscore sheet.');
  await expect(page.locator('[data-rest]')).toHaveCount(restsAtDownload);
  await expect(status(page, 'Saved')).toBeVisible();
});

test('A12 Scales: A harmonic minor has G♯, E blues is E G A B♭ B D, C chromatic rises with sharps and falls with flats', async ({ page }) => {
  await openState(page, 'scales');
  await page.getByRole('combobox', { name: 'Instrument' }).selectOption('fl');   // a C instrument: written is sounding
  const scale = (value: string) => page.getByRole('combobox', { name: 'Scale' }).selectOption(value);
  const key = (name: string) => page.getByRole('radiogroup', { name: 'Key', exact: true }).getByRole('radio', { name, exact: true }).click();
  const names = () => page.locator('[data-name]').allTextContents();

  await scale('hmin');
  await key('A');
  expect(await names()).toEqual(['A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G♯5', 'A5']);

  await scale('blues');
  await key('E');
  expect((await names()).map(n => n.slice(0, -1))).toEqual(['E', 'G', 'A', 'B♭', 'B', 'D', 'E']);   // the octave E ends the line

  await scale('chrom');
  await key('C');
  await page.getByRole('radiogroup', { name: 'Direction', exact: true }).getByRole('radio', { name: 'Up & down' }).click();
  expect(await names()).toEqual([
    'C4', 'C♯4', 'D4', 'D♯4', 'E4', 'F4', 'F♯4', 'G4', 'G♯4', 'A4', 'A♯4', 'B4', 'C5',
    'B4', 'B♭4', 'A4', 'A♭4', 'G4', 'G♭4', 'F4', 'E4', 'E♭4', 'D4', 'D♭4', 'C4',
  ]);
});

// ---- version 2 ----

test('V01 MuseScore: full.mscx imports with its key, time signature, tempo, lyrics and chord symbols', async ({ page }) => {
  await importFixture(page, 'e2e/fixtures/full.mscx');
  // The title comes from the file name: the importer does not read the file's own title.
  await expect(page.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('full');
  await expect(page.getByText('MuseScore · track Flute of 1 · 20 notes')).toBeVisible();
  await expect(page.getByText('Key (concert)').locator('..')).toContainText('D major');
  await expect(page.getByText('Time', { exact: true }).locator('..')).toContainText('3/4');
  await expect(page.getByText('Tempo', { exact: true }).locator('..')).toContainText('♩ = 90');
  await expect(page.locator('[data-bar]')).toHaveCount(8);
  await expect(page.locator('[data-lyric]')).toHaveText(['Sun', 'ris-', 'ing', 'gold']);
  await expect(page.locator('[data-chord="ok"]')).toHaveCount(3);
  const doc = await storedDoc(page);
  expect(Object.values(doc.imported.chords)).toEqual(['D', 'G', 'A7']);
  expect(Object.values(doc.imported.lyrics)).toEqual(['Sun', 'ris-', 'ing', 'gold']);
  expect(doc).toMatchObject({ timeSig: [3, 4], tempo: 90, originalTonicPc: 2, originalMode: 'major' });
});

test('V02 ABC mode: dorian.abc imports as D dorian with the signature of C major', async ({ page }) => {
  await importFixture(page, 'e2e/fixtures/dorian.abc');
  await expect(page.getByText('ABC · track Melody of 1 · 28 notes')).toBeVisible();
  await expect(page.getByText('Key (concert)').locator('..')).toContainText('D Dorian');
  const doc = await storedDoc(page);
  expect(doc).toMatchObject({ originalTonicPc: 2, originalMode: 'dorian' });
  await expect(page.getByTestId('system').first().locator('[data-acc]')).toHaveCount(0);   // no sharps or flats in the signature
  await expect(page.locator('[data-bar]')).toHaveCount(8);
});

test('V03 cut time: cut-time.abc imports as 2/2 at ♩ = 120, which gives 16 s for 8 bars, and four beats of real playback take 2 s', async ({ page }) => {
  await importFixture(page, 'e2e/fixtures/cut-time.abc');
  const doc = await storedDoc(page);
  expect(doc).toMatchObject({ timeSig: [2, 2], tempo: 120 });   // Q:1/2=60 is 120 quarters a minute
  expect(doc.score).toHaveLength(8);
  const quarters = doc.score.reduce((sum, bar) => sum + bar.cap, 0) / 12;
  expect(quarters).toBe(32);
  expect((quarters * 60) / doc.tempo).toBe(16);

  // The notes light up half a second apart (the first one waits for the audio to start): five notes after the
  // first, four beats, span 2 s.
  await recordHighlights(page);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect.poll(async () => (await highlighted(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(6);
  const marks = await highlighted(page);
  await page.getByRole('button', { name: 'Stop' }).click();
  const span = (marks[5].t - marks[1].t) / 1000;
  // Four beats at 120 take 2.0 s. The band is wide so that a 500 ms hiccup on a slow runner passes; a tempo off by a
  // factor of 2 (1.0 s or 4.0 s) fails.
  expect(span).toBeGreaterThan(1.6);
  expect(span).toBeLessThan(2.9);
});

test('V04 triplets: imported, made from plain notes, changed and undone', async ({ page }) => {
  await importFixture(page, 'e2e/fixtures/triplet.abc');
  const marks = page.locator('[data-tuplet]');
  const panel = page.getByRole('group', { name: 'Edit notes panel' });
  await expect(marks).toHaveCount(1);
  await expect(marks.locator('text')).toHaveText('3');

  await mode(page, 'Edit notes');
  await page.locator('[data-hit]').first().click();
  const pitch = () => panel.getByRole('group', { name: 'Pitch' }).innerText();
  const first = await pitch();
  await panel.getByRole('button', { name: 'Triplet' }).click();
  await expect(marks).toHaveCount(2);

  await page.keyboard.press('ArrowRight');   // the second member of the new group
  const second = await pitch();
  await page.getByRole('button', { name: 'Semitone up', exact: true }).click();
  await expect.poll(pitch).not.toBe(second);
  await page.keyboard.press('Control+Z');
  await expect.poll(pitch).toBe(second);
  await page.keyboard.press('Control+Z');
  await expect(marks).toHaveCount(1);
  await page.locator('[data-hit]').first().click();
  await expect(panel.getByRole('button', { name: 'Quarter' })).toHaveAttribute('aria-pressed', 'true');
  expect(await pitch()).toBe(first);
});

test('V05 PDF of a sheet: a paginated file whose title, lyrics and chord letters are text', async ({ page }, testInfo) => {
  await openState(page, 'sheet-view');
  await mode(page, 'Edit notes');
  await page.locator('[data-hit]').first().click();
  const add = page.getByRole('group', { name: 'Edit notes panel' }).getByRole('button', { name: '+ Bar after' });
  const barsBefore = await page.locator('[data-bar]').count();
  for (let i = 0; i < 4; i++) await add.click();   // the 16 bars of the sample fill 4 systems; more bars need a second page
  await expect(page.locator('[data-bar]')).toHaveCount(barsBefore + 4);
  const path = await download(page, 'Download PDF', name => testInfo.outputPath(name));
  const { pages } = await readPdf(new Uint8Array(readFileSync(path)));
  expect(pages.length).toBeGreaterThan(1);
  const texts = pages.flatMap(p => p.text.map(t => t.str));
  expect(texts).toContain('Auld Lang Syne');
  expect(texts).toContain('Should');
  expect(texts).toContain('auld');
  expect(texts.filter(t => t === 'F').length).toBeGreaterThan(0);
  expect(texts.filter(t => t === 'C').length).toBeGreaterThan(0);
  expect(texts.some(t => t.includes(`page 2 of ${pages.length}`))).toBe(true);
});

test('V06 PDF of a scale: a file with the scale\'s name and one chart per note', async ({ page }, testInfo) => {
  await openState(page, 'scales');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const file = await pending;
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const { pages } = await readPdf(new Uint8Array(readFileSync(path)));
  expect(pages).toHaveLength(1);
  const p = pages[0];
  expect(p.text.map(t => t.str).join(' ')).toContain('C major');
  const names = p.text.filter(t => /^[A-G]\d$/.test(t.str)).sort((a, b) => a.x - b.x);
  expect(names).toHaveLength(8);
  for (const name of names) {
    const chart = p.paths.filter(q => q.y1 > name.y && Math.abs((q.x1 + q.x2) / 2 - (name.x + name.width / 2)) < 12);
    expect(chart.length, `chart under ${name.str}`).toBeGreaterThan(0);
  }
});

test('V07 Scales: G♭ and F♯ major are both offered; E♭ blues spells its ♭5 as A♮', async ({ page }) => {
  await openState(page, 'scales');
  await page.getByRole('combobox', { name: 'Instrument' }).selectOption('fl');
  const keys = page.getByRole('radiogroup', { name: 'Key', exact: true });
  const key = (name: string) => keys.getByRole('radio', { name, exact: true });
  await expect(key('G♭')).toBeVisible();
  await expect(key('F♯')).toBeVisible();
  await key('G♭').click();
  expect((await page.locator('[data-name]').allTextContents()).slice(0, 8)).toEqual(['G♭4', 'A♭4', 'B♭4', 'C♭5', 'D♭5', 'E♭5', 'F5', 'G♭5']);
  await key('F♯').click();
  expect((await page.locator('[data-name]').allTextContents()).slice(0, 8)).toEqual(['F♯4', 'G♯4', 'A♯4', 'B4', 'C♯5', 'D♯5', 'E♯5', 'F♯5']);

  await page.getByRole('combobox', { name: 'Scale' }).selectOption('blues');
  await key('E♭').click();
  await expect(page.locator('[data-name]')).toHaveText(['E♭4', 'G♭4', 'A♭4', 'A4', 'B♭4', 'D♭5', 'E♭5']);
  await expect(page.locator('[data-note]').nth(3).locator('[data-acc="natural"]')).toHaveCount(1);
});

test('V08 Alternate fingerings: the automatic choice follows the neighbours, a manual choice survives a reload', async ({ page }) => {
  await openState(page, 'sheet-view');
  await mode(page, 'Edit notes');
  const ids = await hitIds(page);
  const panel = page.getByRole('group', { name: 'Edit notes panel' });
  const up = panel.getByRole('button', { name: 'Semitone up', exact: true });
  const announced = (text: string) => page.locator('[aria-live=polite]').filter({ hasText: text });
  const pill = page.getByRole('button', { name: /^⇅ \d+ alternate fingerings for B♭4/ });
  const autoOption = async () => {
    await pill.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await pill.click();
    const dialog = page.getByRole('dialog');
    const name = await dialog.getByRole('button').filter({ hasText: 'auto' }).locator('span').first().textContent();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    return name;
  };

  // The second note of bar 1 (F4) becomes B♭4, which has four fingerings on the alto sax.
  await page.locator(`[data-hit="${ids[2]}"]`).click();
  for (let i = 0; i < 5; i++) await up.click();
  await expect(announced('B♭4, eighth, bar 1')).toBeVisible();
  await expect(pill).toHaveCount(1);
  const alone = await autoOption();
  expect(alone).toBe('1 + 1');

  // Its right neighbour goes up to F♯ (the alto sax's key signature spells it G♭4): the automatic choice moves to the side B♭ key.
  await page.locator(`[data-hit="${ids[3]}"]`).click();
  await up.click();
  await expect(announced('G♭4, quarter, bar 1')).toBeVisible();
  expect(await autoOption()).toBe('side B♭');

  // A manual pick is kept, and kept after a reload.
  await pill.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await pill.click();
  await page.getByRole('dialog').getByRole('button', { name: /^bis key/ }).click();
  await expect(pill).toHaveAttribute('data-overridden', 'true');
  await expect(page.getByText(/· 1 changed by you$/)).toBeVisible();
  await page.reload();
  await expect(pill).toHaveAttribute('data-overridden', 'true');
  await expect(page.getByText(/· 1 changed by you$/)).toBeVisible();
  await pill.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await pill.click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^bis key/ })).toHaveAttribute('aria-pressed', 'true');
});

test('V09 Pages: the four pages open from the footer and the import notice links to the terms', async ({ page }) => {
  await openState(page, 'start-empty');
  const site = page.getByRole('navigation', { name: 'Site' });
  for (const [link, path, heading] of [['About', '/about', 'Why I made fingerscore'], ['Terms', '/terms', 'Terms of Use'],
    ['Privacy', '/privacy', 'Privacy'], ['Imprint', '/imprint', 'Imprint']]) {
    await site.getByRole('link', { name: link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await page.getByRole('banner').getByRole('link').first().click();
    await expect(page).toHaveURL(/\/$/);
  }
  await page.getByTestId('drop-zone').getByRole('link', { name: 'Terms of Use' }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
});

test('V10 No request leaves the origin from the start page through sample, sheet, Download PDF and the four pages', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', r => urls.push(r.url()));
  await openState(page, 'sheet-view');
  const origin = new URL(page.url()).origin;
  const pending = page.waitForEvent('download');
  await fileMenuItem(page, 'Download PDF');
  await pending;
  for (const [link, heading] of [['About', 'Why I made fingerscore'], ['Terms', 'Terms of Use'], ['Privacy', 'Privacy'], ['Imprint', 'Imprint']]) {
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  const paths = urls.map(u => new URL(u).pathname);
  expect(paths.filter(p => p.endsWith('.woff2')).length, 'page font files').toBeGreaterThan(0);
  expect(paths.filter(p => /\/pdf\/fonts\/.*\.ttf$/.test(p)).length, 'PDF font files').toBeGreaterThan(0);
  expect(paths.filter(p => /\/pdf\/sheetPdf\.ts$/.test(p)).length, 'PDF code').toBeGreaterThan(0);
  const foreign = urls.filter(u => !u.startsWith('data:') && new URL(u).origin !== origin);
  expect(foreign).toEqual([]);
});
