import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { bare, withC6, withChords, withEndings, withLyrics, withMarks } from '../test/bandSheets';
import { layoutMarkup, layoutNumbers } from '../test/layoutDigest';
import { layoutSheet } from './sheetLayout';

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
