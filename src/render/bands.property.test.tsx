import { render } from '@testing-library/react';
import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { mkDoc, type EvSpec } from '../test/helpers';
import { PaletteProvider, SCREEN } from './palette';
import { Paper } from './Paper';
import { pathBox, placedBox, type Box } from './pathBox';
import { layoutSheet } from './sheetLayout';

const num = (el: Element, name: string) => Number(el.getAttribute(name));

/** Boxes of everything the notes draw in one system, in the system's coordinates (the shifted drawing's shift added). */
function noteBoxes(svg: Element): Box[] {
  const g = Array.from(svg.children).find(c => c.localName === 'g' && c.getAttribute('transform')?.startsWith('translate(0 '));
  const shift = g ? Number(/translate\(0 (-?[\d.]+)\)/.exec(g.getAttribute('transform')!)![1]) : 0;
  const root = g ?? svg;
  const out: Box[] = [];
  const rect = (e: Element) => out.push({ x1: num(e, 'x'), x2: num(e, 'x') + num(e, 'width'), y1: num(e, 'y'), y2: num(e, 'y') + num(e, 'height') });
  root.querySelectorAll('[data-ev]').forEach(ev => {
    ev.querySelectorAll('[data-head]').forEach(h => out.push({ x1: num(h, 'cx') - 7, x2: num(h, 'cx') + 7, y1: num(h, 'cy') - 5, y2: num(h, 'cy') + 5 }));
    ev.querySelectorAll('[data-ledger], [data-stem]').forEach(rect);
    ev.querySelectorAll('[data-dot]').forEach(d => out.push({ x1: num(d, 'cx') - 2, x2: num(d, 'cx') + 2, y1: num(d, 'cy') - 2, y2: num(d, 'cy') + 2 }));
    ev.querySelectorAll('[data-flag]').forEach(f => out.push(pathBox(f.getAttribute('d')!)));
    ev.querySelectorAll('path[transform]').forEach(p => {
      const m = /^translate\(([-\d.]+), ([-\d.]+)\) scale\(([-\d.]+), -([-\d.]+)\)$/.exec(p.getAttribute('transform')!);
      if (m) out.push(placedBox(p.getAttribute('d')!, Number(m[1]), Number(m[2]), Number(m[3])));
    });
  });
  root.querySelectorAll('[data-beam], [data-beam-stub]').forEach(rect);
  root.querySelectorAll('[data-beam-group] [data-stem]').forEach(rect);
  root.querySelectorAll('[data-tie]').forEach(t => {
    const b = pathBox(t.getAttribute('d')!);
    const above = /A[-\d.]+ 5 0 0 1 /.test(t.getAttribute('d')!);
    out.push({ ...b, y1: above ? b.y1 - 5 : b.y1, y2: above ? b.y2 : b.y2 + 5 });
  });
  root.querySelectorAll('[data-tuplet]').forEach(m => {
    const t = m.querySelector('text')!;
    out.push({ x1: num(t, 'x') - 5, x2: num(t, 'x') + 5, y1: num(t, 'y') - 9, y2: num(t, 'y') });
    m.querySelectorAll('[data-tuplet-bracket]').forEach(p => out.push(pathBox(p.getAttribute('d')!)));
  });
  return out.map(b => ({ x1: b.x1, x2: b.x2, y1: b.y1 + shift, y2: b.y2 + shift }));
}

