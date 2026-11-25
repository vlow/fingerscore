import { render } from '@testing-library/react';
import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { mkDoc, type BarSpec, type EvSpec } from '../test/helpers';
import { DROP_MARGIN, layoutSheet, MARK_DROP, MARK_ROW, markRow } from './layout';
import { sheetMarkDrop } from './markDrop';
import { PaletteProvider, SCREEN } from './palette';
import { Paper } from './Paper';
import { pathBox, placedBox, type Box } from './pathBox';
import { systemPlacement } from './placed';
import { tieSegments } from './SystemView';
import { eventInk, placeTuplet } from './TupletMark';

/** The top of the lowered row's margin, in the system's own coordinates (below the row). */
const LIMIT = MARK_DROP + DROP_MARGIN;

const dropOf = (doc: Doc, show = doc.show): number => {
  const d = derive(doc, DEFAULT_PREFS);
  const layout = layoutSheet(doc, d);
  return sheetMarkDrop(doc, d, layout, show, tieSegments(d, layout));
};
/** A sheet with a jump (so it has a row) around one bar of events. */
const sheet = (ev: EvSpec[], extra: Partial<BarSpec> = {}): Doc =>
  mkDoc([{ ev: [...ev, [0, 48 - ev.reduce((s, e) => s + e[1], 0)]].filter(e => e[1] > 0) as EvSpec[], ...extra }, { ev: [[60, 48]], jump: 'dc' }]);
const POS = (doc: Doc) => derive(doc, DEFAULT_PREFS).events.filter(e => !e.rest).map(e => e.pos);

