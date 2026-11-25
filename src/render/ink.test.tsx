import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { mkDoc, type EvSpec } from '../test/helpers';
import { sheetInkTop } from './ink';
import { layoutSystems } from './layout';

const inkOf = (doc: Doc): number => {
  const d = derive(doc, DEFAULT_PREFS);
  return sheetInkTop(doc, d, layoutSystems(doc, d));
};
/** One bar of the given events, then a whole-note bar so that there is something after it. */
const sheet = (ev: EvSpec[]): Doc => mkDoc([{ ev: [...ev, [0, 48 - ev.reduce((s, e) => s + e[1], 0)]].filter(e => e[1] > 0) as EvSpec[] }, { ev: [[60, 48]] }]);

describe('sheetInkTop: the highest y of anything the notes draw, in the staff frame (top staff line at 75)', () => {
  it('a head: C6 has its head top at 50, D6 at 45, C#6 reaches 45 with its accidental', () => {
    expect(inkOf(sheet([[84, 12]]))).toBe(50);
    expect(inkOf(sheet([[86, 12]]))).toBe(45);
    expect(inkOf(sheet([[85, 12]]))).toBeLessThanOrEqual(45);
  });

  it('a single stem-up note: A4, position 3, has its stem tip at 100 - 33 = 67', () => {
    expect(inkOf(sheet([[69, 12]]))).toBe(67);
  });

  it('a beamed stem-up group G5 E4 F4 G4: the beam tip stands 30 above its highest head', () => {
    const doc = sheet([[79, 3], [64, 3], [65, 3], [67, 3]]);
    expect(inkOf(doc)).toBe(40);       // G5 is at position 9, y 70: the beam tip at 70 - 30
  });

  it('a tie arc over the highest notes reaches above their heads', () => {
    const tied = sheet([[84, 24, { tie: true }], [84, 24]]);
    const plain = sheet([[84, 24], [84, 24]]);
    expect(inkOf(tied)).toBe(43);       // the arc's apex
    expect(inkOf(plain)).toBe(50);
  });

  it('a dot', () => {
    expect(inkOf(sheet([[84, 18], [60, 6]]))).toBeLessThanOrEqual(50);
  });

  it('a triplet mark counts: the mark above a bracket-less group sits higher than the heads', () => {
    const doc = sheet([[74, 4], [64, 4], [64, 4]]);
    expect(inkOf(doc)).toBeLessThan(75);
  });

  it('chords and lyrics do not count', () => {
    const doc = sheet([[60, 12]]);
    const plain = inkOf(doc);
    doc.chords[doc.score[0].ev[0].id] = parseChord('C', 0);
    doc.score[0].ev[0].l = 'la';
    expect(inkOf(doc)).toBe(plain);
  });

  it('is the highest over all systems', () => {
    const doc = mkDoc([{ ev: [[60, 48]] }, { ev: [[60, 48]] }, { ev: [[60, 48]] }, { ev: [[60, 48]] }, { ev: [[86, 48]] }]);
    expect(inkOf(doc)).toBe(45);
  });
});
