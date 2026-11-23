import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readPdf, renderPdfPage } from './readPdf';

/** PDF points per millimetre, and per unit of the 860-unit system that fills the 186 mm between the margins. */
const MM = 72 / 25.4;
const UNIT = (186 * MM) / 860;
const MARGIN = 12 * MM;
/** Where the images for looking at go; PDF_SPIKE_OUT overrides it. */
const OUT = process.env.PDF_SPIKE_OUT ?? 'test-results/pdf-spike';

interface SpikeModule {
  spikePdf(): Promise<{ pdf: number[]; markup: string; flatWidth: number }>;
  probePdf(overflowVisible: boolean): Promise<number[]>;
}

/** Calls a function of src/pdf/spike.ts through the dev-only hook of src/main.tsx, which loads it on demand. */
function spike<K extends keyof SpikeModule>(page: Page, name: K, ...args: Parameters<SpikeModule[K]>): ReturnType<SpikeModule[K]> {
  return page.evaluate(async ([fn, params]) => {
    const load = (window as unknown as { fingerscorePdfSpike?: () => Promise<Record<string, (...a: unknown[]) => unknown>> }).fingerscorePdfSpike;
    if (!load) throw new Error('no PDF spike hook on this page');
    return (await load())[fn](...params);
  }, [name, args] as const) as ReturnType<SpikeModule[K]>;
}

test('one system of the sample song becomes an A4 page with the embedded font, B♭m7, a squeezed lyric and a triplet', async ({ page }) => {
  await page.goto('/');
  const result = await spike(page, 'spikePdf');
  const { pages, fonts } = await readPdf(new Uint8Array(result.pdf));

  expect(pages).toHaveLength(1);
  const [p] = pages;
  expect(p.width / MM).toBeCloseTo(210, 1);
  expect(p.height / MM).toBeCloseTo(297, 1);
  expect(fonts.some(f => f.includes('Atkinson'))).toBe(true);

  // "B♭m7": B and m7 on one baseline, the flat's width between them and nothing else.
  const b = p.text.find(t => t.str === 'B');
  const m7 = p.text.find(t => t.str === 'm7');
  expect(b).toBeDefined();
  expect(m7).toBeDefined();
  expect(Math.abs(b!.y - m7!.y)).toBeLessThan(0.01);
  const gap = (m7!.x - (b!.x + b!.width)) / UNIT;
  expect(Math.abs(gap - result.flatWidth)).toBeLessThanOrEqual(1);

  // The lyric syllables, the squeezed "everyone" among them.
  const strs = p.text.map(t => t.str);
  for (const syllable of ['The', 'wat-', 'everyone', 'is', 'tri', 'o', 'let']) expect(strs).toContain(syllable);

  for (const t of p.text) {
    expect(t.x).toBeGreaterThanOrEqual(MARGIN - 0.01);
    expect(t.x + t.width).toBeLessThanOrEqual(p.width - MARGIN + 0.01);
    expect(t.y).toBeGreaterThanOrEqual(MARGIN);
    expect(t.y).toBeLessThanOrEqual(p.height - MARGIN);
  }
});

test.describe('images for review', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the PDF, its page and the feature probe as PNGs, and the same system on screen are written for review', async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto('/');
    const result = await spike(page, 'spikePdf');
    writeFileSync(join(OUT, 'spike.pdf'), new Uint8Array(result.pdf));
    writeFileSync(join(OUT, 'spike-pdf.png'), await renderPdfPage(new Uint8Array(result.pdf), 1, 150));
    for (const visible of [false, true]) {
      const probe = await spike(page, 'probePdf', visible);
      const name = visible ? 'spike-probe-overflow' : 'spike-probe';
      writeFileSync(join(OUT, `${name}.pdf`), new Uint8Array(probe));
      writeFileSync(join(OUT, `${name}.png`), await renderPdfPage(new Uint8Array(probe), 1, 150));
    }

    await page.evaluate(markup => {
      const host = document.createElement('div');
      host.id = 'spike-screen';
      host.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#fff;padding:20px;';
      host.innerHTML = markup;
      document.body.appendChild(host);
    }, result.markup);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#spike-screen svg').screenshot({ path: join(OUT, 'spike-screen.png') });
  });
});
