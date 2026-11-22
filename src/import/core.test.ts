import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../domain/transpose';
import { DURATIONS } from '../domain/time';
import type { Bar } from '../domain/types';
import { toBars } from './bars';
import { buildDoc, type BuildOptions } from './buildDoc';
import { estimateKey } from './keyfind';
import { monophonic, quantise } from './quantise';
import { ImportError, type ParsedSong, type RawNote } from './types';

const n = (start: number, dur: number, midi = 60): RawNote => ({ start, dur, midi });

function mkSong(notes: RawNote[], extra: { file?: string; lyrics?: { at: number; text: string }[]; chords?: { at: number; text: string }[]; key?: ParsedSong['key'] } = {}): ParsedSong {
  return {
    file: extra.file ?? 'song.mid', format: 'MIDI', timeSig: [4, 4], tempo: 100, key: extra.key ?? null, pickup: 0, marks: [],
    tracks: [{ id: 't1', name: 'Melody', instrument: 'Flute', channel: 0, percussion: false, notes, lyrics: extra.lyrics ?? [], chords: extra.chords ?? [] }],
  };
}
const opts = (o: Partial<BuildOptions> = {}): BuildOptions =>
  ({ trackId: 't1', keep: 'top', lyricsFrom: null, chordsFrom: null, instId: 'fl', prefs: DEFAULT_PREFS, ...o });

const sums = (bars: Bar[]) => bars.every(b => b.ev.reduce((s, e) => s + e.d, 0) === b.cap && b.ev.every(e => DURATIONS.includes(e.d as 48)));

describe('quantise', () => {
  it('quantises to sixteenths and reports rounding', () => {
    expect(quantise([n(0, 1), n(1, 0.5)])).toEqual({ notes: [{ start: 0, dur: 12, midi: 60 }, { start: 12, dur: 6, midi: 60 }], simplified: false });
    const t = quantise([n(0, 1 / 3), n(1 / 3, 1 / 3), n(2 / 3, 1 / 3)]); // eighth triplet
    expect(t.simplified).toBe(true);
    expect(t.notes.every(q => q.start % 3 === 0 && q.dur % 3 === 0 && q.dur >= 3)).toBe(true);
  });
  it('gives very short notes one grid step', () => {
    expect(quantise([n(0, 0.01)]).notes[0].dur).toBe(3);
  });
});

describe('monophonic', () => {
  it('keeps the top or bottom note of a chord', () => {
    const chord = [{ start: 0, dur: 12, midi: 60 }, { start: 0, dur: 12, midi: 67 }];
    expect(monophonic(chord, 'top')).toEqual([{ start: 0, dur: 12, midi: 67 }]);
    expect(monophonic(chord, 'bottom')).toEqual([{ start: 0, dur: 12, midi: 60 }]);
  });
  it('cuts an overlapping earlier note at the next onset', () => {
    expect(monophonic([{ start: 0, dur: 24, midi: 60 }, { start: 12, dur: 12, midi: 62 }], 'top'))
      .toEqual([{ start: 0, dur: 12, midi: 60 }, { start: 12, dur: 12, midi: 62 }]);
  });
});