describe('sheetMarkDrop: anything the notes draw decides', () => {
  it('flags: chords and lyrics keep the top row, and so do their switches', () => {
    const doc = sheet([[60, 12]]);
    expect(dropOf(doc)).toBe(MARK_DROP);
    doc.chords[doc.score[0].ev[0].id] = parseChord('C', 0);
    expect(dropOf(doc)).toBe(0);
    expect(dropOf(doc, { ...doc.show, chords: false })).toBe(MARK_DROP);
    const l = sheet([[60, 12], [62, 12]]);
    l.score[0].ev[1].l = 'la';
    expect(dropOf(l, { ...l.show, lyrics: false })).toBe(MARK_DROP);
    expect(dropOf(l)).toBe(0);
  });

  it('heads: C6 is lowered, D6 and a C#6 with its accidental keep the top row', () => {
    expect(POS(sheet([[84, 12]]))[0]).toBe(12);
    expect(dropOf(sheet([[84, 12]]))).toBe(MARK_DROP);
    expect(dropOf(sheet([[86, 12]]))).toBe(0);
    expect(dropOf(sheet([[85, 12]]))).toBe(0);
  });

  it('a beamed stem-up group G5 E4 F4 G4: the beam tip reaches the row, so the top row; an octave lower the row is lowered', () => {
    const group = (m: number): EvSpec[] => [[m + 15, 3], [m, 3], [m + 1, 3], [m + 3, 3]];
    const high = sheet(group(64));
    expect(POS(high).slice(0, 4)).toEqual([9, 0, 1, 2]);
    const d = derive(high, DEFAULT_PREFS);
    const layout = layoutSheet(high, d);
    expect(layout.beams[0]).toHaveLength(1);
    const { placed, beamOf } = systemPlacement(d, layout.systems[0], layout.beams);
    const heads = placed.map(n => eventInk(n, undefined)[0].y1);
    expect(Math.min(...heads) + MARK_ROW).toBeGreaterThan(MARK_ROW + LIMIT);   // the heads alone would allow the lowered row
    expect(beamOf.size).toBe(4);
    expect(dropOf(high)).toBe(0);
    expect(dropOf(sheet(group(52)))).toBe(MARK_DROP);
  });

  it('a single stem-up note: its tip stays below the row, so the row is lowered (a stem up is 33 px, notes up to position 3 have it)', () => {
    const doc = sheet([[69, 12]]);     // A4, position 3: the highest stem-up note
    expect(POS(doc)[0]).toBe(3);
    const d = derive(doc, DEFAULT_PREFS);
    const layout = layoutSheet(doc, d);
    const { placed } = systemPlacement(d, layout.systems[0], layout.beams);
    expect(Math.min(...eventInk(placed[0], undefined).map(b => b.y1))).toBeGreaterThan(LIMIT);
    expect(dropOf(doc)).toBe(MARK_DROP);
  });

  it('a tie arc over the highest notes reaches the row though their heads do not', () => {
    const tied = (m: number) => sheet([[m, 24, { tie: true }], [m, 24]]);
    expect(dropOf(tied(84))).toBe(0);                      // C6: head top at 50, arc apex at 43
    expect(dropOf(tied(81))).toBe(MARK_DROP);              // A5: apex at 53
    expect(dropOf(sheet([[84, 24], [84, 24]]))).toBe(MARK_DROP);   // the same notes untied
  });

  it('a triplet mark that the renderer places above never comes nearer than 46 px: the margin edge is 48, so it is placed below instead', () => {
    const doc = sheet([[74, 4], [64, 4], [64, 4]]);
    const d = derive(doc, DEFAULT_PREFS);
    const layout = layoutSheet(doc, d);
    const s = layout.systems[0];
    const { placed, byId, beamOf, groups } = systemPlacement(d, s, layout.beams);
    expect(layout.tuplets[0][0].beamed).toBe(true);
    const others = Math.min(...placed.flatMap(n => eventInk(n, undefined).map(b => b.y1)));
    const tip = Math.min(...placed.map(n => n.y)) - 30;
    expect(groups).toHaveLength(1);
    expect(beamOf.size).toBe(3);
    expect(others).toBeGreaterThan(LIMIT);
    expect(tip).toBeGreaterThan(LIMIT);
    const mark = placeTuplet({ mark: layout.tuplets[0][0], byId, beamOf, marks: layout.tuplets[0], barIds: s.bars[0].events.map(e => e.id), volta: false });
    expect(mark.chosen.side).toBe('below');       // above would put the digit at 41, in the band
    expect(dropOf(doc)).toBe(MARK_DROP);
  });

  it('a dotted note and a rest do not reach the row at ordinary pitches', () => {
    expect(dropOf(sheet([[72, 18], [60, 6]]))).toBe(MARK_DROP);
  });

  it('one element anywhere keeps the top row for the whole sheet', () => {
    const doc = mkDoc([{ ev: [[60, 48]] }, { ev: [[60, 48]] }, { ev: [[60, 48]] }, { ev: [[60, 48]] }, { ev: [[86, 48]], jump: 'dc' }]);
    expect(layoutSheet(doc, derive(doc, DEFAULT_PREFS)).systems.length).toBeGreaterThan(1);
    expect(dropOf(doc)).toBe(0);
  });
});

// ---- the property: a lowered row meets nothing the notes draw ----

const num = (el: Element, name: string) => Number(el.getAttribute(name));
/** Boxes of everything the notes draw in one system, in the system's drawn coordinates (row added). */
function noteBoxes(svg: Element, row: number): Box[] {
  const g = Array.from(svg.children).find(c => c.localName === 'g' && c.getAttribute('transform') === `translate(0 ${row})`)!;
  const out: Box[] = [];
  const rect = (e: Element) => out.push({ x1: num(e, 'x'), x2: num(e, 'x') + num(e, 'width'), y1: num(e, 'y'), y2: num(e, 'y') + num(e, 'height') });
  g.querySelectorAll('[data-ev]').forEach(ev => {
    ev.querySelectorAll('[data-head]').forEach(h => out.push({ x1: num(h, 'cx') - 7, x2: num(h, 'cx') + 7, y1: num(h, 'cy') - 5, y2: num(h, 'cy') + 5 }));
    ev.querySelectorAll('[data-ledger], [data-stem]').forEach(rect);
    ev.querySelectorAll('[data-dot]').forEach(d => out.push({ x1: num(d, 'cx') - 2, x2: num(d, 'cx') + 2, y1: num(d, 'cy') - 2, y2: num(d, 'cy') + 2 }));
    ev.querySelectorAll('[data-flag]').forEach(f => out.push(pathBox(f.getAttribute('d')!)));
    ev.querySelectorAll('path[transform]').forEach(p => {
      const m = /^translate\(([-\d.]+), ([-\d.]+)\) scale\(([-\d.]+), -([-\d.]+)\)$/.exec(p.getAttribute('transform')!);
      if (m) out.push(placedBox(p.getAttribute('d')!, Number(m[1]), Number(m[2]), Number(m[3])));
    });
  });
  g.querySelectorAll('[data-beam], [data-beam-stub]').forEach(rect);
  g.querySelectorAll('[data-beam-group] [data-stem]').forEach(rect);
  g.querySelectorAll('[data-tie]').forEach(t => {
    const b = pathBox(t.getAttribute('d')!);
    const above = /A[-\d.]+ 5 0 0 1 /.test(t.getAttribute('d')!);
    out.push({ ...b, y1: above ? b.y1 - 5 : b.y1, y2: above ? b.y2 : b.y2 + 5 });
  });
  g.querySelectorAll('[data-tuplet]').forEach(m => {
    const t = m.querySelector('text')!;
    out.push({ x1: num(t, 'x') - 5, x2: num(t, 'x') + 5, y1: num(t, 'y') - 9, y2: num(t, 'y') });
    m.querySelectorAll('[data-tuplet-bracket]').forEach(p => out.push(pathBox(p.getAttribute('d')!)));
  });
  // the boxes above are in the shifted group's coordinates
  return out.map(b => ({ x1: b.x1, x2: b.x2, y1: b.y1 + row, y2: b.y2 + row }));
}

