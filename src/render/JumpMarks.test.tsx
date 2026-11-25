import { readFileSync } from 'node:fs';
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { JUMP_TEXT } from '../domain/jumps';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { mkDoc, type BarSpec } from '../test/helpers';
import { layoutSheet, MARK_DROP, MARK_ROW, markDrop, markRow, SHEET } from './layout';
import { planMarks, resetMarkFace, useMarkFace } from './JumpMarks';
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

  it('a sheet that draws no chord and no lyric lowers the marks by 44 px, into the empty bands; the row and the system stay as they are', () => {
    const marked = (): Doc => mkDoc([bar({ segno: true }), bar({ toCoda: true, fine: true, jump: 'dc' })]);
    /** Baseline of the first text and bottom of the first sign, in the system's coordinates. */
    const inkTop = (doc: Doc) => {
      const { container } = draw(doc);
      const svg = container.querySelector('svg[data-testid="system"]')!;
      const boxes = Array.from(container.querySelectorAll('[data-jump]')).filter(e => !e.parentElement?.closest('[data-jump]')).map(inkOf);
      return { top: Math.min(...boxes.map(b => b.y1)), bottom: Math.max(...boxes.map(b => b.y2)), height: num(svg, 'height'), shift: shiftOf(svg) };
    };
    const base = inkTop(marked());                                    // nothing to draw in the bands: lowered
    const withChord = marked();
    withChord.chords[withChord.score[0].ev[1].id] = parseChord('Am7', 0);
    const withLyric = marked();
    withLyric.score[1].ev[0].l = 'one';
    const chordHidden = marked();
    chordHidden.chords[chordHidden.score[0].ev[1].id] = parseChord('Am7', 0);
    chordHidden.show = { ...chordHidden.show, chords: false };
    const bothOff = marked();
    bothOff.chords[bothOff.score[0].ev[1].id] = parseChord('Am7', 0);
    bothOff.score[1].ev[0].l = 'one';
    bothOff.show = { ...bothOff.show, chords: false, lyrics: false };
    const lyricOnRest = marked();
    lyricOnRest.score[0].ev[0] = { ...lyricOnRest.score[0].ev[0], r: true, l: 'x' };

    const up = inkTop(withChord);
    expect(base.top - up.top).toBeCloseTo(MARK_DROP, 6);
    expect(base.bottom - up.bottom).toBeCloseTo(MARK_DROP, 6);
    expect(up.bottom).toBeLessThanOrEqual(MARK_ROW);           // the row of 30 px, as before
    expect(inkTop(withLyric).top).toBeCloseTo(up.top, 6);
    for (const lowered of [chordHidden, bothOff, lyricOnRest]) expect(inkTop(lowered).top).toBeCloseTo(base.top, 6);
    expect(base.height).toBe(up.height);
    expect(base.height).toBe(SHEET.systemHeight + markRow(marked()));
    expect(base.shift).toBe(up.shift);
    // about 30 px above the staff instead of about 75 (the staff starts at the row plus staffTop)
    expect(base.shift + SHEET.staffTop - base.bottom).toBeGreaterThan(25);
    expect(base.shift + SHEET.staffTop - base.bottom).toBeLessThan(40);
    expect(up.shift + SHEET.staffTop - up.bottom).toBeGreaterThan(70);
  });

  it('markDrop reads the same flags as the renderer: a chord needs show.chords, a lyric needs show.lyrics and a note', () => {
    const doc = mkDoc([bar()]);
    const events = () => derive(doc, DEFAULT_PREFS).events;
    expect(markDrop(events(), doc.show)).toBe(MARK_DROP);
    doc.chords[doc.score[0].ev[0].id] = parseChord('C', 0);
    expect(markDrop(events(), doc.show)).toBe(0);
    expect(markDrop(events(), { ...doc.show, chords: false })).toBe(MARK_DROP);
    doc.score[0].ev[1].l = 'la';
    expect(markDrop(events(), { ...doc.show, chords: false })).toBe(0);
    expect(markDrop(events(), { ...doc.show, chords: false, lyrics: false })).toBe(MARK_DROP);
  });

  it('the highest note decides for the sheet: a head just below the lowered row lowers the marks, one that reaches the row keeps the top row', () => {
    const at = (midi: number, accidental = false) => {
      const doc = mkDoc([bar({ segno: true, jump: 'dc' }), { ev: [[midi, 12], [60, 12], [60, 12], [60, 12]] }]);
      const events = derive(doc, DEFAULT_PREFS).events;
      const top = events.find(e => !e.rest && e.pos === Math.max(...events.map(x => x.pos)))!;
      const out = draw(doc);
      const text = out.container.querySelector('text[data-jump="jump"]')!;
      return { drop: markDrop(events, doc.show), y: num(text, 'y'), pos: top.pos, acc: !!top.accidental && accidental };
    };
    const c6 = at(84);
    const d6 = at(86);
    expect(c6.pos).toBe(12);
    expect(d6.pos).toBe(13);
    expect(c6.drop).toBe(MARK_DROP);
    expect(d6.drop).toBe(0);
    expect(c6.y - d6.y).toBe(MARK_DROP);
    // the layout's own numbers: a head at C6 has its top at row + staffBottom - 5 * 12 - 5 = 80, and the lowered row
    // plus margin ends at 30 + 44 + 4 = 78; at D6 the top is at 75
    expect(MARK_ROW + SHEET.staffBottom - 5 * c6.pos - 5).toBeGreaterThan(MARK_ROW + MARK_DROP + 4);
    expect(MARK_ROW + SHEET.staffBottom - 5 * d6.pos - 5).toBeLessThanOrEqual(MARK_ROW + MARK_DROP + 4);
    // an accidental rises 10 px above its note, so C#6 (still position 12) keeps the top row
    expect(at(85).drop).toBe(0);
  });

  it('lowered marks overlap no ending bracket, triplet mark or note, also with high notes on ledger lines', () => {
    const high: BarSpec = { ev: [[81, 12], [84, 12], [83, 12], [84, 12]], rs: true, segno: true };
    const tripletBar: BarSpec = { ev: [[84, 4], [82, 4], [83, 4], [72, 12], [74, 12], [76, 12]], volta: '1', fine: true, toCoda: true, jump: 'dsCoda' };
    const doc = mkDoc([high, tripletBar, bar({ volta: '2', coda: true })]);
    const { container, layout } = draw(doc);
    const svg = container.querySelector('svg[data-testid="system"]')!;
    const shift = shiftOf(svg);
    expect(container.querySelectorAll('[data-chord], [data-lyric]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-volta]').length).toBe(2);
    expect(container.querySelectorAll('[data-tuplet]').length).toBe(1);
    const drawn = Array.from(container.querySelectorAll('[data-jump]')).filter(e => !e.parentElement?.closest('[data-jump]'));
    expect(drawn.map(e => e.getAttribute('data-jump')).sort()).toEqual(['coda', 'fine', 'jump', 'segno', 'toCoda']);
    const others: Box[] = [];
    for (const v of container.querySelectorAll('[data-volta]')) for (const p of v.querySelectorAll('path')) others.push(pathBox(p.getAttribute('d')!));
    for (const m of container.querySelectorAll('[data-tuplet]')) {
      const t = m.querySelector('text')!;
      others.push({ x1: num(t, 'x') - 5, x2: num(t, 'x') + 5, y1: num(t, 'y') - 9, y2: num(t, 'y') });
      for (const p of m.querySelectorAll('[data-tuplet-bracket]')) others.push(pathBox(p.getAttribute('d')!));
    }
    // the notes (up to C6, three ledger lines; a head higher than that keeps the marks in the top row): a head and, above the staff, its ledger lines, 10 px either side of the event
    const notes = layout.systems[0].bars.flatMap(b => b.events).map(e => ({ x1: e.x - 10, x2: e.x + 10, y1: e.y - 5 }));
    for (const m of drawn.map(inkOf)) {
      for (const o of others) expect(m.y2, 'a mark ends above an ending bracket or a triplet mark').toBeLessThan(o.y1 + shift);
      for (const n of notes) if (m.x1 < n.x2 && n.x1 < m.x2) expect(m.y2, 'a mark ends above a note').toBeLessThan(n.y1 + shift);
    }
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

describe('the marks of one bar stay in the bar', () => {
  const FULL: BarSpec['ev'] = [Q(), Q(69), Q(71), Q(72)];
  /** A doc of four quarter-note bars with the key signature of most accidentals: the narrowest bars the layout makes. */
  function narrowDoc(marks: Partial<BarSpec>[]): Doc {
    let best = mkDoc([]);
    let most = -1;
    for (let shift = 0; shift < 12; shift++) {
      const doc = mkDoc(marks.map(m => ({ ev: FULL, ...m })));
      doc.shift = shift;
      const sig = Math.abs(derive(doc, DEFAULT_PREFS).sig);
      if (sig > most) { most = sig; best = doc; }
    }
    return best;
  }
  const systemOf = (doc: Doc) => layoutSheet(doc, derive(doc, DEFAULT_PREFS)).systems[0];
  const disjoint = (ms: { x1: number; x2: number }[]) => {
    const sorted = ms.slice().sort((a, b) => a.x1 - b.x1);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].x1).toBeGreaterThan(sorted[i - 1].x2);
  };
  const THREE = { segno: true, toCoda: true, jump: 'dsCoda' } as const;

  it('the narrowest bar is a quarter of a system after the widest header', () => {
    const doc = narrowDoc([{}, {}, {}, {}]);
    const s = systemOf(doc);
    expect(s.bars).toHaveLength(4);
    expect(Math.abs(derive(doc, DEFAULT_PREFS).sig)).toBeGreaterThanOrEqual(6);
    expect(Math.min(...s.bars.map(b => b.width))).toBeCloseTo((SHEET.systemWidth - s.headerWidth) / 4, 6);
  });

  it.each([
    ['Segno + To Coda + D.S. al Coda', { ...THREE }],
    ['Coda + Fine + D.C. al Fine', { coda: true, fine: true, jump: 'dcFine' }],
    ['Fine + a jump', { fine: true, jump: 'dc' }],
    ['To Coda + a jump', { toCoda: true, jump: 'dsCoda' }],
  ] as const)('%s in every bar of the narrowest system: inside the bar, no two marks touch, texts at 10 px or more', (_, mark) => {
    const doc = narrowDoc([mark, mark, mark, mark]);
    const s = systemOf(doc);
    const placed = planMarks(s, doc.score);
    expect(placed.length).toBeGreaterThanOrEqual(8);
    for (const b of s.bars) {
      const own = placed.filter(m => m.bar === b.bar);
      for (const m of own) {
        expect(m.x1, `${m.kind} of bar ${b.bar}`).toBeGreaterThanOrEqual(b.x);
        expect(m.x2).toBeLessThanOrEqual(b.x + b.width);
        expect(m.px).toBeGreaterThanOrEqual(10);
      }
      disjoint(own);
    }
    disjoint(placed);
    expect(placed[0].x1).toBeGreaterThan(s.headerWidth);
  });

  it('the first and the last bar of a system alone: clef and key signature are not touched, nothing leaves the system', () => {
    for (const at of [0, 3]) {
      const doc = narrowDoc([0, 1, 2, 3].map(i => (i === at ? { ...THREE, coda: true, fine: true } : {})));
      const s = systemOf(doc);
      const placed = planMarks(s, doc.score);
      expect(placed.length).toBe(5);
      for (const m of placed) {
        expect(m.x1).toBeGreaterThanOrEqual(s.bars[at].x - (at === 0 ? 0 : s.bars[at].width / 2));
        expect(m.x2).toBeLessThanOrEqual(SHEET.systemWidth);
        expect(m.x1).toBeGreaterThanOrEqual(s.headerWidth);
      }
      disjoint(placed);
    }
  });

  it('every mark in every bar of the narrowest system: they still touch neither each other, the clef, nor the system\'s edge', () => {
    const all = { segno: true, coda: true, fine: true, toCoda: true, jump: 'dsCoda' } as const;
    const doc = narrowDoc([all, all, all, all]);
    const s = systemOf(doc);
    const placed = planMarks(s, doc.score);
    expect(placed).toHaveLength(20);
    disjoint(placed);
    for (const m of placed) {
      expect(m.x1).toBeGreaterThanOrEqual(s.headerWidth);
      expect(m.x2).toBeLessThanOrEqual(SHEET.systemWidth);
    }
  });

  it('an overflowing bar reaches left into an empty bar before it, never into a marked one', () => {
    const all = { segno: true, coda: true, fine: true, toCoda: true, jump: 'dsCoda' } as const;
    const doc = narrowDoc([{}, all, {}, {}]);
    const s = systemOf(doc);
    const placed = planMarks(s, doc.score);
    expect(placed).toHaveLength(5);
    const bar = s.bars[1];
    expect(Math.max(...placed.map(m => m.x2))).toBeLessThanOrEqual(bar.x + bar.width);
    disjoint(placed);
    expect(Math.min(...placed.map(m => m.x1))).toBeGreaterThanOrEqual(s.bars[0].x);
  });

  it('all five marks need a bar of 212 px at 10 px or more (estimated widths, wider than the font\'s)', () => {
    const doc = narrowDoc([{ segno: true, coda: true, fine: true, toCoda: true, jump: 'dsCoda' }]);
    const s = systemOf(doc);
    const fits = (w: number) => {
      const one = { ...s, bars: [{ ...s.bars[0], x: 0, width: w }] };
      const m = planMarks(one, doc.score);
      return m.every(x => x.x1 >= 4 && x.px >= 10);
    };
    let w = 100;
    while (!fits(w)) w += 1;
    expect(w).toBe(212);                      // narrower bars (the narrowest is 178 px) use the overflow rule
    expect(w).toBeGreaterThan(Math.min(...s.bars.map(b => b.width)));
  });
});