describe('no note element meets a band', () => {
  let seed = 20261125;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 65536) % n; };
  let ceiling = 70;
  const pitch = () => 48 + rnd(ceiling - 48);
  /** One bar: each beat a quarter, two eighths, four sixteenths, a triplet, a dotted pair or a rest. */
  function bar(): EvSpec[] {
    const out: EvSpec[] = [];
    for (let beat = 0; beat < 4; beat++) {
      switch (rnd(7)) {
        case 0: out.push([pitch(), 12]); break;
        case 1: out.push([pitch(), 6], [pitch(), 6]); break;
        case 2: out.push([pitch(), 3], [pitch(), 3], [pitch(), 3], [pitch(), 3]); break;
        case 3: out.push([pitch(), 4], [pitch(), 4], [pitch(), 4]); break;
        case 4: out.push([pitch(), 9], [pitch(), 3]); break;
        case 5: out.push([pitch(), 6], [0, 6]); break;
        default: out.push([0, 12]);
      }
    }
    return out.map((e, i) => (i + 1 < out.length && e[0] !== 0 && out[i + 1][0] === e[0] && rnd(2) === 0 ? [e[0], e[1], { tie: true }] as EvSpec : e));
  }

  const stats = { sheets: 0, marks: 0, chords: 0, lyrics: 0, endings: 0, taller: 0, groupsUp: 0, ties: 0, triplets: 0, ledgerAbove: 0 };

  /** A random sheet in which each band is switched on at random. */
  function randomDoc(): Doc {
    ceiling = 70 + rnd(18);
    const doc: Doc = mkDoc([{ ev: bar(), segno: rnd(2) === 0 ? true : undefined }, { ev: bar() }, { ev: bar() }, { ev: bar(), jump: rnd(2) === 0 ? 'dc' : undefined }]);
    if (rnd(2) === 0) { doc.score[1].volta = '1'; doc.score[1].re = true; doc.score[2].volta = '2'; }
    const events = doc.score.flatMap(b => b.ev.filter(e => !e.r));
    if (rnd(2) === 0) doc.chords[events[rnd(events.length)].id] = parseChord('Am', 0);
    if (rnd(2) === 0) events[rnd(events.length)].l = 'la';
    return doc;
  }

  function check(count: number): void {
    for (let run = 0; run < count; run++) {
      const doc = randomDoc();
      const d = derive(doc, DEFAULT_PREFS);
      const force = { lyrics: rnd(4) === 0, chords: rnd(4) === 0 };
      const layout = layoutSheet(doc, d, force);
      const { container, unmount } = render(
        <PaletteProvider value={SCREEN}><Paper doc={doc} derived={d} layout={layout} playingId={null} selectedId={null} forceShow={force} /></PaletteProvider>,
      );
      const { bands: b, staffTop } = layout.stack;
      stats.sheets++;
      if (b.marks > 0) stats.marks++;
      if (b.chords > 0) stats.chords++;
      if (b.lyrics > 0) stats.lyrics++;
      if (b.endings > 0) stats.endings++;
      if (b.headroom > (b.marks + b.chords + b.lyrics + b.endings === 0 ? 21 : 15)) stats.taller++;
      stats.ties += container.querySelectorAll('[data-tie]').length;
      stats.triplets += container.querySelectorAll('[data-tuplet]').length;
      stats.ledgerAbove += Array.from(container.querySelectorAll('[data-ledger]')).filter(e => num(e, 'y') < 75).length;
      // the bands, in the system's coordinates; everything the notes draw lies below the last of them
      const lowest = b.marks + b.chords + b.lyrics + b.endings;
      expect(staffTop).toBe(lowest + b.headroom);
      container.querySelectorAll('svg[data-testid="system"]').forEach(svg => {
        for (const box of noteBoxes(svg)) {
          expect(box.y1, `run ${run}: a note element at y ${box.y1} to ${box.y2} reaches into a band (they end at ${lowest})`).toBeGreaterThanOrEqual(lowest);
        }
      });
      // where the headroom grew for the notes beyond its minimum, the highest ink keeps the 4 px margin from the lowest band
      if (b.headroom > (lowest === 0 ? 21 : 15)) {
        const tops = Array.from(container.querySelectorAll('svg[data-testid="system"]')).flatMap(svg => noteBoxes(svg).map(x => x.y1));
        // the ink model may be a little roomier than the drawing, never tighter: the real top is at least `lowest + 4`
        expect(Math.min(...tops), `run ${run}: the highest ink keeps 4 px from the lowest band (headroom ${b.headroom}, lowest ${lowest}, force ${JSON.stringify(force)})`).toBeGreaterThanOrEqual(lowest + 4 - 1e-6);
      }
      unmount();
    }
  }

  for (let part = 1; part <= 4; part++) {
    it(`random sheets with random bands, part ${part} of 4: no head, stem, beam, flag, dot, tie or triplet mark reaches into a band`, () => check(30), 60_000);
  }

  it('the random sheets are not vacuous: every band is present on some and absent on others, and some sheets grow for high notes', () => {
    // independent of the order of the tests: it runs its own sample
    check(120);
    expect(stats.sheets).toBeGreaterThanOrEqual(120);
    for (const k of ['marks', 'chords', 'lyrics', 'endings'] as const) {
      expect(stats[k], k).toBeGreaterThan(10);
      expect(stats[k], k).toBeLessThan(stats.sheets - 10);
    }
    expect(stats.taller).toBeGreaterThan(10);
    for (const k of ['ties', 'triplets', 'ledgerAbove'] as const) expect(stats[k], k).toBeGreaterThan(0);
  }, 60_000);
});
