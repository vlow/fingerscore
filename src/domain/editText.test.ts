import { describe, expect, it } from 'vitest';
import { mkDoc } from '../test/helpers';
import { parseChord } from './chords';
import {
  carriesLyric, clearChords, clearLyrics, editCount, fillLyrics, nextLyricNote, restoreFromFile, setChord, setLyric, splitVerse,
} from './editText';
import { sampleDoc } from './fixture';
import type { Doc } from './types';

const lyrics = (d: Doc) => d.score.flatMap(b => b.ev).map(e => e.l);

describe('lyrics', () => {
  it('check 8: bulk fill', () => {
    expect(splitVerse('Oh love is gen-tle')).toEqual(['Oh', 'love', 'is', 'gen-', 'tle']);
    const d = mkDoc([{ ev: [[60, 12], [62, 12, { tie: true }], [62, 12], [0, 12]] }, { ev: [[64, 12], [65, 12], [67, 12], [69, 12]] }]);
    const r = fillLyrics(d, 'Oh love is gen-tle', null)!;
    expect(lyrics(r)).toEqual(['Oh', 'love', '', '', 'is', 'gen-', 'tle', '']);
  });

  it('fill from a note, underscores, overflow, three-part words', () => {
    const d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 12], [65, 12]] }]);
    const ids = d.score[0].ev.map(e => e.id);
    const start = { ...d, score: [{ ...d.score[0], ev: d.score[0].ev.map(e => ({ ...e, l: 'x' })) }] };
    expect(fillLyrics(start, 'a _ b c d e', ids[1])!.score[0].ev.map(e => e.l)).toEqual(['x', 'a', '', 'b']);
    expect(splitVerse('  beau-ti-ful   day ')).toEqual(['beau-', 'ti-', 'ful', 'day']);
    expect(splitVerse('-ing _ wat-')).toEqual(['-ing', '', 'wat-']);
    expect(fillLyrics(d, '   ', null)).toBeNull();
    expect(fillLyrics(start, 'x', ids[0])).toBeNull();
    expect(d.score[0].ev.map(e => e.l)).toEqual(['', '', '', '']);
  });

  it('fill from a rest or a tied continuation starts at the next note that can carry a syllable', () => {
    const d = mkDoc([{ ev: [[60, 12, { tie: true }], [60, 12], [0, 12], [64, 12]] }]);
    const ids = d.score[0].ev.map(e => e.id);
    expect(lyrics(fillLyrics(d, 'a b', ids[1])!)).toEqual(['', '', '', 'a']);
    expect(lyrics(fillLyrics(d, 'a b', ids[2])!)).toEqual(['', '', '', 'a']);
  });

  it('next lyric note skips rests and tied continuations', () => {
    const d = mkDoc([{ ev: [[0, 12], [60, 12, { tie: true }], [60, 12], [62, 12]] }, { ev: [[0, 24], [64, 24]] }]);
    const [rest, a, cont, b] = d.score[0].ev.map(e => e.id);
    const [rest2, c] = d.score[1].ev.map(e => e.id);
    expect(nextLyricNote(d, null, 1)).toBe(a);
    expect(nextLyricNote(d, null, -1)).toBe(c);
    expect(nextLyricNote(d, a, 1)).toBe(b);
    expect(nextLyricNote(d, b, 1)).toBe(c);
    expect(nextLyricNote(d, rest2, 1)).toBe(c);
    expect(nextLyricNote(d, c, -1)).toBe(b);
    expect(nextLyricNote(d, b, -1)).toBe(a);
    expect(nextLyricNote(d, a, -1)).toBeNull();
    expect(nextLyricNote(d, c, 1)).toBeNull();
    expect(nextLyricNote(d, 'nope', 1)).toBeNull();
    expect([rest, a, cont, b].map(id => carriesLyric(d, id))).toEqual([false, true, false, true]);
  });

  it('set, clear, count, restore', () => {
    const d = sampleDoc('xc');
    const first = d.score[0].ev[0];
    expect(editCount(d)).toBe(0);
    expect(restoreFromFile(d)).toBeNull();
    const a = setLyric(d, first.id, 'Oh')!;
    expect(editCount(a)).toBe(1);
    expect(setLyric(a, first.id, 'Oh')).toBeNull();
    const b = clearChords(a)!;
    expect(Object.keys(b.chords)).toEqual([]);
    // Brief: 1 + chords. The sample's first event also carries a chord (Am), and the count is per event (design 5.7).
    expect(first.id in d.chords).toBe(true);
    expect(editCount(b)).toBe(Object.keys(d.chords).length);
    const plain = d.score.flatMap(x => x.ev).find(e => !e.r && !(e.id in d.chords))!;
    expect(editCount(clearChords(setLyric(d, plain.id, 'Oh')!)!)).toBe(1 + Object.keys(d.chords).length);
    const c = restoreFromFile(b)!;
    expect(c.score[0].ev[0].l).toBe(first.l);
    expect(editCount(c)).toBe(0);
    expect(Object.keys(c.chords).sort()).toEqual(Object.keys(d.chords).sort());
    expect(clearLyrics(clearLyrics(d)!)).toBeNull();
    expect(editCount(clearLyrics(d)!)).toBe(Object.keys(d.imported.lyrics).length);
  });

  it('a fresh import counts no edits; a chord moved to another key or added counts', () => {
    const d = mkDoc([{ ev: [[60, 24], [62, 24]] }]);
    const [a, b] = d.score[0].ev.map(e => e.id);
    const imp: Doc = { ...d, chords: { [a]: parseChord('Am7/G', 0) }, imported: { lyrics: {}, chords: { [a]: 'Am7/G' } } };
    expect(editCount(imp)).toBe(0);
    expect(editCount(setChord(imp, a, 'B♭m7/A♭', 1)!)).toBe(0);   // same chord spelled one semitone up
    expect(editCount(setChord(imp, a, 'Am7', 0)!)).toBe(1);
    expect(editCount(setChord(imp, b, 'C', 0)!)).toBe(1);
    expect(editCount(setChord(imp, a, '', 0)!)).toBe(1);
    expect(restoreFromFile(setChord(imp, a, 'N.C.', 0)!)!.chords[a]).toMatchObject({ ok: true, raw: 'Am7/G', tk: 0 });
  });
});

describe('chords', () => {
  it('setChord: stores relative to the key, removes on empty, keeps invalid text', () => {
    const d = mkDoc([{ ev: [[60, 48]] }]);
    const id = d.score[0].ev[0].id;
    const a = setChord(d, id, 'Bb', 2)!;
    expect(a.chords[id]).toMatchObject({ ok: true, pc: 8, tk: 2 });
    expect(setChord(a, id, 'Bb', 2)).toBeNull();
    expect(setChord(a, id, '', 2)!.chords[id]).toBeUndefined();
    expect(setChord(d, id, 'N.C.', 0)!.chords[id]).toMatchObject({ ok: false, raw: 'N.C.' });
    expect(setChord(d, id, '', 0)).toBeNull();
    expect(setChord(d, 'nope', 'C', 0)).toBeNull();
    expect(d.chords).toEqual({});
  });
});
