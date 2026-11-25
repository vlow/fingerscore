import { describe, it, expect } from 'vitest';
import { sampleDoc } from './fixture';
import { buildSchedule, firstTickOf, playOrder, sliceSchedule, ticksToSeconds } from './playback';
import { jumpProblems } from './jumps';
import type { Doc } from './types';
import { mkDoc, type BarSpec } from '../test/helpers';

describe('playback schedule', () => {
  it('check 5: demo playback', () => {
    const s = buildSchedule(sampleDoc('xc'));
    expect(s.notes).toHaveLength(73);
    expect(s.totalTicks).toBe(262 * 6);
    expect(ticksToSeconds(s.totalTicks, 100)).toBeCloseTo(78.6, 1);
  });

  it('sounding pitch', () => {
    const d = sampleDoc('asax');
    expect(buildSchedule(d).notes[0].midi).toBe(d.score[0].ev[0].m + d.shift);
  });

  it('ties merge, rests are silent', () => {
    const d = mkDoc([{ ev: [[60, 24, { tie: true }], [60, 12], [0, 12]] }]);
    const s = buildSchedule(d);
    expect(s.notes).toEqual([{ evId: d.score[0].ev[0].id, start: 0, dur: 36, midi: 60 }]);
    expect(s.totalTicks).toBe(48);
  });

  it('marks cover notes and rests, so a rest is highlighted while it lasts', () => {
    const d = mkDoc([{ ev: [[60, 12], [0, 12], [62, 12, { tie: true }], [62, 12]] }, { ev: [[0, 48]] }]);
    const [a, rest, c] = d.score[0].ev;
    const barRest = d.score[1].ev[0];
    const s = buildSchedule(d);
    expect(s.marks).toEqual([
      { evId: a.id, start: 0 },
      { evId: rest.id, start: 12 },
      { evId: c.id, start: 24 },          // a tie chain keeps one mark, on its first note
      { evId: barRest.id, start: 48 },
    ]);
    expect(s.notes).toHaveLength(2);      // rests stay silent
  });

  it('the sample song has a mark for every sounded note', () => {
    const s = buildSchedule(sampleDoc('xc'));
    expect(s.marks.length).toBeGreaterThanOrEqual(s.notes.length);
    expect(s.marks.map(m => m.start)).toEqual([...s.marks.map(m => m.start)].sort((x, y) => x - y));
  });

  it('no repeats: plays straight through', () => {
    const d = mkDoc([{ ev: [[60, 24], [62, 24]] }, { ev: [[64, 48]] }]);
    const s = buildSchedule(d);
    expect(s.totalTicks).toBe(d.score[0].cap + d.score[1].cap);
    expect(s.notes.map(n => n.midi)).toEqual([60, 62, 64]);
    expect(s.notes.map(n => n.start)).toEqual([0, 24, 48]);
  });

  it('repeat without voltas plays the section twice', () => {
    const d = mkDoc([
      { rs: true, ev: [[60, 48]] },
      { re: true, ev: [[62, 48]] },
      { ev: [[64, 48]] },
    ]);
    const s = buildSchedule(d);
    expect(s.notes.map(n => n.midi)).toEqual([60, 62, 60, 62, 64]);
    expect(s.totalTicks).toBe(5 * 48);
  });

  it('second pass skips the first ending and plays the second', () => {
    const d = mkDoc([
      { rs: true, ev: [[60, 48]] },
      { re: true, volta: '1', ev: [[62, 48]] },
      { volta: '2', ev: [[64, 48]] },
    ]);
    expect(buildSchedule(d).notes.map(n => n.midi)).toEqual([60, 62, 60, 64]);
  });

  it('a tie cut by a jump ends at the bar line; the next bar restarts', () => {
    const d = mkDoc([
      { rs: true, ev: [[60, 48, { tie: true }]] },
      { re: true, volta: '1', ev: [[60, 48]] },
      { volta: '2', ev: [[60, 48]] },
    ]);
    const s = buildSchedule(d);
    // pass 1: bars 0 and 1 merge; pass 2: bar 0 stays alone, bar 2 starts a new note
    expect(s.notes.map(n => [n.start, n.dur])).toEqual([[0, 96], [96, 48], [144, 48]]);
  });

  it('a tie out of the first-ending bar is cut by the jump back', () => {
    const d = mkDoc([
      { rs: true, ev: [[60, 48]] },
      { re: true, volta: '1', ev: [[62, 48, { tie: true }]] },
      { volta: '2', ev: [[64, 48]] },
    ]);
    d.score[0].ev[0].m = 62; // the jump target starts on the tied pitch
    const s = buildSchedule(d);
    expect(s.notes.map(n => [n.midi, n.start, n.dur])).toEqual([[62, 0, 48], [62, 48, 48], [62, 96, 48], [64, 144, 48]]);
  });

  it('a repeat without a start mark jumps back to bar 0', () => {
    const d = mkDoc([{ ev: [[60, 48]] }, { re: true, ev: [[62, 48]] }]);
    expect(buildSchedule(d).notes.map(n => n.midi)).toEqual([60, 62, 60, 62]);
  });

  it('three endings: each repeat end jumps back once, ending n plays on pass n', () => {
    // MusicXML endings 1, 2, 3: ending 3 has no volta in the doc.
    const d = mkDoc([
      { ev: [[60, 48]] },
      { re: true, volta: '1', ev: [[62, 48]] },
      { re: true, volta: '2', ev: [[64, 48]] },
      { ev: [[65, 48]] },
    ]);
    expect(buildSchedule(d).notes.map(n => n.midi)).toEqual([60, 62, 60, 64, 60, 65]);
  });

  it('a second section without a start mark repeats once and ends', () => {
    const d = mkDoc([
      { rs: true, ev: [[60, 48]] },
      { re: true, volta: '1', ev: [[62, 48]] },
      { volta: '2', ev: [[64, 48]] },
      { ev: [[65, 48]] },
      { re: true, ev: [[67, 48]] },
    ]);
    // after the endings the next repeat goes back to the bar after the second ending
    expect(buildSchedule(d).notes.map(n => n.midi)).toEqual([60, 62, 60, 64, 65, 67, 65, 67]);
  });
});

