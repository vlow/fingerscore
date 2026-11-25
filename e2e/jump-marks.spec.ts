import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** Where the pictures for looking at go; they are written only when JUMPS_OUT is set. */
const OUT = process.env.JUMPS_OUT;
const LIGHT_INK = 'rgb(21, 23, 28)';
const KINDS = ['coda', 'fine', 'jump', 'segno', 'toCoda'];

async function openMarks(page: Page, file = 'e2e/fixtures/jumps.abc') {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/sheet$/);
  await expect(page.getByTestId('system').first()).toBeVisible();
}

const kindsDrawn = (page: Page) =>
  page.locator('[data-jump]').evaluateAll(els => Array.from(new Set(els.map(e => e.getAttribute('data-jump')))).sort());

/** Every drawn mark of the sheet: its kind, whether it is painted, its box and the system's. */
const marksOnScreen = (page: Page) => page.locator('[data-jump]').evaluateAll(els => els.map(e => {
  const r = e.getBoundingClientRect();
  const s = e.closest('svg')!.getBoundingClientRect();
  const first = e.matches('text, path') ? e : e.querySelector('text, path')!;
  const cs = getComputedStyle(first);
  return { kind: e.getAttribute('data-jump'), systemHeight: s.height, display: cs.display, visibility: cs.visibility, fill: cs.fill, w: r.width, h: r.height, top: r.top - s.top, bottom: r.bottom - s.top, left: r.left - s.left, right: r.right - s.left, width: s.width };
}));

test('the marks are drawn on the sheet, taller systems all alike', async ({ page }) => {
  await openMarks(page);
  expect(await kindsDrawn(page)).toEqual(KINDS);
  const heights = await page.getByTestId('system').evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(1);
  expect(new Set(heights).size).toBe(1);
  expect(heights[0], 'a sheet with no chords, lyrics or endings: 15 px of headroom, 30 px of marks, 215 px from the staff down').toBe(260);
  for (const m of await marksOnScreen(page)) {
    expect(m.w, m.kind!).toBeGreaterThan(5);
    expect(m.top, `${m.kind} is inside the system`).toBeGreaterThanOrEqual(0);
    expect(m.bottom, `${m.kind} is above the staff`).toBeLessThan(m.systemHeight - 215);
    expect(m.right).toBeLessThanOrEqual(m.width);
  }
});

test('the pill and the popover of an alternate fingering follow the taller system', async ({ page }) => {
  /** Offsets of the first pill and its popover from the top of the first system, and the system's height. */
  const offsets = async (file: string) => {
    await openMarks(page, file);
    const pill = page.locator('[aria-haspopup="dialog"]').first();
    await expect(pill).toBeVisible();
    await pill.click();
    const popover = page.getByRole('dialog', { name: /Alternate fingerings/ });
    await expect(popover).toBeVisible();
    const [s, p, d] = await Promise.all([page.getByTestId('system').first().boundingBox(), pill.boundingBox(), popover.boundingBox()]);
    return { pill: p!.y - s!.y, popover: d!.y - s!.y, height: s!.height };
  };
  const plain = await offsets('e2e/fixtures/jumps-plain.abc');
  const marked = await offsets('e2e/fixtures/jumps.abc');
  expect(marked.height - plain.height).toBe(30);
  expect(marked.pill - plain.pill).toBeCloseTo(30, 0);
  expect(marked.popover - plain.popover).toBeCloseTo(30, 0);
});

