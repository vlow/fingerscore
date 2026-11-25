import { createHash } from 'node:crypto';
import { render } from '@testing-library/react';
import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { mkDoc } from '../test/helpers';
import { layoutSheet } from './layout';
import { Paper } from './Paper';

/** A repeat, two endings, a triplet and a chord, with lyrics: every band above the staff is in use. */
function busyDoc(): Doc {
  const doc = mkDoc([
    { ev: [[67, 12], [69, 12], [71, 12], [72, 12]], rs: true },
    { ev: [[67, 4], [69, 4], [71, 4], [72, 12], [74, 12], [76, 12]] },
    { ev: [[67, 12], [69, 12], [71, 12], [72, 12]], volta: '1', re: true },
    { ev: [[67, 24], [69, 24]], volta: '2' },
    { ev: [[67, 6], [69, 6], [71, 6], [72, 6], [74, 12], [76, 12], [77, 12]] },
  ]);
  const ids = doc.score.flatMap(b => b.ev.map(e => e.id));
  doc.score[1].ev[0].l = 'one';
  doc.score[2].ev[1].l = 'two';
  doc.chords[ids[0]] = parseChord('Am', 0);
  doc.chords[doc.score[2].ev[0].id] = parseChord('G7', 0);
  return doc;
}

/** Every number of the layout, rounded to 1e-6 so float noise cannot hide a change. */
function numbers(doc: Doc) {
  const L = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    height: L.height,
    systems: L.systems.map(s => ({
      y: s.y, headerWidth: s.headerWidth, showTimeSig: s.showTimeSig, barNumber: s.barNumber,
      bars: s.bars.map(b => ({ bar: b.bar, x: r(b.x), width: r(b.width), events: b.events.map(e => [e.id, r(e.x), r(e.y)]) })),
    })),
    beams: L.beams, tuplets: L.tuplets,
  };
}

/** The drawn sheet's systems, as a digest of their markup (the digest changes if any attribute of any element does). */
function markup(doc: Doc) {
  const d = derive(doc, DEFAULT_PREFS);
  const { container } = render(<Paper doc={doc} derived={d} layout={layoutSheet(doc, d)} playingId={null} selectedId={null} />);
  const systems = Array.from(container.querySelectorAll('[data-testid="system"]'));
  const holders = systems.map(s => s.parentElement!);
  return {
    systems: systems.length,
    boxes: systems.map(s => [s.getAttribute('width'), s.getAttribute('height'), s.getAttribute('viewBox')]),
    digest: createHash('sha256').update(holders.map(h => h.outerHTML).join('\n')).digest('hex'),
  };
}

const CASES: [string, () => Doc][] = [['sample document', () => sampleDoc('asax')], ['repeat, endings, triplet, chord', busyDoc]];

describe('a sheet without marks keeps its layout', () => {
  it.each(CASES)('%s: layout numbers', (_, make) => {
    expect(numbers(make())).toMatchSnapshot();
  });
  it.each(CASES)('%s: drawn markup', (_, make) => {
    expect(markup(make())).toMatchSnapshot();
  });
});