describe('firstTickOf', () => {
  const d = mkDoc([
    { ev: [[60, 12], [0, 12], [62, 12, { tie: true }], [62, 12]] },
    { rs: true, ev: [[64, 48]] },
    { re: true, ev: [[65, 24], [67, 24]] },
    { ev: [[69, 48]] },
  ]);
  const [a, rest, , cont] = d.score[0].ev;
  const inRepeat = d.score[2].ev[1];

  it('a plain note, a rest and a tied continuation start at their own tick', () => {
    expect(firstTickOf(d, a.id)).toBe(0);
    expect(firstTickOf(d, rest.id)).toBe(12);
    expect(firstTickOf(d, cont.id)).toBe(36);
  });

  it('an event inside a repeated section starts at its first pass', () => {
    expect(firstTickOf(d, inRepeat.id)).toBe(48 + 48 + 24);
    expect(firstTickOf(d, d.score[3].ev[0].id)).toBe(48 + 2 * 96);
  });

  it('an unknown id is null', () => {
    expect(firstTickOf(d, 'nope')).toBeNull();
  });
});

describe('sliceSchedule', () => {
  const d = mkDoc([
    { ev: [[60, 12], [0, 12], [62, 12, { tie: true }], [62, 12]] },
    { ev: [[64, 24, { tie: true }], [64, 12], [65, 12]] },
  ]);
  const [a, rest, c, cont] = d.score[0].ev;
  const [e, eCont, f] = d.score[1].ev;
  const s = buildSchedule(d);

  it('from 0 returns an equal schedule', () => {
    expect(sliceSchedule(s, 0)).toEqual(s);
  });

  it('on a note boundary: earlier notes dropped, later ones shifted', () => {
    const out = sliceSchedule(s, 48);
    expect(out.notes).toEqual([
      { evId: e.id, start: 0, dur: 36, midi: 64 },
      { evId: f.id, start: 36, dur: 12, midi: 65 },
    ]);
    expect(out.marks).toEqual([{ evId: e.id, start: 0 }, { evId: f.id, start: 36 }]);
    expect(out.totalTicks).toBe(48);
  });

  it('in the middle of a tie chain: the held note sounds for its remainder, its mark moves to 0', () => {
    const out = sliceSchedule(s, firstTickOf(d, eCont.id)!);
    expect(out.notes[0]).toEqual({ evId: e.id, start: 0, dur: 12, midi: 64 });
    expect(out.marks[0]).toEqual({ evId: e.id, start: 0 });
    expect(out.totalTicks).toBe(24);
    const inBar = sliceSchedule(s, firstTickOf(d, cont.id)!);
    expect(inBar.notes[0]).toEqual({ evId: c.id, start: 0, dur: 12, midi: 62 });
  });

  it('on a rest: the rest is the first mark, the next note follows it', () => {
    const out = sliceSchedule(s, firstTickOf(d, rest.id)!);
    expect(out.marks[0]).toEqual({ evId: rest.id, start: 0 });
    expect(out.notes[0]).toEqual({ evId: c.id, start: 12, dur: 24, midi: 62 });
    expect(out.notes.some(n => n.evId === a.id)).toBe(false);
  });

  it('on the last event', () => {
    const out = sliceSchedule(s, firstTickOf(d, f.id)!);
    expect(out.notes).toEqual([{ evId: f.id, start: 0, dur: 12, midi: 65 }]);
    expect(out.marks).toEqual([{ evId: f.id, start: 0 }]);
    expect(out.totalTicks).toBe(12);
  });

  it('repeats after the start point are kept (sample song from bar 2)', () => {
    const doc = sampleDoc('xc');
    const full = buildSchedule(doc);
    const id = doc.score[2].ev[0].id;              // a tied continuation of the long note in bar 1
    const from = firstTickOf(doc, id)!;
    expect(from).toBe(36 + 48);
    const out = sliceSchedule(full, from);
    expect(out.totalTicks).toBe(262 * 6 - 84);
    expect(out.notes).toHaveLength(73 - 5);         // the pickup's four notes and bar 1's first note end before
    expect(out.notes[0]).toEqual({ evId: doc.score[1].ev[1].id, start: 0, dur: 12, midi: full.notes[5].midi });
    expect(out.marks).toHaveLength(68);
    // the second pass of the repeat is still there: bar 1's first note sounds again later
    expect(out.notes.filter(n => n.evId === doc.score[1].ev[0].id)).toHaveLength(1);
  });
});

