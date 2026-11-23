import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../domain/transpose';
import { DURATIONS } from '../domain/time';
import { tripletGroups } from '../domain/triplets';
import type { Bar } from '../domain/types';
import { expectValidBars } from '../test/validBars';
import { toBars as toBarsRaw } from './bars';
import { buildDoc as buildDocRaw, type BuildOptions } from './buildDoc';
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

/** toBars and buildDoc, with every bar they produce checked for validity. */
function toBars(...args: Parameters<typeof toBarsRaw>): Bar[] {
  const out = toBarsRaw(...args);
  expectValidBars(out.bars, args[1]);
  return out.bars;
}
function buildDoc(song: ParsedSong, o: BuildOptions) {
  const doc = buildDocRaw(song, o);
  expectValidBars(doc.score, doc.timeSig);
  return doc;
}

const sums = (bars: Bar[]) => bars.every(b => b.ev.reduce((s, e) => s + e.d, 0) === b.cap && b.ev.every(e => DURATIONS.includes(e.d as 48)));

describe('quantise', () => {
  it('snaps to whole ticks within 0.02 quarter, otherwise to sixteenths and reports rounding', () => {
    expect(quantise([n(0, 1), n(1, 0.5)])).toEqual({ notes: [{ start: 0, dur: 12, midi: 60 }, { start: 12, dur: 6, midi: 60 }], simplified: false });
    const t = quantise([n(0, 1 / 3), n(1 / 3, 1 / 3), n(2 / 3, 1 / 3)]); // eighth triplet
    expect(t).toEqual({ notes: [{ start: 0, dur: 4, midi: 60 }, { start: 4, dur: 4, midi: 60 }, { start: 8, dur: 4, midi: 60 }], simplified: false });
    expect(quantise([n(0.345, 0.5)])).toEqual({ notes: [{ start: 4, dur: 6, midi: 60 }], simplified: false });   // 0.012 off 1/3
    const off = quantise([n(0.354, 0.5)]);                                                                      // 0.021 off 1/3
    expect(off.simplified).toBe(true);
    expect(off.notes[0].start).toBe(3);
  });
  it('keeps very short notes at least one tick long', () => {
    expect(quantise([n(0, 0.01)]).notes[0].dur).toBe(1);
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

describe('regressions', () => {
  it('monophonic: three notes on one onset', () => {
    const three = [{ start: 0, dur: 12, midi: 64 }, { start: 0, dur: 12, midi: 72 }, { start: 0, dur: 12, midi: 60 }];
    expect(monophonic(three, 'top')).toEqual([{ start: 0, dur: 12, midi: 72 }]);
    expect(monophonic(three, 'bottom')).toEqual([{ start: 0, dur: 12, midi: 60 }]);
  });
  it('toBars: a note spanning two bar lines', () => {
    const bars = toBars([{ start: 12, dur: 108, midi: 60 }], [4, 4], 0, []);
    expect(bars).toHaveLength(3);
    expect(sums(bars)).toBe(true);
    const notes = bars.flatMap(b => b.ev).filter(e => !e.r);
    expect(notes.slice(0, -1).every(e => e.tie)).toBe(true);
    expect(notes[notes.length - 1].tie).toBe(false);
    expect(bars[1].ev.every(e => !e.r && e.tie)).toBe(true);
  });
  it('buildDoc: off-grid pickup is snapped and flagged', () => {
    const song = mkSong([n(0, 1 / 3, 60), n(1 / 3, 4, 62)]);
    song.pickup = 1 / 3;
    let doc!: ReturnType<typeof buildDoc>;
    expect(() => { doc = buildDoc(song, opts()); }).not.toThrow();
    expect(sums(doc.score)).toBe(true);
    expect(doc.score[0].cap).toBe(3);
    expect(doc.source.simplified).toBe(true);
  });
  it('buildDoc: a pickup of a full bar or more is no pickup', () => {
    const song = mkSong([n(0, 4, 60), n(4, 4, 62)]);
    song.pickup = 4;
    expect(buildDoc(song, opts()).score.map(b => b.cap)).toEqual([48, 48]);
  });
  it('toBars ignores marks outside the score', () => {
    const bars = toBars([{ start: 0, dur: 12, midi: 60 }], [4, 4], 0, [{ bar: -1, rs: true }, { bar: 5, re: true }]);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ rs: false, re: false });
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
    const doc = buildDoc(song, opts());   // the wrapper checks every bar
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
    expect(doc.imported.lyrics).toEqual({ [doc.score[0].ev[1].id]: 'near' });
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
    expect(doc.imported.chords).toEqual({ [a.id]: 'D', [b.id]: 'G' });
    expect(doc.chords[a.id]).toMatchObject({ raw: 'D', ok: true, tk: 0 });
    expect(Object.keys(doc.chords)).toHaveLength(2);
  });
  it('no chords unless asked; a one-note chord track gives none', () => {
    const song = mkSong([n(0, 4, 62)], { chords: [{ at: 0, text: 'D' }] });
    expect(buildDoc(song, opts()).chords).toEqual({});
    expect(buildDoc(song, opts({ chordsFrom: 't1' })).chords).toEqual({});
  });
  it('estimates the key when the file has none; clamps tempo; flags simplified', () => {
    const song = mkSong([n(0, 0.4, 60), n(0.4, 0.4, 62), n(0.8, 0.4, 64)]);
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
  it('refuses a song whose last note ends past 2000 bars, before building', () => {
    const message = (song: ParsedSong) => { try { buildDoc(song, opts()); return null; } catch (e) { return (e as ImportError).userMessage; } };
    expect(message(mkSong([n(0, 1), n(7999, 1)], { file: 'long.abc' }))).toBeNull();                        // ends with bar 2000
    expect(message(mkSong([n(0, 1), n(8000, 1)], { file: 'long.abc' }))).toBe('"long.abc" is longer than 2000 bars and can\'t be opened.');
    const pickup = { ...mkSong([n(0, 1), n(7999, 1)], { file: 'long.abc' }), pickup: 1 };                     // pickup + 2000 bars
    expect(message(pickup)).toBe('"long.abc" is longer than 2000 bars and can\'t be opened.');
  });
});

describe('toBars rounding', () => {
  it('reports when it rounds a note outside a triplet window', () => {
    const plain = toBarsRaw([{ start: 0, dur: 12, midi: 60 }], [4, 4], 0, []);
    expect(plain.rounded).toBe(false);
    const off = toBarsRaw([{ start: 1, dur: 11, midi: 60 }], [4, 4], 0, []);
    expect(off.rounded).toBe(true);
    expect(off.bars[0].ev.map(e => e.d)).toEqual([12, 36]);
    expectValidBars(off.bars, [4, 4]);
  });
  it('gives a very short note a sixteenth', () => {
    const doc = buildDoc(mkSong([n(0, 0.01), n(1, 1)]), opts());
    expect(doc.score[0].ev.map(e => e.d)).toEqual([3, 9, 12, 24]);
  });
});

describe('triplet recognition', () => {
  /** Bar lengths, rests as "r<d>", tied notes as "<d>t". */
  const shape = (b: Bar) => b.ev.map(e => (e.r ? `r${e.d}` : e.tie ? `${e.d}t` : e.d));
  const build = (notes: RawNote[], o: { pickup?: number; timeSig?: ParsedSong['timeSig'] } = {}) => {
    const song = mkSong(notes);
    song.pickup = o.pickup ?? 0;
    if (o.timeSig) song.timeSig = o.timeSig;
    return buildDoc(song, opts());
  };
  const groups = (b: Bar, full = 48) => (tripletGroups(b, full) ?? []).map(g => ({ start: g.start, span: g.span }));
  const tail = [n(1, 1), n(2, 2)];   // a quarter and a half after a beat-1 figure

  it('three triplet eighths, then a quarter and a half', () => {
    const doc = build([n(0, 1 / 3), n(1 / 3, 1 / 3), n(2 / 3, 1 / 3), ...tail]);
    expect(shape(doc.score[0])).toEqual([4, 4, 4, 12, 24]);
    expect(doc.source.simplified).toBe(false);
  });
  it('long-short and short-long', () => {
    expect(shape(build([n(0, 2 / 3), n(2 / 3, 1 / 3), ...tail]).score[0])).toEqual([8, 4, 12, 24]);
    // The sixteenth-triplet window [0, 6) meets all five conditions and comes first: the second note is split at tick 6.
    expect(shape(build([n(0, 1 / 3), n(1 / 3, 2 / 3), ...tail]).score[0])).toEqual([4, '2t', 6, 12, 24]);
  });
  it('three triplet quarters are one group of 24 without ties', () => {
    const doc = build([n(0, 2 / 3), n(2 / 3, 2 / 3), n(4 / 3, 2 / 3), n(2, 2)]);
    expect(shape(doc.score[0])).toEqual([8, 8, 8, 24]);
    expect(groups(doc.score[0])).toEqual([{ start: 0, span: 24 }]);
  });
  it('six triplet sixteenths in beat 1 are two groups of 6', () => {
    const doc = build([0, 1, 2, 3, 4, 5].map(i => n(i / 6, 1 / 6)).concat(tail));
    expect(shape(doc.score[0])).toEqual([2, 2, 2, 2, 2, 2, 12, 24]);
    expect(groups(doc.score[0])).toEqual([{ start: 0, span: 6 }, { start: 6, span: 6 }]);
  });
  it('eighth, eighth, two sixteenths in triplet values', () => {
    const doc = build([n(0, 1 / 3), n(1 / 3, 1 / 3), n(2 / 3, 1 / 6), n(5 / 6, 1 / 6), ...tail]);
    expect(shape(doc.score[0])).toEqual([4, 4, 2, 2, 12, 24]);
  });
  it('silence inside a group becomes triplet rests', () => {
    // Two sixteenth-triplet windows, [0, 6) and [6, 12), each meet all five conditions before the eighth-triplet window is tried.
    expect(shape(build([n(0, 1 / 3), n(2 / 3, 1 / 3), ...tail]).score[0])).toEqual([4, 'r2', 'r2', 4, 12, 24]);
    expect(shape(build([n(0, 2 / 3), ...tail]).score[0])).toEqual([8, 'r4', 12, 24]);
  });
  it('quarter triplets on beats 2 and 3', () => {
    const doc = build([n(0, 1), n(1, 2 / 3), n(5 / 3, 2 / 3), n(7 / 3, 2 / 3), n(3, 1)]);
    expect(shape(doc.score[0])).toEqual([12, 8, 8, 8, 12]);
  });
  it('an eighth, then a triplet starting on the "and"', () => {
    const doc = build([n(0, 0.5), n(0.5, 1 / 3), n(5 / 6, 1 / 3), n(7 / 6, 1 / 3), n(1.5, 0.5), n(2, 2)]);
    expect(shape(doc.score[0])).toEqual([6, 4, 4, 4, 6, 24]);
  });
  it('the last triplet note tied over the beat', () => {
    const doc = build([n(0, 1 / 3, 60), n(1 / 3, 1 / 3, 62), n(2 / 3, 4 / 3, 64), n(2, 2, 65)]);
    expect(shape(doc.score[0])).toEqual([4, 4, '4t', 12, 24]);
    expect(doc.score[0].ev[3].m).toBe(64);
  });
  it('a plain quarter tied into the first member of a triplet', () => {
    const doc = build([n(0, 4 / 3, 60), n(4 / 3, 1 / 3, 62), n(5 / 3, 1 / 3, 64), n(2, 2, 65)]);
    // The quarter-triplet window [0, 24) meets all five conditions at tick 0, before [12, 24) is reached.
    expect(shape(doc.score[0])).toEqual([16, 4, 4, 24]);
    expect(groups(doc.score[0])).toEqual([{ start: 0, span: 24 }]);
  });
  it('a group at the end of a bar and a note across the bar line', () => {
    const doc = build([n(0, 2), n(2, 1), n(3, 1 / 3), n(10 / 3, 1 / 3), n(11 / 3, 4 / 3), n(5, 3)]);
    expect(shape(doc.score[0])).toEqual([24, 12, 4, 4, '4t']);
    expect(shape(doc.score[1])).toEqual([12, 36]);
  });
  it('a pickup holding a triplet', () => {
    const one = build([n(0, 1 / 3), n(1 / 3, 1 / 3), n(2 / 3, 1 / 3), n(1, 4)], { pickup: 1 });
    expect(one.score[0].cap).toBe(12);
    expect(shape(one.score[0])).toEqual([4, 4, 4]);
    const oneHalf = build([n(0, 0.5), n(0.5, 1 / 3), n(5 / 6, 1 / 3), n(7 / 6, 1 / 3), n(1.5, 4)], { pickup: 1.5 });
    expect(shape(oneHalf.score[0])).toEqual([6, 4, 4, 4]);
  });
  it('6/8: a triplet on beat 2', () => {
    const doc = build([n(0, 1.5), n(1.5, 1 / 3), n(11 / 6, 1 / 3), n(13 / 6, 1 / 3), n(2.5, 0.5)], { timeSig: [6, 8] });
    expect(shape(doc.score[0])).toEqual([18, 4, 4, 4, 6]);
    expect(groups(doc.score[0], 36)).toEqual([{ start: 18, span: 12 }]);
  });
  it('plain rhythms stay plain', () => {
    expect(shape(build([0, 1, 2, 3].map(i => n(i / 4, 1 / 4)).concat(tail)).score[0])).toEqual([3, 3, 3, 3, 12, 24]);
    expect(shape(build([n(0, 0.75), n(0.75, 0.25), ...tail]).score[0])).toEqual([9, 3, 12, 24]);
  });
  it('a quintuplet is rounded and flagged', () => {
    const doc = build([0, 1, 2, 3, 4].map(i => n(i / 5, 1 / 5)).concat(tail));
    expect(doc.source.simplified).toBe(true);
  });
  it('a note 0.021 quarter off a third is rounded; 0.012 off is a triplet', () => {
    const off = build([n(0, 0.354), n(0.354, 2 / 3 - 0.354), n(2 / 3, 1 / 3), ...tail]);
    expect(off.source.simplified).toBe(true);
    expect(off.score[0].ev[0].d).toBe(3);
    const near = build([n(0, 0.345), n(0.345, 2 / 3 - 0.345), n(2 / 3, 1 / 3), ...tail]);
    expect(shape(near.score[0])).toEqual([4, 4, 4, 12, 24]);
    expect(near.source.simplified).toBe(false);
  });
  it('a lyric and a chord at a triplet position land on that member', () => {
    const song = mkSong([n(0, 1 / 3), n(1 / 3, 1 / 3), n(2 / 3, 1 / 3), ...tail],
      { lyrics: [{ at: 1 / 3, text: 'la' }], chords: [{ at: 2 / 3, text: 'G' }] });
    const doc = buildDoc(song, opts({ lyricsFrom: 't1', chordsFrom: 'file' }));
    const ev = doc.score[0].ev;
    expect(ev.map(e => e.l)).toEqual(['', 'la', '', '', '']);
    expect(doc.imported.chords).toEqual({ [ev[2].id]: 'G' });
  });
});
