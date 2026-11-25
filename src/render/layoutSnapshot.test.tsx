import { parseChord } from '../domain/chords';
import { sampleDoc } from '../domain/fixture';
import type { Doc } from '../domain/types';
import { mkDoc } from '../test/helpers';
import { layoutMarkup, layoutNumbers } from '../test/layoutDigest';

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

const CASES: [string, () => Doc][] = [['sample document', () => sampleDoc('asax')], ['repeat, endings, triplet, chord', busyDoc]];

describe('a sheet without marks keeps its layout', () => {
  it.each(CASES)('%s: layout numbers', (_, make) => {
    expect(layoutNumbers(make())).toMatchSnapshot();
  });
  it.each(CASES)('%s: drawn markup', (_, make) => {
    expect(layoutMarkup(make())).toMatchSnapshot();
  });
});