/** Bars of one whole note each, named A, B, C … by position. */
type Mark = Omit<BarSpec, 'ev'>;
const tune = (...bars: Mark[]): Doc => mkDoc(bars.map(b => ({ ev: [[60, 48]], ...b })));
const order = (d: Doc): string => playOrder(d).map(i => String.fromCharCode(65 + i)).join('');
const withoutJump = (d: Doc): Doc => ({ ...d, score: d.score.map(({ jump: _jump, ...bar }) => bar) });

describe('playOrder without marks', () => {
  it('plays a straight song, a repeat and a repeat with two endings as before', () => {
    expect(order(tune({}, {}, {}))).toBe('ABC');
    expect(order(tune({ rs: true }, { re: true }, {}))).toBe('ABABC');
    expect(order(tune({ rs: true }, { volta: '1', re: true }, { volta: '2' }, {}))).toBe('ABACD');
  });
});

describe('playOrder with jumps', () => {
  it('D.C. al Fine stops at the Fine', () => {
    expect(order(tune({}, { fine: true }, {}, { jump: 'dcFine' }))).toBe('ABCDAB');
  });

  it('D.C. al Coda continues at the Coda', () => {
    expect(order(tune({}, { toCoda: true }, {}, { jump: 'dcCoda' }, { coda: true }, {}))).toBe('ABCDABEF');
  });

  it('D.S. returns to the Segno; with a Fine it stops there', () => {
    expect(order(tune({}, { segno: true }, {}, { jump: 'ds' }))).toBe('ABCDBCD');
    expect(order(tune({}, { segno: true }, { fine: true }, { jump: 'ds' }))).toBe('ABCDBC');
    expect(order(tune({}, { segno: true }, { fine: true }, { jump: 'dsFine' }))).toBe('ABCDBC');
  });

  it('D.S. al Coda jumps at the To Coda to the Coda', () => {
    expect(order(tune({}, { segno: true }, { toCoda: true }, { jump: 'dsCoda' }, { coda: true }))).toBe('ABCDBCE');
  });

  it('a plain D.C. without a Fine runs to the end; with a Fine it stops at the Fine', () => {
    expect(order(tune({}, {}, { jump: 'dc' }, {}))).toBe('ABCABCD');
    expect(order(tune({}, { fine: true }, { jump: 'dc' }, {}))).toBe('ABCAB');
  });

  it('plays a repeat with endings before the jump, then only the last ending', () => {
    const d = tune({ rs: true }, { volta: '1', re: true }, { volta: '2' }, { jump: 'dc' });
    expect(order(d)).toBe('ABACDACD');
  });

  it('takes the repeat of the jump bar first, then the jump, and no repeat after it', () => {
    expect(order(tune({ rs: true }, { re: true, jump: 'dc' }))).toBe('ABABAB');
  });

  it('plays the repeat of a Coda after D.C. al Coda, and its endings', () => {
    expect(order(tune({ segno: true }, { toCoda: true }, { jump: 'dsCoda' }, { rs: true, coda: true }, { re: true }, {}))).toBe('ABCABDEDEF');
    expect(order(tune({ segno: true }, { toCoda: true }, { jump: 'dsCoda' }, { rs: true, coda: true }, { volta: '1', re: true }, { volta: '2' }))).toBe('ABCABDEDF');
  });

  it('plays the repeat of the bars after a plain jump bar, and not those before it', () => {
    expect(order(tune({}, { jump: 'dc' }, { rs: true }, { re: true }))).toBe('ABABCDCD');
    expect(order(tune({ rs: true }, { re: true }, { jump: 'dc' }, {}))).toBe('ABABCABCD');
  });

  it('D.C. goes back to a pickup bar', () => {
    const d = mkDoc([{ ev: [[60, 24]] }, { ev: [[62, 48]] }, { ev: [[64, 48]], jump: 'dc' }]);
    expect(order(d)).toBe('ABCABC');
  });

  it('takes the jump once', () => {
    expect(order(tune({ segno: true, jump: 'ds' }))).toBe('AA');
  });

  it('cuts a tie at the jump and at the step from To Coda to the Coda', () => {
    const d = mkDoc([
      { ev: [[60, 48]] },
      { ev: [[62, 48, { tie: true }]], toCoda: true },
      { ev: [[62, 48]], jump: 'dcCoda' },
      { ev: [[62, 48]], coda: true },
    ]);
    expect(order(d)).toBe('ABCABD');
    // first pass: A, B tied into C; second pass: A, then B and the Coda D apart although both are 62
    expect(buildSchedule(d).notes.map(n => n.dur)).toEqual([48, 96, 48, 48, 48]);
  });

  it('ignores the jump of a document with a problem', () => {
    const d = tune({}, {}, { jump: 'ds' });
    expect(jumpProblems(d)).toHaveLength(1);
    expect(order(d)).toBe(order(withoutJump(d)));
    expect(order(d)).toBe('ABC');
  });
});

