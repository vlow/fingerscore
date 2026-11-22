import { readFileSync } from 'node:fs';
import { DEFAULT_PREFS } from '../domain/transpose';
import { defaultBuildOptions } from './index';
import { parseMidi } from './midi';
import { ImportError, type ParsedSong, type ParsedTrack } from './types';

const demo = () => parseMidi('Auld_Lang_Syne.mid', new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid')));

const tr = (id: string, p: Partial<ParsedTrack>): ParsedTrack => ({
  id, name: id, instrument: '', channel: 1, percussion: false, notes: [], lyrics: [], chords: [], ...p,
});
const line = (start: number, ...pitches: number[]) => pitches.map((midi, k) => ({ start: start + k, dur: 1, midi }));
const chord = (start: number, ...pitches: number[]) => pitches.map(midi => ({ start, dur: 2, midi }));
const song = (tracks: ParsedTrack[]): ParsedSong => ({
  file: 'x.musicxml', format: 'MusicXML', timeSig: [4, 4], tempo: 100, key: null, pickup: 0, marks: [], tracks,
});

describe('defaultBuildOptions', () => {
  it('demo: melody, top note, its lyrics, chords detected from the Chords track', () => {
    const s = demo();
    const o = defaultBuildOptions(s, 'cl', DEFAULT_PREFS);
    expect(o).toEqual({
      trackId: s.tracks[0].id, keep: 'top', lyricsFrom: s.tracks[0].id, chordsFrom: s.tracks[1].id,
      instId: 'cl', prefs: DEFAULT_PREFS,
    });
  });

  it('uses the chord symbols of the chosen track when it has them', () => {
    const s = song([
      tr('mel', { notes: line(0, 72, 74, 76, 77), chords: [{ at: 0, text: 'C' }] }),
      tr('pad', { notes: [...chord(0, 48, 52, 55), ...chord(2, 50, 53, 57)] }),
    ]);
    expect(defaultBuildOptions(s, 'asax', DEFAULT_PREFS).chordsFrom).toBe('file');
  });

  it('no chord source and no lyrics give null', () => {
    const s = song([tr('mel', { notes: line(0, 72, 74, 76) }), tr('bass', { notes: line(0, 36, 38, 40) })]);
    expect(defaultBuildOptions(s, 'asax', DEFAULT_PREFS)).toMatchObject({ trackId: 'mel', lyricsFrom: null, chordsFrom: null });
  });

  it('lyrics come from the first track with lyrics when the chosen one has none', () => {
    const s = song([
      tr('voice', { notes: line(0, 40, 41, 42), lyrics: [{ at: 0, text: 'la' }] }),
      tr('mel', { notes: line(0, 72, 74, 76, 77, 79) }),
    ]);
    const o = defaultBuildOptions(s, 'asax', DEFAULT_PREFS);
    expect(o.trackId).toBe('mel');
    expect(o.lyricsFrom).toBe('voice');
  });

  it('throws an ImportError when no track is usable', () => {
    const s = song([tr('drums', { percussion: true, notes: line(0, 36, 38) })]);
    expect(() => defaultBuildOptions(s, 'asax', DEFAULT_PREFS)).toThrow(ImportError);
    expect(() => defaultBuildOptions(s, 'asax', DEFAULT_PREFS)).toThrow('"x.musicxml" has no melody track.');
  });

  it('skips percussion as a chord source', () => {
    const s = song([
      tr('mel', { notes: line(0, 72, 74, 76) }),
      tr('drums', { percussion: true, notes: chord(0, 36, 38, 42) }),
    ]);
    expect(defaultBuildOptions(s, 'asax', DEFAULT_PREFS).chordsFrom).toBeNull();
  });
});
