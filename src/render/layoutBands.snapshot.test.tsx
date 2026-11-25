import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { layoutMarkup, layoutNumbers } from '../test/layoutDigest';
import { mkDoc, type BarSpec } from '../test/helpers';
import { layoutSheet } from './layout';

/** Six bars of G4 quarters: two systems, no chord, no lyric, no ending, no mark. */
function bare(): Doc {
  const bar = (): BarSpec => ({ ev: [[67, 12], [67, 12], [67, 12], [67, 12]] });
  return mkDoc([bar(), bar(), bar(), bar(), bar(), bar()]);
}

const withMarks = (doc: Doc): Doc => {
  doc.score[0].segno = true;
  doc.score[1].coda = true;
  doc.score[2].fine = true;
  doc.score[3].toCoda = true;
  doc.score[5].jump = 'dsCoda';
  return doc;
};

const withLyrics = (doc: Doc): Doc => {
  doc.score[0].ev[0].l = 'one';
  doc.score[1].ev[1].l = 'two';
  return doc;
};

const withChords = (doc: Doc): Doc => {
  doc.chords[doc.score[0].ev[0].id] = parseChord('Am', 0);
  doc.chords[doc.score[2].ev[0].id] = parseChord('G7', 0);
  return doc;
};

/** A repeat with two endings: the ending band is in use. */
const withEndings = (doc: Doc): Doc => {
  doc.score[1].rs = true;
  doc.score[2].volta = '1';
  doc.score[2].re = true;
  doc.score[3].volta = '2';
  return doc;
};

const withC6 = (doc: Doc): Doc => {
  doc.score[4].ev[1].m = 84;
  return doc;
};

/** The six sheets of the bands rule (design 5.10), each with the number of bands it uses. */
const CASES: [string, () => Doc][] = [
  ['all bands, no high note', () => withEndings(withChords(withLyrics(bare())))],
  ['chords and lyrics, no endings', () => withChords(withLyrics(bare()))],
  ['lyrics only', () => withLyrics(bare())],
  ['bare', bare],
  ['bare with every mark', () => withMarks(bare())],
  ['all bands, every mark, a note at C6', () => withC6(withMarks(withEndings(withChords(withLyrics(bare())))))],
];

describe('layout of sheets by the bands they use', () => {
  it.each(CASES)('%s: layout numbers and system height', (_, make) => {
    const doc = make();
    expect({ numbers: layoutNumbers(doc), systemHeight: layoutSheet(doc, derive(doc, DEFAULT_PREFS)).systemHeight }).toMatchSnapshot();
  });
  it.each(CASES)('%s: drawn markup', (_, make) => {
    expect(layoutMarkup(make())).toMatchSnapshot();
  });
});
