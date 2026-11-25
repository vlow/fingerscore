import { parseChord } from '../domain/chords';
import type { Doc } from '../domain/types';
import { mkDoc, type BarSpec } from './helpers';

/** Six bars of G4 quarters: two systems, no chord, no lyric, no ending, no mark. */
export function bare(): Doc {
  const bar = (): BarSpec => ({ ev: [[67, 12], [67, 12], [67, 12], [67, 12]] });
  return mkDoc([bar(), bar(), bar(), bar(), bar(), bar()]);
}

export const withMarks = (doc: Doc): Doc => {
  doc.score[0].segno = true;
  doc.score[1].coda = true;
  doc.score[2].fine = true;
  doc.score[3].toCoda = true;
  doc.score[5].jump = 'dsCoda';
  return doc;
};

export const withLyrics = (doc: Doc): Doc => {
  doc.score[0].ev[0].l = 'one';
  doc.score[1].ev[1].l = 'two';
  return doc;
};

export const withChords = (doc: Doc): Doc => {
  doc.chords[doc.score[0].ev[0].id] = parseChord('Am', 0);
  doc.chords[doc.score[2].ev[0].id] = parseChord('G7', 0);
  return doc;
};

/** A repeat with two endings: the ending band is in use. */
export const withEndings = (doc: Doc): Doc => {
  doc.score[1].rs = true;
  doc.score[2].volta = '1';
  doc.score[2].re = true;
  doc.score[3].volta = '2';
  return doc;
};

export const withC6 = (doc: Doc): Doc => {
  doc.score[4].ev[1].m = 84;
  return doc;
};
