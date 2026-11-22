import { describe, it, expect } from 'vitest';
import { sampleDoc } from './fixture';
import { buildSchedule, ticksToSeconds } from './playback';
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
      { rs: true, ev: [[60, 48]] },
      { re: true, volta: '1', ev: [[62, 48, { tie: true }]] },
      { volta: '2', ev: [[62, 48]] },
    ]);
    const s = buildSchedule(d);
    expect(s.notes.map(n => [n.midi, n.dur])).toEqual([[60, 48], [62, 48], [60, 48], [62, 48]]);
  });

  it('a repeat without a start mark jumps back to bar 0', () => {
    const d = mkDoc([{ ev: [[60, 48]] }, { re: true, ev: [[62, 48]] }]);
    expect(buildSchedule(d).notes.map(n => n.midi)).toEqual([60, 62, 60, 62]);
  });
});
