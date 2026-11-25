import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { JUMP_TEXT } from '../domain/jumps';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { layoutSheet, markRow, SHEET } from '../render/layout';
import { LIGHT, PaletteProvider } from '../render/palette';
import { SystemView, tieSegments } from '../render/SystemView';
import { mkDoc } from '../test/helpers';
import { unsupported } from './chars';
import { FONT_KEYS, FONT_NAME, setFontMetrics, type FontKey } from './fontMetrics';
import { pageHeightUnits, pageSizeFor, paginate, type Block } from './pageModel';
import { prepareSvg } from './prepareSvg';

const FILE: Record<FontKey, string> = {
  'latin-400': 'latin-400-normal', 'latin-700': 'latin-700-normal', 'latin-700i': 'latin-700-italic',
  'ext-400': 'latin-ext-400-normal', 'ext-700': 'latin-ext-700-normal', 'ext-700i': 'latin-ext-700-italic',
};

beforeAll(() => {
  for (const key of FONT_KEYS) {
    const bytes = readFileSync(`src/pdf/fonts/atkinson-hyperlegible-${FILE[key]}.ttf`);
    setFontMetrics(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  }
});

/** The sample song with `systems` systems (four bars each), the first bar of the second system marked. */
function sheet(bars: number, marked: boolean): Doc {
  const one = sampleDoc('asax');
  const score = Array.from({ length: bars }, (_, i) => ({ ...one.score[i % one.score.length], ev: one.score[i % one.score.length].ev.map(e => ({ ...e, id: `b${i}-${e.id}` })) }));
  if (marked) score[5] = { ...score[5], segno: true, jump: 'dsCoda' };
  return { ...one, score, chords: {}, imported: { lyrics: {}, chords: {} } };
}

const A4 = pageSizeFor('de-DE');
/**
 * The blocks planSheet (src/pdf/sheetPdf.ts, which svg2pdf keeps out of jsdom) gives a sheet: it takes each system's
 * height from the layout; e2e/pdf-content.spec.ts checks the page count of the real PDF against the page model.
 */
const plan = (doc: Doc) => {
  const layout = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
  const blocks: Block[] = [{ kind: 'meta', height: 24 }];
  for (const s of layout.systems) blocks.push({ kind: 'system', height: layout.systemHeight, index: s.index });
  blocks.push({ kind: 'legend', height: 41 });
  return { blocks };
};
const systemBlocks = (doc: Doc) => plan(doc).blocks.filter(b => b.kind === 'system');

describe('the PDF page model with marks', () => {
  it('a sheet without marks gives the blocks of today', () => {
    const blocks = systemBlocks(sheet(16, false));
    expect(blocks).toHaveLength(4);
    expect(blocks.every(b => b.height === SHEET.systemHeight)).toBe(true);
  });

  it('a sheet with marks: every system block is taller by the row', () => {
    const doc = sheet(16, true);
    const blocks = systemBlocks(doc);
    expect(markRow(doc)).toBeGreaterThan(0);
    expect(blocks.every(b => b.height === SHEET.systemHeight + markRow(doc))).toBe(true);
  });

  it('20 systems with marks break between systems; no page is over full and every system is on exactly one page, in order', () => {
    const doc = sheet(80, true);
    const blocks = plan(doc).blocks;
    const height = pageHeightUnits(A4);
    const pages = paginate(blocks, height);
    const placed = pages.flatMap(p => p.flatMap(g => g.blocks)).filter(b => b.kind === 'system').map(b => b.index);
    expect(placed).toEqual(Array.from({ length: 20 }, (_, i) => i));
    for (const page of pages) {
      expect(page.every(g => g.scale === 1), 'no system is shrunk').toBe(true);
      const used = page.reduce((s, g) => s + g.blocks.reduce((t, b) => t + b.height * g.scale, 0), 0);
      expect(used).toBeLessThanOrEqual(height + 1e-6);
    }
    // the taller systems fit fewer to a page than the plain ones
    const per = (d: Doc) => Math.max(...paginate(plan(d).blocks, height).map(p => p.flatMap(g => g.blocks).filter(b => b.kind === 'system').length));
    expect(per(doc)).toBeLessThan(per(sheet(80, false)));
  });
});

describe('the marks in the PDF drawing', () => {
  it('"D.C. al Fine", "D.S. al Coda", "To Coda" and "Fine" are covered by the embedded fonts', () => {
    expect(unsupported([...Object.values(JUMP_TEXT), 'Fine', 'To Coda'])).toEqual([]);
  });

  it('prepared for the PDF: the jump texts are bold italic text, the signs stay outlines', () => {
    const doc = mkDoc([
      { ev: [[67, 48]], segno: true, jump: 'dsCoda' },
      { ev: [[67, 48]], coda: true, fine: true },
      { ev: [[67, 48]], toCoda: true },
    ]);
    const d = derive(doc, DEFAULT_PREFS);
    const layout = layoutSheet(doc, d);
    const { container } = render(
      <PaletteProvider value={LIGHT}>
        <SystemView doc={doc} derived={d} system={layout.systems[0]} beams={layout.beams} tuplets={layout.tuplets}
          ties={tieSegments(d, layout)[0]} playingId={null} selectedId={null} lastSystem />
      </PaletteProvider>,
    );
    const svg = container.querySelector('svg')! as unknown as SVGSVGElement;
    prepareSvg(svg);
    const texts = (kind: string) => Array.from(svg.querySelectorAll(`[data-jump="${kind}"] text, text[data-jump="${kind}"]`));
    expect(texts('jump').map(t => t.textContent)).toEqual(['D.S. al Coda']);
    expect(texts('fine').map(t => t.textContent)).toEqual(['Fine']);
    expect(texts('toCoda').map(t => t.textContent).join('')).toBe('To Coda');
    for (const t of [...texts('jump'), ...texts('fine'), ...texts('toCoda')]) expect(t.getAttribute('font-family')).toBe(FONT_NAME['latin-700i']);
    expect(svg.querySelectorAll('[data-jump="segno"] path, path[data-jump="segno"]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-jump="coda"] path, path[data-jump="coda"]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-jump="toCoda"] path')).toHaveLength(1);
    for (const e of svg.querySelectorAll('[data-jump]')) expect(e.closest('[fill="transparent"]')).toBeNull();
    // nothing of the drawing keeps a CSS variable: the PDF reads colours from the SVG
    expect(svg.outerHTML).not.toContain('var(--');
  });
});