describe('the bold italic face of the texts', () => {
  const FACE = 'italic 700 13px "Atkinson Hyperlegible"';
  const stub = (fonts: unknown) => Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
  beforeEach(resetMarkFace);
  afterEach(() => { Reflect.deleteProperty(document, 'fonts'); resetMarkFace(); });

  function Probe({ onRender }: { onRender(n: number): void }) { onRender(useMarkFace()); return null; }
  const probe = () => {
    const seen: number[] = [];
    render(<Probe onRender={n => seen.push(n)} />);
    return seen;
  };

  it('is requested once, at first use, and the marks are drawn again when it has loaded', async () => {
    let done!: () => void;
    const load = vi.fn(() => new Promise<unknown[]>(res => { done = () => res([]); }));
    stub({ load, check: vi.fn(() => false) });
    const seen = probe();
    probe();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(FACE);
    expect(new Set(seen)).toEqual(new Set([0]));
    await act(async () => { done(); await Promise.resolve(); });
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('asks for the face by the family name the stylesheet imports', () => {
    expect(readFileSync('src/styles/global.css', 'utf8')).toContain("@fontsource/atkinson-hyperlegible/700-italic.css");
    expect(readFileSync('node_modules/@fontsource/atkinson-hyperlegible/700-italic.css', 'utf8')).toContain("font-family: 'Atkinson Hyperlegible'");
  });

  it('does not draw again when the face is already loaded', async () => {
    const load = vi.fn(() => Promise.resolve([]));
    stub({ load, check: vi.fn(() => true) });
    const seen = probe();
    await act(async () => { await Promise.resolve(); });
    expect(load).not.toHaveBeenCalled();
    expect(new Set(seen)).toEqual(new Set([0]));
  });

  it('survives a load that fails, and a document without fonts', async () => {
    stub({ load: vi.fn(() => Promise.reject(new Error('no'))), check: () => false });
    const seen = probe();
    await act(async () => { await Promise.resolve(); });
    expect(new Set(seen)).toEqual(new Set([0]));
    resetMarkFace();
    Reflect.deleteProperty(document, 'fonts');
    expect(() => probe()).not.toThrow();
    expect(() => draw(mkDoc([bar({ jump: 'dc' })]))).not.toThrow();
  });
});
