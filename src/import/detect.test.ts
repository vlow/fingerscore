import { readFileSync } from 'node:fs';
import { DEFAULT_PREFS } from '../domain/transpose';
import { buildDoc } from './buildDoc';
import { detectChords } from './harmony';
import { analyseTracks, usableTracks } from './melody';
import { parseMidi } from './midi';
import type { ParsedSong, RawNote } from './types';

const demo = () => parseMidi('Auld_Lang_Syne.mid', new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid')));
const nt = (start: number, dur: number, midi: number): RawNote => ({ start, dur, midi });
const song = (tracks: ParsedSong['tracks']): ParsedSong => ({ file: 'x.mid', format: 'MIDI', timeSig: [4, 4], tempo: 120, key: null, pickup: 0, marks: [], tracks });
const trk = (id: string, notes: RawNote[], o: Partial<ParsedSong['tracks'][number]> = {}) =>
  ({ id, name: id, instrument: '', channel: 1, percussion: false, notes, lyrics: [], chords: [], ...o });

describe('analyseTracks', () => {
  it('demo: melody recommended, drums not usable', () => {
    const s = demo();
    const info = analyseTracks(s);
    expect(info.map(i => i.id)).toEqual(s.tracks.map(t => t.id));
    expect(info.filter(i => i.recommended)).toHaveLength(1);
    expect(info.find(i => i.recommended)!.id).toBe(s.tracks[0].id);
    expect(info[0].tags).toEqual(['Lyrics', 'Single notes']);
    expect(info[1].tags).toContain('Chords');
    expect(info[0].stats.notes).toBe(56);
    expect(info[0].stats.maxSimultaneous).toBe(1);
    expect(usableTracks(s)).toHaveLength(3);
    expect(info[3].recommended).toBe(false);
  });

  it('recommends nothing when no track is usable', () => {
    const info = analyseTracks(song([trk('d', [nt(0, 1, 36)], { percussion: true })]));
    expect(info.some(i => i.recommended)).toBe(false);
  });

  it('counts touching notes as one at a time and overlapping notes as two', () => {
    const info = analyseTracks(song([
      trk('a', [nt(0, 1, 60), nt(1, 1, 62)]),
      trk('b', [nt(0, 2, 60), nt(1, 1, 64)]),
    ]));
    expect(info[0].stats.maxSimultaneous).toBe(1);
    expect(info[1].stats.maxSimultaneous).toBe(2);
    expect(info[1].tags).toEqual(['Chords']);
  });
});

describe('detectChords', () => {
  it('detects chords from the demo chord track', () => {
    const s = demo();
    const c = detectChords(s.tracks[1].notes, s.timeSig, s.pickup, 65);
    expect(c[0].text).toBe('F');
    expect(new Set(c.map(x => x.text)).size).toBeGreaterThanOrEqual(2);
    expect(c.every(x => /^[A-G][♯♭]?(m|7)?$/.test(x.text))).toBe(true);
  });

  it('names major, minor and dominant, and emits only changes', () => {
    const triad = (at: number, root: number, third: number, extra: number[] = []) =>
      [root, root + third, root + 7, ...extra].map(m => nt(at, 2, m));
    const notes = [...triad(0, 60, 4), ...triad(2, 60, 4), ...triad(4, 57, 3), ...triad(6, 67, 4, [77]), ...triad(8, 70, 4)];
    expect(detectChords(notes, [4, 4], 0, 10)).toEqual([
      { at: 0, text: 'C' }, { at: 4, text: 'Am' }, { at: 6, text: 'G7' }, { at: 8, text: 'B♭' },
    ]);
  });

  it('skips windows with fewer than two pitch classes', () => {
    expect(detectChords([nt(0, 2, 60), nt(2, 2, 67)], [4, 4], 0, 4)).toEqual([]);
  });

  it('uses whole bars in 3/4 and half bars in 6/8', () => {
    const waltz = [nt(0, 3, 60), nt(0, 3, 64), nt(0, 3, 67), nt(3, 3, 57), nt(3, 3, 60), nt(3, 3, 64)];
    expect(detectChords(waltz, [3, 4], 0, 6)).toEqual([{ at: 0, text: 'C' }, { at: 3, text: 'Am' }]);
    const jig = [nt(0, 1.5, 60), nt(0, 1.5, 64), nt(0, 1.5, 67), nt(1.5, 1.5, 62), nt(1.5, 1.5, 67), nt(1.5, 1.5, 71)];
    expect(detectChords(jig, [6, 8], 0, 3)).toEqual([{ at: 0, text: 'C' }, { at: 1.5, text: 'G' }]);
  });

  it('uses half bars in 2/2, like 4/4', () => {
    const notes = [nt(0, 2, 60), nt(0, 2, 64), nt(0, 2, 67), nt(2, 2, 57), nt(2, 2, 60), nt(2, 2, 64)];
    expect(detectChords(notes, [2, 2], 0, 4)).toEqual([{ at: 0, text: 'C' }, { at: 2, text: 'Am' }]);
  });

  it('treats the pickup as its own window', () => {
    const notes = [nt(0, 1, 67), nt(0, 1, 71), nt(0, 1, 62), nt(1, 4, 60), nt(1, 4, 64), nt(1, 4, 67)];
    const c = detectChords(notes, [4, 4], 1, 5);
    expect(c[0]).toEqual({ at: 0, text: 'G' });
    expect(c[1]).toEqual({ at: 1, text: 'C' });
  });
});

describe('buildDoc with detected chords', () => {
  it('places chords from a chord track', () => {
    const s = demo();
    const doc = buildDoc(s, { trackId: s.tracks[0].id, keep: 'top', lyricsFrom: null, chordsFrom: s.tracks[1].id, instId: 'asax', prefs: DEFAULT_PREFS });
    expect(Object.keys(doc.chords).length).toBeGreaterThan(4);
    const first = doc.score.flatMap(b => b.ev).find(e => doc.imported.chords[e.id]);
    expect(doc.imported.chords[first!.id]).toBe('F');
    expect(doc.chords[first!.id].raw).toBe('F');
  });
});