describe('a lowered row meets nothing the notes draw', () => {
  let seed = 20260125;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  let ceiling = 70;
  const pitch = () => 48 + rnd(ceiling - 48);
  /** One bar: each beat a quarter, two eighths, four sixteenths, a triplet, a dotted pair or a rest. */
  function bar(): EvSpec[] {
    const out: EvSpec[] = [];
    for (let beat = 0; beat < 4; beat++) {
      switch (rnd(6)) {
        case 0: out.push([pitch(), 12]); break;
        case 1: out.push([pitch(), 6], [pitch(), 6]); break;
        case 2: out.push([pitch(), 3], [pitch(), 3], [pitch(), 3], [pitch(), 3]); break;
        case 3: out.push([pitch(), 4], [pitch(), 4], [pitch(), 4]); break;
        case 4: out.push([pitch(), 9], [pitch(), 3]); break;
        default: out.push([0, 12]);
      }
    }
    return out.map((e, i) => (i + 1 < out.length && e[0] !== 0 && out[i + 1][0] === e[0] && rnd(2) === 0 ? [e[0], e[1], { tie: true }] as EvSpec : e));
  }

  it('over a few hundred random sheets without chords and lyrics, no lowered row touches a note, stem, beam, flag, dot, tie or triplet mark', () => {
    let lowered = 0;
    let top = 0;
    for (let run = 0; run < 300; run++) {
      ceiling = 62 + rnd(34);
      const doc = mkDoc([{ ev: bar(), segno: true }, { ev: bar() }, { ev: bar(), jump: 'dc' }]);
      const d = derive(doc, DEFAULT_PREFS);
      const layout = layoutSheet(doc, d);
      const { container } = render(<PaletteProvider value={SCREEN}><Paper doc={doc} derived={d} layout={layout} playingId={null} selectedId={null} /></PaletteProvider>);
      const row = markRow(doc);
      const drop = sheetMarkDrop(doc, d, layout, doc.show, tieSegments(d, layout));
      if (drop === 0) { top++; container.remove(); continue; }
      lowered++;
      const texts = Array.from(container.querySelectorAll('[data-jump]'));
      expect(texts.length).toBeGreaterThan(0);
      // the lowered row, with its margin, in the system's drawn coordinates: from MARK_DROP to MARK_ROW + MARK_DROP + margin
      container.querySelectorAll('svg[data-testid="system"]').forEach(svg => {
        for (const b of noteBoxes(svg, row)) {
          expect(b.y1 >= MARK_ROW + MARK_DROP + DROP_MARGIN || b.y2 <= MARK_DROP, `run ${run}: a note element at y ${b.y1} to ${b.y2} meets the lowered row`).toBe(true);
        }
      });
    }
    expect(lowered).toBeGreaterThan(30);
    expect(top).toBeGreaterThan(30);
  });
});