describe('toBars', () => {
  it('bars always sum to cap', () => {
    const bars = toBars([{ start: 6, dur: 60, midi: 60 }, { start: 75, dur: 3, midi: 62 }], [4, 4], 0, []);
    expect(sums(bars)).toBe(true);
    expect(bars).toHaveLength(2);
    expect(bars[0].ev[0]).toMatchObject({ r: true, d: 6 });
    expect(bars[0].ev[bars[0].ev.length - 1].tie).toBe(true); // tied over the bar line
    expect(bars[1].ev[0]).toMatchObject({ r: false, m: 60 });
  });
  it('pickup bar and 3/4', () => {
    const bars = toBars([{ start: 0, dur: 12, midi: 60 }, { start: 12, dur: 36, midi: 62 }], [3, 4], 12, []);
    expect(bars.map(b => b.cap)).toEqual([12, 36]);
    expect(sums(bars)).toBe(true);
  });
  it('fills an empty middle bar with one rest and drops trailing empty bars', () => {
    const bars = toBars([{ start: 0, dur: 12, midi: 60 }, { start: 96, dur: 12, midi: 62 }], [4, 4], 0, []);
    expect(bars).toHaveLength(3);
    expect(bars[1].ev).toHaveLength(1);
    expect(bars[1].ev[0]).toMatchObject({ r: true, d: 48, m: 60 });
  });
  it('rests before any note use pitch 60; every event has a unique id', () => {
    const bars = toBars([{ start: 12, dur: 12, midi: 70 }], [4, 4], 0, []);
    expect(bars[0].ev[0]).toMatchObject({ r: true, m: 60 });
    const ids = bars.flatMap(b => b.ev.map(e => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('repeat marks land on bars', () => {
    const notes = [{ start: 0, dur: 48, midi: 60 }, { start: 48, dur: 48, midi: 62 }];
    const bars = toBars(notes, [4, 4], 0, [{ bar: 0, rs: true }, { bar: 1, re: true, volta: '1' }, { bar: 9, re: true }]);
    expect(bars[0]).toMatchObject({ rs: true, re: false, volta: '' });
    expect(bars[1]).toMatchObject({ rs: false, re: true, volta: '1' });
  });
  it('splits 6/8 notes into allowed durations', () => {
    const bars = toBars([{ start: 0, dur: 60, midi: 60 }], [6, 8], 0, []);
    expect(bars.map(b => b.cap)).toEqual([36, 36]);
    expect(sums(bars)).toBe(true);
  });
});

describe('estimateKey', () => {
  const scale = (pcs: number[]) => pcs.map((p, i) => n(i, i === 0 || i === pcs.length - 1 ? 2 : 1, 60 + p));
  it('estimates major and minor', () => {
    expect(estimateKey(scale([0, 2, 4, 5, 7, 9, 11, 12, 7, 4, 0]))).toEqual({ tonicPc: 0, mode: 'major' });
    expect(estimateKey(scale([9, 11, 12, 14, 16, 17, 20, 21, 16, 12, 9]))).toEqual({ tonicPc: 9, mode: 'minor' });
  });
});

describe('buildDoc', () => {
  it('overlapping polyphonic track still gives valid bars', () => {
    const song = mkSong([n(0, 2.5, 60), n(0, 1, 64), n(1, 1.7, 67), n(2.2, 0.4, 72)]);
    const doc = buildDoc(song, opts());
    expect(sums(doc.score)).toBe(true);
    expect(doc.score.flatMap(b => b.ev).length).toBeGreaterThan(0);
  });
  it('lyrics, title, key, shift', () => {
    const song = mkSong([n(0, 1, 62), n(1, 1, 64), n(2, 2, 66)], { file: 'My_Song.mid', lyrics: [{ at: 0, text: 'Oh' }, { at: 1, text: 'love' }], key: { tonicPc: 2, mode: 'major' } });
    const doc = buildDoc(song, opts({ lyricsFrom: 't1' }));
    expect(doc.title).toBe('My Song');
    expect(doc.score[0].ev.map(e => e.l)).toEqual(['Oh', 'love', '']);
    expect(doc.originalTonicPc).toBe(2);
    expect(doc.source.simplified).toBe(false);
    expect(doc).toMatchObject({ subtitle: '', chartStyle: 'compact', recorderSystem: 'baroque', tempo: 100, inst: 'fl', fingering: {} });
    expect(doc.source).toEqual({ file: 'My_Song.mid', format: 'MIDI', track: 'Melody', trackCount: 1, simplified: false });
  });
  it('lyric snaps to the nearest note start within 3 ticks and ignores far ones', () => {
    const song = mkSong([n(0, 1, 62), n(1, 1, 64)], { lyrics: [{ at: 1.2, text: 'near' }, { at: 0.5, text: 'far' }] });
    const doc = buildDoc(song, opts({ lyricsFrom: 't1' }));
    expect(doc.score[0].ev.map(e => e.l)).toEqual(['', 'near', '']);
  });
  it('lyrics skip rests and tied continuations', () => {
    const song = mkSong([n(1, 5, 62)], { lyrics: [{ at: 0, text: 'a' }, { at: 4, text: 'b' }, { at: 1, text: 'c' }] });
    const doc = buildDoc(song, opts({ lyricsFrom: 't1' }));
    const ls = doc.score.flatMap(b => b.ev).map(e => e.l);
    expect(ls.filter(Boolean)).toEqual(['c']);
  });
  it('file chords land on the event sounding at that tick', () => {
    const song = mkSong([n(0, 2, 62), n(2, 2, 64)], { chords: [{ at: 1, text: 'D' }, { at: 2, text: 'G' }], key: { tonicPc: 2, mode: 'major' } });
    const doc = buildDoc(song, opts({ chordsFrom: 'file' }));
    const [a, b] = doc.score[0].ev;
    expect(a.c).toBe('D');
    expect(b.c).toBe('G');
    expect(doc.chords[a.id]).toMatchObject({ raw: 'D', ok: true, tk: 0 });
    expect(Object.keys(doc.chords)).toHaveLength(2);
  });
  it('no chords unless asked; a track id gives none yet', () => {
    const song = mkSong([n(0, 4, 62)], { chords: [{ at: 0, text: 'D' }] });
    expect(buildDoc(song, opts()).chords).toEqual({});
    expect(buildDoc(song, opts({ chordsFrom: 't1' })).chords).toEqual({});
  });
  it('estimates the key when the file has none; clamps tempo; flags simplified', () => {
    const song = mkSong([n(0, 1 / 3, 60), n(1 / 3, 1 / 3, 62), n(2 / 3, 1 / 3, 64)]);
    song.tempo = 300;
    const doc = buildDoc(song, opts());
    expect(doc.tempo).toBe(200);
    expect(doc.source.simplified).toBe(true);
    expect(doc.originalMode === 'major' || doc.originalMode === 'minor').toBe(true);
    song.tempo = 12.4;
    expect(buildDoc(song, opts()).tempo).toBe(40);
  });
  it('pickup and marks reach the score', () => {
    const song = mkSong([n(0, 1, 60), n(1, 4, 62), n(5, 4, 64)]);
    song.pickup = 1;
    song.marks = [{ bar: 1, rs: true }];
    const doc = buildDoc(song, opts());
    expect(doc.score.map(b => b.cap)).toEqual([12, 48, 48]);
    expect(doc.score[1].rs).toBe(true);
  });
  it('empty track is refused', () => {
    expect(() => buildDoc(mkSong([]), opts())).toThrow(ImportError);
    try { buildDoc(mkSong([]), opts()); } catch (e) { expect((e as ImportError).userMessage).toBe('"Melody" has no notes.'); }
  });
});
