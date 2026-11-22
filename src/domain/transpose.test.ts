import { inst } from './instruments';
import { mod12 } from './keys';
import type { InstId } from './types';
import { sampleDoc } from './fixture';
import { DEFAULT_PREFS, bestShiftForConcertTonic, bestShiftForWrittenTonic, evalShift, rankShifts, reasonText, scoringPitches } from './transpose';

const P = () => scoringPitches(sampleDoc().score);
const rank = (id: InstId) => rankShifts(P(), inst(id), 2, 'major', DEFAULT_PREFS);

it('fixture shape', () => {
  expect(P()).toHaveLength(41); expect(Math.min(...P())).toBe(57); expect(Math.max(...P())).toBe(69);
  expect(sampleDoc().score[0].cap).toBe(36); expect(sampleDoc().score[1].cap).toBe(48);
});
it('fixture ids are deterministic and every bar fills its cap', () => {
  const d = sampleDoc();
  const ids = d.score.flatMap(b => b.ev.map(e => e.id));
  expect(ids[0]).toBe('e1'); expect(ids[ids.length - 1]).toBe(`e${ids.length}`);
  expect(new Set(ids).size).toBe(ids.length);
  for (const b of d.score) expect(b.ev.reduce((n, e) => n + e.d, 0)).toBe(b.cap);
  expect(d).toMatchObject({ timeSig: [4, 4], originalTonicPc: 2, originalMode: 'major', tempo: 100, inst: 'asax', chords: {}, fingering: {} });
  expect(d.shift).toBe(rank('asax')[0].shift);
  expect(sampleDoc('xc').shift).toBe(3);
});
it('check 1: Xaphoon C suggests F major, C4–C5', () => {
  const r = rank('xc');
  expect(r.slice(0, 3).map(s => s.shift)).toEqual([3, 5, 6]);
  expect(r[0]).toMatchObject({ score: 11, bad: 0, ext: 0, upper: 0, min: 60, max: 72, sig: -1 });
  expect(reasonText(r[0], inst('xc'))).toBe('low register only');
});
it('check 1b: Xaphoon B♭', () => { expect(rank('xbb').slice(0, 3).map(s => s.shift)).toEqual([1, 3, 4]); });
it('check 2: shift 0 on Xaphoon C has 8 notes below C4', () => {
  expect(evalShift(P(), 0, inst('xc'), 2, 'major', DEFAULT_PREFS).bad).toBe(8);
});
it('check 3: written and sounding keys', () => {
  const k = (id: InstId) => { const s = rank(id)[0].shift; return [mod12(2 + s + inst(id).off), mod12(2 + s)]; };
  expect(k('asax')).toEqual([7, 10]);
  expect(k('cl')).toEqual([0, 10]);
  expect(k('tsax')).toEqual([7, 5]);
  expect(k('fl')[0]).toBe(0); expect(k('ra')[0]).toBe(0);
});
it('check 4: alto sax, sounds in D → reads B', () => {
  const s = bestShiftForConcertTonic(rank('asax'), 2, 2);
  expect(mod12(2 + s)).toBe(2); expect(mod12(2 + s + 9)).toBe(11);
});
it('best shift for a written tonic', () => {
  const s = bestShiftForWrittenTonic(rank('asax'), inst('asax'), 2, 7);
  expect(mod12(2 + s + 9)).toBe(7);
  expect(s).toBe(rank('asax')[0].shift);
});
it('never fails on an unplayable song', () => {
  const wide = [40, 100]; const r = rankShifts(wide, inst('xc'), 0, 'major', DEFAULT_PREFS);
  expect(r).toHaveLength(49); expect(r[0].bad).toBeGreaterThan(0);
});
it('empty pitch list counts nothing', () => {
  expect(evalShift([], 0, inst('xc'), 2, 'major', DEFAULT_PREFS)).toMatchObject({ bad: 0, ext: 0, upper: 0, low: 0 });
});
it('preferences switch weights off', () => {
  const r = rankShifts(P(), inst('xc'), 2, 'major', { easyRegister: true, fewAccidentals: false });
  expect(r[0].shift).toBe(3);
});
it('reason text', () => {
  const base = { shift: 0, score: 0, sig: 0, min: 0, max: 0, low: 0 };
  const i = inst('xc');
  expect(reasonText({ ...base, bad: 8, ext: 2, upper: 3 }, i)).toBe('8 unplayable');
  expect(reasonText({ ...base, bad: 0, ext: 2, upper: 3 }, i)).toBe('2 extended');
  expect(reasonText({ ...base, bad: 0, ext: 0, upper: 3 }, i)).toBe('3 notes in the upper register');
  expect(reasonText({ ...base, bad: 0, ext: 0, upper: 1 }, i)).toBe('1 note in the upper register');
});
