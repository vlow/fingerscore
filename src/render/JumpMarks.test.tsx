import { render } from '@testing-library/react';
import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { JUMP_TEXT } from '../domain/jumps';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { mkDoc, type BarSpec } from '../test/helpers';
import { layoutSheet, markRow, SHEET } from './layout';
import { TEXT_EM_PER_CHAR } from './lyrics';
import { LIGHT, PaletteProvider, SCREEN } from './palette';
import { Paper } from './Paper';
import { pathBox, placedBox, type Box } from './pathBox';

const Q = (m = 67): [number, number] => [m, 12];
const bar = (extra: Partial<BarSpec> = {}): BarSpec => ({ ev: [Q(), Q(69), Q(71), Q(72)], ...extra });

function draw(doc: Doc, palette = SCREEN) {
  const d = derive(doc, DEFAULT_PREFS);
  const layout = layoutSheet(doc, d);
  const view = render(
    <PaletteProvider value={palette}><Paper doc={doc} derived={d} layout={layout} playingId={null} selectedId={null} /></PaletteProvider>,
  );
  return { ...view, layout };
}

const num = (el: Element, name: string) => Number(el.getAttribute(name));
const shiftOf = (svg: Element) => {
  const g = Array.from(svg.children).find(c => c.localName === 'g' && c.getAttribute('transform')?.startsWith('translate(0 '));
  return g ? Number(/translate\(0 ([\d.]+)\)/.exec(g.getAttribute('transform')!)![1]) : 0;
};

/** Ink box of one drawn mark element, in the system's coordinates: text by the estimated advance, path by its outline. */
function boxOfText(t: Element): Box {
  const fs = num(t, 'font-size');
  const w = (t.textContent ?? '').length * TEXT_EM_PER_CHAR * fs;
  const x = num(t, 'x');
  const anchor = t.getAttribute('text-anchor');
  const x1 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  const y = num(t, 'y');
  return { x1, x2: x1 + w, y1: y - 0.75 * fs, y2: y + 0.25 * fs };
}
function boxOfGlyph(p: Element): Box {
  const m = /^translate\(([-\d.]+), ([-\d.]+)\) scale\(([-\d.]+), -([-\d.]+)\)$/.exec(p.getAttribute('transform')!)!;
  return placedBox(p.getAttribute('d')!, Number(m[1]), Number(m[2]), Number(m[3]));
}
const union = (bs: Box[]): Box => ({ x1: Math.min(...bs.map(b => b.x1)), x2: Math.max(...bs.map(b => b.x2)), y1: Math.min(...bs.map(b => b.y1)), y2: Math.max(...bs.map(b => b.y2)) });
const inkOf = (el: Element): Box => union([
  ...(el.matches('text') ? [boxOfText(el)] : Array.from(el.querySelectorAll('text')).map(boxOfText)),
  ...(el.matches('path') ? [boxOfGlyph(el)] : Array.from(el.querySelectorAll('path')).map(boxOfGlyph)),
]);
const marks = (c: Element, kind: string) => Array.from(c.querySelectorAll(`[data-jump="${kind}"]`));

