import { describe, expect, it } from 'vitest';
import { barLabelOf, hasJumpMarks, jumpProblems, JUMP_TEXT } from './jumps';
import { playOrder } from './playback';
import type { Doc } from './types';
import { mkDoc, type BarSpec } from '../test/helpers';

type Mark = Omit<BarSpec, 'ev'>;
const tune = (...bars: Mark[]): Doc => mkDoc(bars.map(b => ({ ev: [[60, 48]], ...b })));
const texts = (d: Doc) => jumpProblems(d).map(p => p.text);
const withoutJump = (d: Doc): Doc => ({ ...d, score: d.score.map(({ jump: _jump, ...bar }) => bar) });
const IGNORED = ' Playback ignores the jump.';

describe('JUMP_TEXT', () => {
  it('holds the six texts of the sheet', () => {
    expect(JUMP_TEXT).toEqual({
      dc: 'D.C.', dcFine: 'D.C. al Fine', dcCoda: 'D.C. al Coda', ds: 'D.S.', dsFine: 'D.S. al Fine', dsCoda: 'D.S. al Coda',
    });
  });
});

describe('hasJumpMarks', () => {
  it('is false without marks and true for each of the five fields', () => {
    expect(hasJumpMarks(tune({}, {}))).toBe(false);
    for (const m of [{ segno: true }, { coda: true }, { fine: true }, { toCoda: true }, { jump: 'dc' }] as Mark[]) {
      expect(hasJumpMarks(tune({}, m))).toBe(true);
    }
  });
});

describe('barLabelOf', () => {
  it('counts from 1, and a pickup bar is bar 0', () => {
    expect(barLabelOf(tune({}, {}), 1)).toBe(2);
    const pickup = mkDoc([{ ev: [[60, 24]] }, { ev: [[60, 48]] }, { ev: [[60, 48]] }]);
    expect([0, 1, 2].map(i => barLabelOf(pickup, i))).toEqual([0, 1, 2]);
  });
});

