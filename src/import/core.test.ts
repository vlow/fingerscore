import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../domain/transpose';
import { DURATIONS, isPlainLength } from '../domain/time';
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
    file: extra.file ?? 'song.mid', format: 'MIDI', title: '', timeSig: [4, 4], tempo: 100, key: extra.key ?? null, pickup: 0, marks: [], dropped: [],
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
  it('keeps a position within 0.005 quarter of a whole tick, otherwise rounds to sixteenths and reports rounding', () => {
    expect(quantise([n(0, 1), n(1, 0.5)])).toEqual({ notes: [{ start: 0, dur: 12, midi: 60 }, { start: 12, dur: 6, midi: 60 }], simplified: false });
    const t = quantise([n(0, 1 / 3), n(1 / 3, 1 / 3), n(2 / 3, 1 / 3)]); // eighth triplet
    expect(t).toEqual({ notes: [{ start: 0, dur: 4, midi: 60 }, { start: 4, dur: 4, midi: 60 }, { start: 8, dur: 4, midi: 60 }], simplified: false });
    const start = (q: number) => quantise([n(q, 1 - q)]);
    expect(start(1 / 3 + 0.004)).toEqual({ notes: [{ start: 4, dur: 8, midi: 60 }], simplified: false });
    for (const q of [1 / 3 + 0.006, 0.345, 0.354]) {
      expect(start(q).notes[0]).toEqual({ start: 3, dur: 9, midi: 60, roundedStart: true });
      expect(start(q).simplified).toBe(true);
    }
  });
  it('keeps exact thirds from MIDI at common resolutions', () => {
    for (const ppq of [96, 100, 120, 192, 384, 480, 960]) {
      const at = (k: number) => Math.round((k * ppq) / 3) / ppq;   // a third of a quarter rounds to whole MIDI ticks
      const q = quantise([0, 1, 2].map(k => n(at(k), at(k + 1) - at(k))));
      expect(q, `ppq ${ppq}`).toEqual({ notes: [0, 4, 8].map(s => ({ start: s, dur: 4, midi: 60 })), simplified: false });
    }
  });
  it('rounds every note of a quintuplet and a septuplet to sixteenths', () => {
    for (const k of [5, 7]) {
      const q = quantise(Array.from({ length: k }, (_, i) => n(i / k, 1 / k)));
      expect(q.notes.every(x => x.start % 3 === 0 && (x.start + x.dur) % 3 === 0 || x.dur === 1), `${k}`).toBe(true);
      expect(q.simplified).toBe(true);
    }
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
  it('an end cut at the next onset is rounded only when that onset was', () => {
    const rounded = { start: 12, dur: 12, midi: 62, roundedStart: true as const };
    expect(monophonic([{ start: 0, dur: 24, midi: 60 }, rounded], 'top')[0]).toEqual({ start: 0, dur: 12, midi: 60, roundedEnd: true });
    expect(monophonic([{ start: 0, dur: 24, midi: 60, roundedEnd: true }, { start: 12, dur: 12, midi: 62 }], 'top')[0])
      .toEqual({ start: 0, dur: 12, midi: 60 });
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
  it('takes the title the file states, else the file name', () => {
    const song = mkSong([n(0, 4, 62)], { file: 'My_Song.mid' });
    expect(buildDoc({ ...song, title: 'Morning Has Broken' }, opts()).title).toBe('Morning Has Broken');
    expect(buildDoc({ ...song, title: '' }, opts()).title).toBe('My Song');
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
    expect(shape(build([n(0, 1 / 3), n(1 / 3, 2 / 3), ...tail]).score[0])).toEqual([4, 8, 12, 24]);
  });
  it('three triplet quarters are one group of 24 without ties', () => {
    const doc = build([n(0, 2 / 3), n(2 / 3, 2 / 3), n(4 / 3, 2 / 3), n(2, 2)]);
    expect(shape(doc.score[0])).toEqual([8, 8, 8, 24]);
    expect(groups(doc.score[0])).toEqual([{ start: 0, span: 24 }]);
  });
  it('a triplet half and a triplet quarter', () => {
    expect(shape(build([n(0, 4 / 3), n(4 / 3, 2 / 3), n(2, 2)]).score[0])).toEqual([16, 8, 24]);
  });
  it('quarter, quarter, eighth, eighth in quarter-triplet values: no quarter-triplet window holds eighths', () => {
    const doc = build([n(0, 2 / 3, 60), n(2 / 3, 2 / 3, 62), n(4 / 3, 1 / 3, 64), n(5 / 3, 1 / 3, 65), n(2, 2, 67)]);
    expect(shape(doc.score[0])).toEqual([8, '4t', 4, 4, 4, 24]);
  });
  it('sixteenths and an eighth in one eighth triplet', () => {
    expect(shape(build([n(0, 1 / 6), n(1 / 6, 1 / 6), n(1 / 3, 2 / 3), ...tail]).score[0])).toEqual([2, 2, 8, 12, 24]);
    expect(shape(build([n(0, 2 / 3), n(2 / 3, 1 / 6), n(5 / 6, 1 / 6), ...tail]).score[0])).toEqual([8, 2, 2, 12, 24]);
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
    expect(shape(build([n(0, 1 / 3), n(2 / 3, 1 / 3), ...tail]).score[0])).toEqual([4, 'r4', 4, 12, 24]);
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
    expect(shape(doc.score[0])).toEqual(['12t', 4, 4, 4, 24]);
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
  const noTriplet = (b: Bar) => b.ev.every(e => isPlainLength(e.d));
  it('a quintuplet and a septuplet are rounded to sixteenths and flagged', () => {
    for (const k of [5, 7]) {
      const doc = build(Array.from({ length: k }, (_, i) => n(i / k, 1 / k, 60 + i)).concat(tail));
      expect(noTriplet(doc.score[0]), `${k}`).toBe(true);
      expect(doc.source.simplified).toBe(true);
    }
  });
  it('a note 0.012 or 0.021 quarter off a third is rounded; exactly a third or 0.004 off is a triplet; 0.006 off is rounded', () => {
    const at = (q: number) => build([n(0, q, 60), n(q, 1 - q, 62), ...tail]);
    for (const q of [0.345, 0.354, 1 / 3 + 0.006]) {
      expect(shape(at(q).score[0]), `${q}`).toEqual([3, 9, 12, 24]);
      expect(at(q).source.simplified).toBe(true);
    }
    for (const q of [1 / 3, 1 / 3 + 0.004]) {
      expect(shape(at(q).score[0]), `${q}`).toEqual([4, 8, 12, 24]);
      expect(at(q).source.simplified).toBe(false);
    }
  });
  it('no triplet window holds a note with a rounded edge', () => {
    // 0.354 rounds to tick 3; the second note then has a rounded start, so 2/3 is rounded too.
    const doc = build([n(0, 0.354, 60), n(0.354, 2 / 3 - 0.354, 62), n(2 / 3, 1 / 3, 64), ...tail]);
    expect(noTriplet(doc.score[0])).toBe(true);
    expect(doc.source.simplified).toBe(true);
  });
  it('a triplet rest bounded by a rounded note edge makes no window', () => {
    // the silence 8..12 ends where a note starts at 0.95 quarter, rounded to tick 12
    const doc = build([n(0, 1 / 3, 60), n(1 / 3, 1 / 3, 62), n(0.95, 1.05, 64), n(2, 2, 65)]);
    expect(noTriplet(doc.score[0])).toBe(true);
    expect(doc.source.simplified).toBe(true);
  });
  it('a rounded edge strictly outside a window does not matter, however long the silence before it', () => {
    // the first note ends at 30.3 ticks, rounded to 30; after a rest an exact triplet sixteenth [46, 48) fills window [42, 48)
    const doc = build([n(2, 30.3 / 12 - 2, 60), n(46 / 12, 2 / 12, 62), n(4, 4, 64)]);
    expect(shape(doc.score[0])).toEqual(['r24', 6, 'r12', 'r4', 2]);
    expect(groups(doc.score[0])).toEqual([{ start: 42, span: 6 }]);
  });
  it('a rounded onset on the window boundary vetoes the window', () => {
    // exact [30, 32), triplet rest 32..36, then an onset at 36.4 ticks rounded to 36: no window [30, 36) or [24, 36)
    const doc = build([n(30 / 12, 2 / 12, 60), n(36.4 / 12, 4 - 36.4 / 12, 62)]);
    expect(noTriplet(doc.score[0])).toBe(true);
    expect(doc.source.simplified).toBe(true);
  });
  it('a note crossing the bar line by an odd tick: rounded to the bar line, nothing throws', () => {
    // 3/4: [29, 37) and [55, 57). Bar 1 rounds 37 to the bar line 36; that rounded end lies outside the window
    // [51, 57) that holds the second note, so the window stands.
    const doc = build([n(29 / 12, 8 / 12, 60), n(55 / 12, 2 / 12, 62)], { timeSig: [3, 4] });
    expect(doc.score.map(shape)).toEqual([['r24', 'r3', 'r2', '4t', 3], ['r12', 'r3', 'r4', 2, 'r12', 'r3']]);
  });
  it('a note end rounded to the bar line vetoes a window that starts there, not one a beat later', () => {
    // [45, 49) ends at 49, rounded to the bar line 48; then a triplet rest and two triplet eighths
    const figure = (at: number) => [n(at + 1 / 3, 1 / 3, 62), n(at + 2 / 3, 1 / 3, 64)];
    const atLine = build([n(45 / 12, 4 / 12, 60), ...figure(4), n(5, 3, 70)]);
    expect(noTriplet(atLine.score[1])).toBe(true);
    const later = build([n(45 / 12, 4 / 12, 60), ...figure(5), n(6, 2, 70)]);
    expect(shape(later.score[1])).toEqual(['r12', 'r4', 4, 4, 24]);
    // the same when quantising already rounded the end (at 49.4 ticks) to the bar line
    const quantised = build([n(45 / 12, 4.4 / 12, 60), ...figure(4), n(5, 3, 70)]);
    expect(noTriplet(quantised.score[1])).toBe(true);
  });
  it('triplet rests next to exact neighbours', () => {
    expect(shape(build([n(0.5, 1 / 3), n(5 / 6, 1 / 3), n(7 / 6, 1 / 3), n(1.5, 0.5), n(2, 2)]).score[0])).toEqual(['r6', 4, 4, 4, 6, 24]);
    expect(shape(build([n(0, 1), n(4 / 3, 1 / 3), n(5 / 3, 1 / 3), n(2, 2)]).score[0])).toEqual([12, 'r4', 4, 4, 24]);
    expect(shape(build([n(0, 1 / 3), n(1 / 3, 1 / 3), n(1, 1), n(2, 2)]).score[0])).toEqual([4, 4, 'r4', 12, 24]);
    expect(shape(build([n(0, 2 / 3), n(1, 1), n(2, 2)]).score[0])).toEqual([8, 'r4', 12, 24]);
    expect(shape(build([n(0, 1), n(1, 1), n(2, 1), n(3, 2 / 3)]).score[0])).toEqual([12, 12, 12, 8, 'r4']);   // silence to the bar line
  });
  it('MIDI at ppq 100: thirds summed from 33-tick lengths are rounded; thirds rounded per onset are a triplet', () => {
    const summed = build([0, 33, 66].map(t => n(t / 100, 0.33, 60 + t)).concat(tail));
    expect(noTriplet(summed.score[0])).toBe(true);
    expect(summed.source.simplified).toBe(true);
    const perOnset = build([[0, 33], [33, 67], [67, 100]].map(([a, b]) => n(a / 100, (b - a) / 100, 60 + a)).concat(tail));
    expect(shape(perOnset.score[0])).toEqual([4, 4, 4, 12, 24]);
    expect(perOnset.source.simplified).toBe(false);
  });
  it('an exact triplet beside a quintuplet stays a triplet', () => {
    const quintuplet = Array.from({ length: 5 }, (_, i) => n(1 + i / 5, 1 / 5, 70 + i));
    const doc = build([n(0, 1 / 3, 60), n(1 / 3, 1 / 3, 62), n(2 / 3, 1 / 3, 64), ...quintuplet, n(2, 2, 65)]);
    expect(shape(doc.score[0]).slice(0, 3)).toEqual([4, 4, 4]);
    expect(doc.score[0].ev.slice(3).every(e => isPlainLength(e.d))).toBe(true);
    expect(doc.source.simplified).toBe(true);
  });
  it('a quarter-triplet group with triplet eighths comes back as eighth-triplet groups', () => {
    const notes = (...lengths: number[]) => {
      let t = 0;
      return lengths.map((d, i) => { const q = n(t / 12, d / 12, 60 + i); t += d; return q; }).concat([n(2, 2, 70)]);
    };
    expect(shape(build(notes(16, 4, 4)).score[0])).toEqual(['12t', 4, 4, 4, 24]);
    expect(shape(build(notes(4, 4, 16)).score[0])).toEqual([4, 4, '4t', 12, 24]);
    expect(shape(build(notes(4, 16, 4)).score[0])).toEqual([4, '8t', 8, 4, 24]);
    expect(shape(build(notes(8, 8, 4, 4)).score[0])).toEqual([8, '4t', 4, 4, 4, 24]);
    const doc = build(notes(8, 4, 4, 8));
    expect(shape(doc.score[0])).toEqual([8, 4, 4, 8, 24]);
    expect(groups(doc.score[0])).toEqual([{ start: 0, span: 12 }, { start: 12, span: 12 }]);
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