describe('jump marks on the sheet', () => {
  it('a sheet without marks draws none and has no shifted group', () => {
    const { container } = draw(mkDoc([bar(), bar()]));
    expect(container.querySelectorAll('[data-jump]')).toHaveLength(0);
    expect(shiftOf(container.querySelector('svg[data-testid="system"]')!)).toBe(0);
  });

  it('Segno and Coda stand at the left edge of their bar, as outlines', () => {
    const { container, layout } = draw(mkDoc([bar(), bar({ segno: true }), bar({ coda: true }), bar()]));
    const [b0, b1, b2] = layout.systems[0].bars;
    expect(marks(container, 'segno')).toHaveLength(1);
    expect(marks(container, 'coda')).toHaveLength(1);
    const segno = inkOf(marks(container, 'segno')[0]);
    const coda = inkOf(marks(container, 'coda')[0]);
    expect(segno.x1).toBeGreaterThanOrEqual(b1.x); expect(segno.x1).toBeLessThanOrEqual(b1.x + 6);
    expect(coda.x1).toBeGreaterThanOrEqual(b2.x); expect(coda.x1).toBeLessThanOrEqual(b2.x + 6);
    expect(b0.x).toBeLessThan(b1.x);
    expect(marks(container, 'segno')[0].matches('path') || marks(container, 'segno')[0].querySelector('path')).toBeTruthy();
    expect(container.querySelectorAll('[data-jump] text')).toHaveLength(0);
  });

  it('Fine, To Coda with its sign and the jump text stand right-aligned at the right edge of their bar, bold italic', () => {
    const doc = mkDoc([bar({ fine: true }), bar({ toCoda: true }), bar({ jump: 'dsCoda' }), bar()]);
    const { container, layout } = draw(doc);
    const [b0, b1, b2] = layout.systems[0].bars;
    const texts = [['fine', 'Fine', b0], ['toCoda', 'To Coda', b1], ['jump', JUMP_TEXT.dsCoda, b2]] as const;
    for (const [kind, text, b] of texts) {
      const el = marks(container, kind)[0];
      const t = el.matches('text') ? el : el.querySelector('text')!;
      expect(t.textContent).toBe(text);
      expect(t.getAttribute('font-weight')).toBe('700');
      expect(t.getAttribute('font-style')).toBe('italic');
      const ink = inkOf(el);
      expect(ink.x2).toBeLessThanOrEqual(b.x + b.width);
      expect(ink.x2).toBeGreaterThanOrEqual(b.x + b.width - 8);
      expect(ink.x1).toBeGreaterThan(b.x);
    }
    // To Coda: the text, then the Coda sign at the right edge
    const toCoda = marks(container, 'toCoda')[0];
    expect(toCoda.querySelectorAll('path')).toHaveLength(1);
    expect(inkOf(toCoda.querySelector('path')!).x1).toBeGreaterThan(boxOfText(toCoda.querySelector('text')!).x2 - 2);
  });

  it('draws every jump text of the model', () => {
    const jumps = Object.keys(JUMP_TEXT) as (keyof typeof JUMP_TEXT)[];
    const { container } = draw(mkDoc(jumps.map(j => bar({ jump: j }))));
    expect(marks(container, 'jump').map(e => e.textContent)).toEqual(jumps.map(j => JUMP_TEXT[j]));
  });

  it('the row is above the band: staff, chords, lyrics, endings and triplets move down by the row, nothing else changes', () => {
    const plain = draw(mkDoc([bar(), bar()]));
    const doc = mkDoc([bar(), bar({ segno: true })]);
    const { container } = draw(doc);
    const row = markRow(doc);
    const svg = container.querySelector('svg[data-testid="system"]')!;
    expect(row).toBeGreaterThan(0);
    expect(shiftOf(svg)).toBe(row);
    expect(num(svg, 'height')).toBe(SHEET.systemHeight + row);
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${SHEET.systemWidth} ${SHEET.systemHeight + row}`);
    expect((svg.parentElement as HTMLElement).style.height).toBe(`${SHEET.systemHeight + row}px`);
    expect(plain.container.querySelector('svg[data-testid="system"]')!.getAttribute('height')).toBe(String(SHEET.systemHeight));
    // the shifted group holds the staff and the bands; the marks stand outside it
    const g = Array.from(svg.children).find(c => c.getAttribute('transform') === `translate(0 ${row})`)!;
    expect(g.querySelector('[data-bar]')).not.toBeNull();
    expect(g.querySelector('[data-jump]')).toBeNull();
    expect(svg.querySelector('[data-jump]')!.closest('g[transform]')).toBeNull();
  });

  it('the marks overlap no ending bracket, triplet mark, chord symbol or lyric', () => {
    const tripletBar: BarSpec = { ev: [[67, 4], [69, 4], [71, 4], [72, 12], [74, 12], [76, 12]], volta: '1', segno: true, fine: true, toCoda: true, jump: 'dsCoda' };
    const doc = mkDoc([bar({ rs: true }), tripletBar, bar({ volta: '2', coda: true })]);
    const ids = doc.score.flatMap(b => b.ev.map(e => e.id));
    doc.score[1].ev[0].l = 'one';
    doc.score[1].ev[4].l = 'two';
    doc.chords[ids[4]] = parseChord('Am7', 0);
    doc.chords[ids[8]] = parseChord('G7', 0);
    const { container } = draw(doc);
    const svg = container.querySelector('svg[data-testid="system"]')!;
    const shift = shiftOf(svg);
    const drawn = Array.from(container.querySelectorAll('[data-jump]')).filter(e => !e.parentElement?.closest('[data-jump]'));
    expect(drawn.map(e => e.getAttribute('data-jump')).sort()).toEqual(['coda', 'fine', 'jump', 'segno', 'toCoda']);
    const markBoxes = drawn.map(inkOf);
    const others: Box[] = [];
    for (const t of container.querySelectorAll('[data-chord], [data-lyric]')) others.push(boxOfText(t));
    for (const v of container.querySelectorAll('[data-volta]')) for (const p of v.querySelectorAll('path')) others.push(pathBox(p.getAttribute('d')!));
    for (const m of container.querySelectorAll('[data-tuplet]')) {
      const t = m.querySelector('text')!;
      others.push({ x1: num(t, 'x') - 5, x2: num(t, 'x') + 5, y1: num(t, 'y') - 9, y2: num(t, 'y') });
      for (const p of m.querySelectorAll('[data-tuplet-bracket]')) others.push(pathBox(p.getAttribute('d')!));
    }
    expect(container.querySelectorAll('[data-chord]').length).toBe(2);
    expect(container.querySelectorAll('[data-lyric]').length).toBe(2);
    expect(container.querySelectorAll('[data-volta]').length).toBe(2);
    expect(container.querySelectorAll('[data-tuplet]').length).toBe(1);
    for (const m of markBoxes) {
      expect(m.y1).toBeGreaterThanOrEqual(0);
      for (const o of others) expect(m.y2, 'a mark ends above the band').toBeLessThan(o.y1 + shift);
    }
    // the marks of one bar do not touch each other
    const rights = markBoxes.slice().sort((a, b) => a.x1 - b.x1);
    for (let i = 1; i < rights.length; i++) expect(rights[i].x1).toBeGreaterThanOrEqual(rights[i - 1].x2);
  });

  it('a long text in a short bar stays inside the system', () => {
    const doc = mkDoc([0, 1, 2, 3].map(() => ({ ev: [Q(), Q(69)] as [number, number][] })), [2, 4]);
    doc.score[3] = { ...doc.score[3], jump: 'dsCoda' };
    doc.score[0] = { ...doc.score[0], toCoda: true };
    const { container, layout } = draw(doc);
    const system = layout.systems[0];
    const last = system.bars[system.bars.length - 1];
    const ink = inkOf(marks(container, 'jump')[0]);
    expect(ink.x2).toBeLessThanOrEqual(SHEET.systemWidth);
    expect(ink.x1).toBeGreaterThanOrEqual(last.x);
    const toCoda = inkOf(marks(container, 'toCoda')[0]);
    expect(toCoda.x1).toBeGreaterThanOrEqual(system.bars[0].x);
    expect(toCoda.x2).toBeLessThanOrEqual(system.bars[0].x + system.bars[0].width);
  });

  it('takes its colours from the palette: the screen variables, and the light colours for the PDF', () => {
    const doc = mkDoc([bar({ segno: true, jump: 'dc' }), bar({ toCoda: true, coda: true })]);
    const fills = (c: Element) => Array.from(c.querySelectorAll('[data-jump]')).flatMap(e => [e, ...Array.from(e.querySelectorAll('*'))])
      .map(e => e.getAttribute('fill')).filter((f): f is string => f !== null);
    const screen = fills(draw(doc).container);
    expect(screen.length).toBeGreaterThan(3);
    expect(new Set(screen)).toEqual(new Set([SCREEN.ink]));
    const light = fills(draw(doc, LIGHT).container);
    expect(new Set(light)).toEqual(new Set([LIGHT.ink]));
  });

  it('is not hidden by the print rules for playback marks: no data-mark, no data-print-hide', () => {
    const { container } = draw(mkDoc([bar({ segno: true, jump: 'dc' })]));
    for (const e of container.querySelectorAll('[data-jump]')) {
      expect(e.closest('[data-mark], [data-print-hide]')).toBeNull();
      expect(e.matches('[data-mark]')).toBe(false);
    }
  });

  it('play mode draws the marks too', () => {
    const doc = mkDoc([bar({ segno: true }), bar({ jump: 'dsFine' })]);
    const d = derive(doc, DEFAULT_PREFS);
    const { container } = render(<Paper doc={doc} derived={d} layout={layoutSheet(doc, d)} playingId={null} readOnly />);
    expect(container.querySelectorAll('[data-jump]').length).toBeGreaterThan(1);
  });
});