test('crowded bars: in a narrow bar (Coda, Fine) and in a bar with an ending, a triplet and a chord, no mark touches another mark, a chord, a lyric, an ending, a triplet mark or the clef, or leaves its system', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1300, height: 1500 });
  await openMarks(page, 'e2e/fixtures/crowded.abc');
  const found = await page.evaluate(clefPath => {
    const rect = (e: Element) => { const r = e.getBoundingClientRect(); return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom }; };
    const out: { system: number; marks: { kind: string; r: ReturnType<typeof rect> }[]; others: { what: string; r: ReturnType<typeof rect> }[]; box: ReturnType<typeof rect> }[] = [];
    document.querySelectorAll('svg[data-testid="system"]').forEach((svg, system) => {
      const others: { what: string; r: ReturnType<typeof rect> }[] = [];
      for (const [what, sel] of [['chord', '[data-chord]'], ['lyric', '[data-lyric]'], ['volta', '[data-volta]'], ['tuplet', '[data-tuplet]'], ['clef', `path[d="${clefPath}"]`]] as const) {
        svg.querySelectorAll(sel).forEach(e => others.push({ what, r: rect(e) }));
      }
      out.push({ system, box: rect(svg), others, marks: Array.from(svg.querySelectorAll('[data-jump]')).map(e => ({ kind: e.getAttribute('data-jump')!, r: rect(e) })) });
    });
    return out;
  }, (JSON.parse(readFileSync('src/data/glyphs.json', 'utf8')) as { paths: Record<string, string> }).paths.trebleClef);
  const crowded = found.filter(f => f.marks.length > 0);
  expect(crowded).toHaveLength(1);
  const [{ marks, others, box }] = crowded;
  expect(marks.map(m => m.kind).sort()).toEqual(['coda', 'fine', 'jump', 'segno', 'toCoda']);
  for (const what of ['chord', 'lyric', 'volta', 'tuplet', 'clef']) expect(others.some(o => o.what === what), `the system has a ${what}`).toBe(true);
  type R = { x1: number; y1: number; x2: number; y2: number };
  const meets = (a: R, b: R) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  marks.forEach((m, i) => {
    expect(m.r.x1, `${m.kind} inside the system`).toBeGreaterThanOrEqual(box.x1);
    expect(m.r.x2).toBeLessThanOrEqual(box.x2);
    expect(m.r.y1).toBeGreaterThanOrEqual(box.y1);
    expect(m.r.y2).toBeLessThanOrEqual(box.y2);
    for (const o of others) expect(meets(m.r, o.r), `${m.kind} meets a ${o.what}`).toBe(false);
    marks.slice(i + 1).forEach(n => expect(meets(m.r, n.r), `${m.kind} meets ${n.kind}`).toBe(false));
  });
  await page.getByTestId('system').nth(crowded[0].system).screenshot({ path: testInfo.outputPath('crowded-bar.png') });
  if (OUT) { mkdirSync(OUT, { recursive: true }); await page.getByTestId('system').nth(crowded[0].system).screenshot({ path: join(OUT, 'crowded-bar.png') }); }
});

/** The marks stand in the row at the top of the system whatever else the sheet draws; a high note makes the headroom grow, so nothing the notes draw reaches the row. */
const ALL = ['coda', 'fine', 'jump', 'segno', 'toCoda'];
for (const [file, note, kinds, needs] of [
  ['crowded-bare.abc', 'the highest note stands on ledger lines', ALL, ['volta', 'tuplet', 'note']],
  ['crowded-high.abc', 'the highest note is one step higher', ALL, ['volta', 'tuplet', 'note']],
  ['crowded-beam.abc', 'a stem-up beamed group under the Segno has a beam high above its heads', ['fine', 'jump', 'segno'], ['beam', 'stem', 'note']],
] as const) test(`a sheet without chords and lyrics, ${note}: the marks stand in the top row and touch no ending, triplet mark, note, stem, beam or tie`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1300, height: 1500 });
  await openMarks(page, `e2e/fixtures/${file}`);
  const found = await page.evaluate(() => {
    const rect = (e: Element) => { const r = e.getBoundingClientRect(); return { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom }; };
    return Array.from(document.querySelectorAll('svg[data-testid="system"]')).map(svg => {
      const all = (sel: string, what: string) => Array.from(svg.querySelectorAll(sel)).map(e => ({ what, r: rect(e) }));
      return {
        box: rect(svg),
        marks: Array.from(svg.querySelectorAll('[data-jump]')).filter(e => !e.parentElement?.closest('[data-jump]')).map(e => ({ kind: e.getAttribute('data-jump')!, r: rect(e) })),
        others: [...all('[data-volta]', 'volta'), ...all('[data-tuplet]', 'tuplet'), ...all('[data-ev]', 'note'), ...all('[data-stem]', 'stem'), ...all('[data-beam]', 'beam'), ...all('[data-tie]', 'tie'), ...all('[data-chord], [data-lyric]', 'chord or lyric')],
      };
    });
  });
  const crowded = found.filter(f => f.marks.length > 0);
  expect(crowded).toHaveLength(1);
  const [{ marks, others, box }] = crowded;
  expect(marks.map(m => m.kind).sort()).toEqual([...kinds]);
  for (const what of needs) expect(others.some(o => o.what === what), `the system has a ${what}`).toBe(true);
  expect(others.some(o => o.what === 'chord or lyric')).toBe(false);
  type R = { x1: number; y1: number; x2: number; y2: number };
  const meets = (a: R, b: R) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  // marks 30 + endings 14 + the minimum headroom 15 + 215 below the staff top: the high notes make it taller
  expect(box.y2 - box.y1, 'the headroom grew for the high notes').toBeGreaterThan(30 + 14 + 15 + 215);
  const row = box.y1 + 30;
  expect(Math.max(...marks.map(m => m.r.y2)), 'the marks stand in the row').toBeLessThanOrEqual(row);
  for (const o of others) expect(o.r.y1, `a ${o.what} stays below the row`).toBeGreaterThanOrEqual(row - 0.5);
  marks.forEach((m, i) => {
    expect(m.r.y1).toBeGreaterThanOrEqual(box.y1);
    expect(m.r.x1).toBeGreaterThanOrEqual(box.x1);
    expect(m.r.x2).toBeLessThanOrEqual(box.x2);
    for (const o of others) expect(meets(m.r, o.r), `${m.kind} meets a ${o.what}`).toBe(false);
    marks.slice(i + 1).forEach(n => expect(meets(m.r, n.r), `${m.kind} meets ${n.kind}`).toBe(false));
  });
  await page.getByTestId('system').nth(0).screenshot({ path: testInfo.outputPath(`row-without-chords-${file}.png`) });
});