describe('playOrder is total', () => {
  it('ends within the cap and stays inside the score for random small documents', () => {
    let seed = 12345;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const jumps = ['dc', 'dcFine', 'dcCoda', 'ds', 'dsFine', 'dsCoda'] as const;
    for (let run = 0; run < 400; run++) {
      const n = 1 + rnd(8);
      const d = tune(...Array.from({ length: n }, (): Mark => ({
        ...(rnd(4) === 0 && { rs: true }), ...(rnd(4) === 0 && { re: true }),
        volta: (['', '', '1', '2'] as const)[rnd(4)],
        ...(rnd(5) === 0 && { segno: true as const }), ...(rnd(5) === 0 && { coda: true as const }),
        ...(rnd(5) === 0 && { fine: true as const }), ...(rnd(5) === 0 && { toCoda: true as const }),
        ...(rnd(3) === 0 && { jump: jumps[rnd(6)] }),
      })));
      const o = playOrder(d);
      expect(o.length).toBeLessThanOrEqual(4 * n);
      expect(o.every(i => Number.isInteger(i) && i >= 0 && i < n)).toBe(true);
      expect(buildSchedule(d).totalTicks).toBe(o.length * 48);
    }
  });

  it('a jump on every bar, and several marks on one bar, do not loop', () => {
    const all = tune(...Array.from({ length: 5 }, (): Mark => ({ jump: 'dc' })));
    expect(order(all)).toBe('ABCDE');
    const one = tune({ segno: true, coda: true, fine: true, toCoda: true, jump: 'dsCoda' });
    expect(playOrder(one).length).toBeLessThanOrEqual(4);
  });
});
