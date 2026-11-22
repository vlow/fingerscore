import { inst, ORDER } from './instruments';
import type { Spelled } from './keys';
import { buildScale, isKeyTransposing, isMinorType, keyChips, scaleName, SCALE_IDS, type ScaleDirection, type ScaleId, type ScaleRange, type ScaleResult } from './scales';
import type { InstId } from './types';

const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
/** Natural pitch of the letter in that octave plus the alteration. */
const spelledMidi = (s: Spelled) => (s.octave + 1) * 12 + LETTER_PC[s.letter] + s.alter;

const names = (r: ScaleResult) => r.notes.map(n => n.spelled.name.replace(/\d+$/, ''));
const build = (inst: InstId, scale: ScaleId, tonicPc: number, range: ScaleRange = 'one', direction: ScaleDirection = 'up') =>
  buildScale({ inst, scale, tonicPc, range, direction });

it('check 10a: A harmonic minor contains G♯', () => {
  const r = build('fl', 'hmin', 9);
  expect(names(r)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G♯', 'A']);
  expect(r.sig).toBe(0);
  expect(r.tonic).toBe('A');
  expect(r.notes.map(n => n.accidental)).toEqual([null, null, null, null, null, null, 'sharp', null]);
});

it('check 10b: E blues = E G A B♭ B D', () => {
  const r = build('fl', 'blues', 4);
  expect(names(r)).toEqual(['E', 'G', 'A', 'B♭', 'B', 'D', 'E']);
  expect(r.sig).toBe(1);
  expect(r.notes.map(n => n.accidental)).toEqual([null, null, null, 'flat', 'natural', null, null]);
});

it('check 10c: C chromatic up with sharps, down with flats', () => {
  const r = build('fl', 'chrom', 0, 'one', 'updown');
  expect(names(r).slice(0, 13)).toEqual(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C']);
  expect(names(r).slice(13)).toEqual(['B', 'B♭', 'A', 'A♭', 'G', 'G♭', 'F', 'E', 'E♭', 'D', 'D♭', 'C']);
  expect(r.sig).toBe(0);
  expect(r.notes[12].ascending).toBe(true);
  expect(r.notes[13].ascending).toBe(false);
});

it('chromatic in a flat key ascends with flats', () => {
  expect(names(build('fl', 'chrom', 5)).slice(0, 4)).toEqual(['F', 'G♭', 'G', 'A♭']);
});

it('melodic minor descends as natural minor', () => {
  const r = build('fl', 'mmin', 9, 'one', 'updown');
  expect(names(r)).toEqual(['A', 'B', 'C', 'D', 'E', 'F♯', 'G♯', 'A', 'G', 'F', 'E', 'D', 'C', 'B', 'A']);
  expect(r.notes[8].accidental).toBe('natural');
  expect(r.notes[9].accidental).toBe('natural');
});

it('double sharp: G♯ harmonic minor has F𝄪 (review focus 1)', () => {
  const r = build('fl', 'hmin', 8);
  expect(r.tonic).toBe('G♯');
  expect(names(r)).toEqual(['G♯', 'A♯', 'B', 'C♯', 'D♯', 'E', 'F𝄪', 'G♯']);
  expect(r.sig).toBe(5);
  expect(r.notes[6].accidental).toBe('doubleSharp');
  expect(r.notes[6].spelled.alter).toBe(2);
});

it('flat keys keep their letters: G♭ major has C♭, E♭ minor has C♭', () => {
  expect(names(build('fl', 'maj', 6))).toEqual(['G♭', 'A♭', 'B♭', 'C♭', 'D♭', 'E♭', 'F', 'G♭']);
  expect(build('fl', 'maj', 6).sig).toBe(-6);
  expect(names(build('fl', 'nmin', 3))).toEqual(['E♭', 'F', 'G♭', 'A♭', 'B♭', 'C♭', 'D♭', 'E♭']);
  const cb = build('fl', 'maj', 6).notes[3];
  expect(cb.written % 12).toBe(11);
  expect(cb.accidental).toBeNull();
});

it('pentatonics', () => {
  expect(names(build('fl', 'pmaj', 0))).toEqual(['C', 'D', 'E', 'G', 'A', 'C']);
  expect(names(build('fl', 'pmin', 9))).toEqual(['A', 'C', 'D', 'E', 'G', 'A']);
});

it('starts on the lowest tonic at or above the lowest note', () => {
  expect(build('asax', 'maj', 0).notes[0].written).toBe(60);
  expect(build('asax', 'maj', 10).notes[0].written).toBe(58);
  expect(build('asax', 'maj', 9).notes[0].written).toBe(69);
  expect(build('cl', 'maj', 4).notes[0].written).toBe(52);
});

it('two octaves and the amber notice', () => {
  const r = build('asax', 'maj', 7, 'two');
  expect(r.notes[0].written).toBe(67);
  expect(r.notes[r.notes.length - 1].written).toBe(91);
  expect(r.notes.filter(n => n.state === 'ext').length).toBeGreaterThan(0);
  expect(r.notice).toBe('Notes above F6 need extended fingerings and are marked amber. Try 1 octave or another key for an easier scale.');
});

it('a scale that does not fit is cut at the top (review focus 2)', () => {
  const r = build('xc', 'maj', 11, 'two');   // Xaphoon C4–C6: B4 + 24 = B6
  expect(r.notes[0].written).toBe(71);
  expect(Math.max(...r.notes.map(n => n.written))).toBeLessThanOrEqual(84);
  expect(r.notice).toBe('The second octave does not fit this instrument. Shown up to C6, the top of the extended range.');
  expect(r.notes.every(n => n.state === 'ok')).toBe(true);
});

it('one octave within the normal range has no notice; whole range has none either', () => {
  expect(build('xc', 'maj', 11, 'one').notice).toBeNull();
  expect(build('asax', 'maj', 7, 'all').notice).toBeNull();
});

it('minor-type scales', () => {
  expect(SCALE_IDS.filter(isMinorType)).toEqual(['nmin', 'hmin', 'mmin', 'pmin', 'blues']);
});

it('whole range: every instrument, scale and key (review focus 3)', () => {
  for (const id of ORDER) for (const sc of SCALE_IDS) for (let pc = 0; pc < 12; pc++) {
    const r = build(id, sc, pc, 'all');
    const w = r.notes.map(n => n.written);
    expect(w.length, `${id} ${sc} ${pc}`).toBeGreaterThan(0);
    expect(w).toEqual([...w].sort((a, b) => a - b));
    expect(w[0]).toBeGreaterThanOrEqual(inst(id).lo);
    expect(w[w.length - 1]).toBeLessThanOrEqual(inst(id).hi);
    for (const n of r.notes) {
      expect(Math.abs(n.spelled.alter)).toBeLessThanOrEqual(2);
      expect(spelledMidi(n.spelled)).toBe(n.written);
    }
  }
});

it('one and two octaves, up and down: every instrument, scale and key stays within lo..ext and spells correctly', () => {
  for (const id of ORDER) for (const sc of SCALE_IDS) for (let pc = 0; pc < 12; pc++) for (const range of ['one', 'two'] as const) {
    const r = build(id, sc, pc, range, 'updown');
    const w = r.notes.map(n => n.written);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(inst(id).lo);
    expect(Math.max(...w)).toBeLessThanOrEqual(inst(id).ext);
    expect(w[w.length - 1]).toBe(w[0]);
    for (const n of r.notes) {
      expect(Math.abs(n.spelled.alter)).toBeLessThanOrEqual(2);
      expect(spelledMidi(n.spelled)).toBe(n.written);
    }
  }
});

it('up and down ends where it started and does not repeat the top', () => {
  const r = build('fl', 'maj', 0, 'one', 'updown');
  const w = r.notes.map(n => n.written);
  expect(w.length).toBe(15);
  expect(w[14]).toBe(w[0]);
  expect(w[7]).toBe(72);
  expect(w[8]).toBe(71);
});

it('octave of a spelled note follows its letter: B♯4 = MIDI 72, C♭5 = MIDI 71', () => {
  const cs = build('fl', 'hmin', 1);   // C♯ harmonic minor from C♯4: leading note B♯4
  const bs = cs.notes[6];
  expect(bs.spelled.name).toBe('B♯4');
  expect(bs.written).toBe(72);
  const gb = build('fl', 'maj', 6).notes[3];
  expect(gb.spelled.name).toBe('C♭5');
  expect(gb.written).toBe(71);
});

it('key chips', () => {
  const read = keyChips('asax', 'maj', 'read');
  expect(read).toHaveLength(12);
  expect(read[0]).toMatchObject({ written: 'C', concert: 'E♭', writtenPc: 0, concertPc: 3 });
  const sound = keyChips('asax', 'maj', 'sound');
  expect(sound[0]).toMatchObject({ concert: 'C', written: 'A', concertPc: 0, writtenPc: 9 });
  expect(keyChips('asax', 'hmin', 'read')[8].written).toBe('G♯');
  expect(isKeyTransposing('asax')).toBe(true);
  expect(isKeyTransposing('picc')).toBe(false);
  expect(isKeyTransposing('fl')).toBe(false);
});

it('scale names', () => {
  expect(SCALE_IDS.map(scaleName)).toEqual(['major', 'natural minor', 'harmonic minor', 'melodic minor', 'major pentatonic', 'minor pentatonic', 'blues', 'chromatic']);
});