describe('jumpProblems', () => {
  it('finds none in a document that adds up, in each of the six forms', () => {
    expect(texts(tune({ segno: true }, { jump: 'dc' }))).toEqual([]);   // a Segno with a D.C. is no problem
    expect(texts(tune({}, { fine: true }, { jump: 'dcFine' }))).toEqual([]);
    expect(texts(tune({}, { toCoda: true }, { jump: 'dcCoda' }, { coda: true }))).toEqual([]);
    expect(texts(tune({}, { segno: true }, { jump: 'ds' }))).toEqual([]);
    expect(texts(tune({ segno: true }, { fine: true }, { jump: 'dsFine' }))).toEqual([]);
    expect(texts(tune({ segno: true }, { toCoda: true }, { jump: 'dsCoda' }, { coda: true }))).toEqual([]);
  });

  it('finds none in a document without a jump', () => {
    expect(jumpProblems(tune({ segno: true }, { segno: true, fine: true }, { coda: true }))).toEqual([]);
  });

  it('a mark in the last ending, or in a bar that plays again, is no problem', () => {
    expect(texts(tune({ rs: true }, { volta: '1', re: true }, { volta: '2', fine: true }, { jump: 'dcFine' }))).toEqual([]);
  });

  const cases: [string, Mark[], string][] = [
    ['D.S. without a Segno', [{}, {}, { jump: 'ds' }], 'D.S. in bar 3 needs a Segno.'],
    ['D.S. al Coda without a Segno', [{ toCoda: true }, { jump: 'dsCoda' }, { coda: true }], 'D.S. al Coda in bar 2 needs a Segno.'],
    ['al Coda without a To Coda', [{}, { jump: 'dcCoda' }, { coda: true }], 'D.C. al Coda in bar 2 needs a To Coda.'],
    ['al Coda without a Coda', [{ toCoda: true }, { jump: 'dcCoda' }], 'D.C. al Coda in bar 2 needs a Coda.'],
    ['the Coda before the To Coda',
      [{ coda: true }, { toCoda: true }, { jump: 'dcCoda' }],
      'D.C. al Coda in bar 3 needs the Coda after the To Coda, but the Coda is in bar 1 and the To Coda in bar 2.'],
    ['al Fine without a Fine', [{}, {}, { jump: 'dcFine' }], 'D.C. al Fine in bar 3 needs a Fine.'],
    ['D.S. al Fine without a Fine', [{ segno: true }, { jump: 'dsFine' }], 'D.S. al Fine in bar 2 needs a Fine.'],
    ['more than one jump', [{ jump: 'dc' }, {}, { jump: 'dc' }], 'There is more than one jump, in bars 1 and 3.'],
    ['more than one Segno', [{ segno: true }, { segno: true }, { jump: 'ds' }], 'There is more than one Segno, in bars 1 and 2.'],
    ['more than one Coda', [{ toCoda: true }, { coda: true }, { coda: true }, { jump: 'dcCoda' }], 'There is more than one Coda, in bars 2 and 3.'],
    ['more than one Fine', [{ fine: true }, { fine: true }, {}, { jump: 'dc' }], 'There is more than one Fine, in bars 1 and 2.'],
    ['more than one To Coda', [{ toCoda: true }, { toCoda: true }, { jump: 'dcCoda' }, { coda: true }], 'There is more than one To Coda, in bars 1 and 2.'],
    ['a Segno after the jump bar', [{}, { jump: 'ds' }, { segno: true }], 'The Segno in bar 3 comes after D.S. in bar 2.'],
    ['a Fine after the jump bar', [{}, { jump: 'dc' }, { fine: true }], 'The Fine in bar 3 comes after D.C. in bar 2.'],
    ['a To Coda after the jump bar',
      [{}, { jump: 'dcCoda' }, { toCoda: true }, { coda: true }], 'The To Coda in bar 3 comes after D.C. al Coda in bar 2.'],
    ['a Fine before the Segno of a D.S.',
      [{ fine: true }, { segno: true }, { jump: 'ds' }], 'The Fine in bar 1 comes before the Segno in bar 2, which D.S. in bar 3 returns to.'],
    ['a To Coda before the Segno of a D.S. al Coda',
      [{ toCoda: true }, { segno: true }, { jump: 'dsCoda' }, { coda: true }],
      'The To Coda in bar 1 comes before the Segno in bar 2, which D.S. al Coda in bar 3 returns to.'],
    ['a Fine in the jump bar', [{}, { fine: true, jump: 'dc' }], 'The Fine in bar 2 shares its bar with the jump (D.C.).'],
    ['a To Coda in the jump bar', [{}, { toCoda: true, jump: 'dcCoda' }, { coda: true }], 'The To Coda in bar 2 shares its bar with the jump (D.C. al Coda).'],
    ['a Fine in an ending that is skipped after the jump',
      [{ rs: true }, { volta: '1', re: true, fine: true }, { volta: '2' }, { jump: 'dc' }],
      'The Fine in bar 2 stands in an ending that is skipped after the jump.'],
    ['a Segno in an ending that is skipped after the jump',
      [{ rs: true }, { volta: '1', re: true, segno: true }, { volta: '2' }, { jump: 'ds' }],
      'The Segno in bar 2 stands in an ending that is skipped after the jump.'],
    ['a To Coda in an ending that is skipped after the jump',
      [{ rs: true }, { volta: '1', re: true, toCoda: true }, { volta: '2' }, { jump: 'dcCoda' }, { coda: true }],
      'The To Coda in bar 2 stands in an ending that is skipped after the jump.'],
  ];

  it.each(cases)('%s: one text with the printed bar number, then "Playback ignores the jump."; playback ignores the jump', (_name, bars, text) => {
    const d = tune(...bars);
    expect(texts(d)).toContain(text + IGNORED);
    expect(playOrder(d)).toEqual(playOrder(withoutJump(d)));
  });

  it('every text is one sentence that ends with "Playback ignores the jump."', () => {
    for (const [, bars] of cases) for (const t of texts(tune(...bars))) {
      expect(t.endsWith(IGNORED)).toBe(true);
      expect(t.slice(0, -IGNORED.length).replace(/D\.[CS]\./g, 'jump')).not.toContain('. ');
    }
  });

  it('names more than two bars with commas and "and"', () => {
    expect(texts(tune({ jump: 'dc' }, { jump: 'dc' }, { jump: 'dc' }))).toEqual(['There is more than one jump, in bars 1, 2 and 3.' + IGNORED]);
  });

  it('reports the bar index of the jump', () => {
    expect(jumpProblems(tune({}, {}, { jump: 'ds' }))).toEqual([{ bar: 2, text: 'D.S. in bar 3 needs a Segno.' + IGNORED }]);
  });

  it('prints the bar numbers of the sheet: a pickup bar is bar 0', () => {
    const d = mkDoc([{ ev: [[60, 24]] }, { ev: [[60, 48]] }, { ev: [[60, 48]], jump: 'ds' }]);
    expect(texts(d)).toEqual(['D.S. in bar 2 needs a Segno.' + IGNORED]);
  });
});