test('print shows the marks, in the light ink, and prints the same drawing', async ({ page }) => {
  await openMarks(page);
  const before = await marksOnScreen(page);
  await page.emulateMedia({ media: 'print' });
  const printed = await marksOnScreen(page);
  expect(printed.map(m => m.kind)).toEqual(before.map(m => m.kind));
  for (const m of printed) {
    expect(m.display).not.toBe('none');
    expect(m.visibility).toBe('visible');
    expect(m.w).toBeGreaterThan(5);
    expect(m.fill).toBe(LIGHT_INK);
  }
});

test('on a dark paper the marks take the paper\'s ink, not the light one', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openMarks(page);
  const fills = (await marksOnScreen(page)).map(m => m.fill);
  expect(fills.length).toBeGreaterThan(4);
  expect(fills.every(f => f !== LIGHT_INK)).toBe(true);
  expect(new Set(fills).size).toBe(1);
});

test.describe('pictures (set JUMPS_OUT to run)', () => {
  test.skip(!OUT, 'JUMPS_OUT is not set');
  test.use({ deviceScaleFactor: 2 });

  test('the row of a bar with chords and lyrics, of a bar without, and over a stem-up beamed group', async ({ page }) => {
    mkdirSync(OUT!, { recursive: true });
    await page.setViewportSize({ width: 1300, height: 1500 });
    await page.emulateMedia({ colorScheme: 'light' });
    for (const [file, name] of [['crowded.abc', 'row-with-chords.png'], ['crowded-bare.abc', 'row-without-chords.png'], ['crowded-beam.abc', 'row-beam-group.png']]) {
      await openMarks(page, `e2e/fixtures/${file}`);
      const marked = page.getByTestId('system').filter({ has: page.locator('[data-jump]') }).first();
      await marked.screenshot({ path: join(OUT!, name) });
    }
  });

  test('the sheet on the light paper and on Night, Dimmed and Sepia', async ({ page }) => {
    mkdirSync(OUT!, { recursive: true });
    await page.setViewportSize({ width: 1300, height: 1500 });
    await page.emulateMedia({ colorScheme: 'light' });
    await openMarks(page);
    await page.getByTestId('paper').screenshot({ path: join(OUT!, 'sheet-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const choice of ['Night', 'Dimmed', 'Sepia'] as const) {
      await page.getByRole('radiogroup', { name: 'Paper' }).getByRole('radio', { name: choice }).click();
      await page.getByTestId('paper').screenshot({ path: join(OUT!, `sheet-${choice.toLowerCase()}.png`) });
    }
  });
});
