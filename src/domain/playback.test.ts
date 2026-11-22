import { describe, it, expect } from 'vitest';
import { sampleDoc } from './fixture';
import { buildSchedule, firstTickOf, sliceSchedule, ticksToSeconds } from './playback';
import { mkDoc } from '../test/helpers';

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
