import { readFileSync } from 'node:fs';
import { DEFAULT_PREFS } from '../domain/transpose';
import { ACCEPT, defaultBuildOptions, FORMATS, parseFile } from './index';
import { parseMidi } from './midi';
import * as midiModule from './midi';
import { LOAD_FAILED } from '../loadFailed';
import { ImportError, type ParsedSong, type ParsedTrack } from './types';

const demo = () => parseMidi('Auld_Lang_Syne.mid', new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid')));

const tr = (id: string, p: Partial<ParsedTrack>): ParsedTrack => ({
  id, name: id, instrument: '', channel: 1, percussion: false, notes: [], lyrics: [], chords: [], ...p,
});
const line = (start: number, ...pitches: number[]) => pitches.map((midi, k) => ({ start: start + k, dur: 1, midi }));
const chord = (start: number, ...pitches: number[]) => pitches.map(midi => ({ start, dur: 2, midi }));
const song = (tracks: ParsedTrack[]): ParsedSong => ({
  file: 'x.musicxml', format: 'MusicXML', title: '', timeSig: [4, 4], tempo: 100, key: null, pickup: 0, marks: [], dropped: [], tracks,
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

const message = (p: Promise<unknown>) => p.then(() => null, (e: ImportError) => e.userMessage);
const formatNamed = (name: string) => FORMATS.find(f => f.name === name)!;
const bareMidi = () => new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid'));

describe('parseFile', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('refuses an extension outside the table', async () => {
    expect(await message(parseFile(new File(['x'], 'song.wav'))))
      .toBe('"song.wav" is not a format fingerscore reads. Use MIDI, MusicXML, MuseScore or ABC.');
  });

  it('refuses a file over 20 MB before reading it', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.mid');
    expect(await message(parseFile(big))).toBe('"big.mid" is larger than 20 MB and can\'t be opened.');
    expect(read).not.toHaveBeenCalled();
  });

  it('draws the size limit at exactly 20 MB', async () => {
    const limit = 20 * 1024 * 1024;
    const tooBig = '"a.mid" is larger than 20 MB and can\'t be opened.';
    expect(await message(parseFile(new File([new Uint8Array(limit + 1)], 'a.mid')))).toBe(tooBig);
    expect(await message(parseFile(new File([new Uint8Array(limit)], 'a.mid')))).toBe('"a.mid" could not be read as a MIDI file.');
  });

  it('reports an unreadable file', async () => {
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>));
    });
    expect(await message(parseFile(new File(['x'], 'a.mid')))).toBe('"a.mid" could not be read as a MIDI file.');
  });

  it('reports a parser chunk that fails to load', async () => {
    vi.spyOn(formatNamed('MIDI'), 'load').mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    expect(await message(parseFile(new File([bareMidi()], 'a.mid')))).toBe(LOAD_FAILED);
  });

  it('a later call loads the parser again after a failed load', async () => {
    const real = formatNamed('MIDI').load;
    vi.spyOn(formatNamed('MIDI'), 'load')
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockImplementation(real);
    const file = () => new File([bareMidi()], 'a.mid');
    expect(await message(parseFile(file()))).toBe(LOAD_FAILED);
    expect((await parseFile(file())).format).toBe('MIDI');
  });

  it('rethrows an ImportError from the parser', async () => {
    vi.spyOn(midiModule, 'parseMidi').mockImplementation(() => { throw new ImportError('own words'); });
    expect(await message(parseFile(new File([bareMidi()], 'a.mid')))).toBe('own words');
  });

  it('words any other parser failure as a read failure, with the right article', async () => {
    expect(await message(parseFile(new File(['not midi'], 'a.mid')))).toBe('"a.mid" could not be read as a MIDI file.');
    expect(await message(parseFile(new File(['<nope'], 'a.musicxml')))).toBe('"a.musicxml" could not be read as a MusicXML file.');
  });

  it('parses a .mid file', async () => {
    const s = await parseFile(new File([bareMidi()], 'Auld.MID'));
    expect(s.format).toBe('MIDI');
  });

  it('accepts the table extensions and .json', () => {
    expect(ACCEPT).toBe('.mid,.midi,.musicxml,.xml,.mxl,.mscz,.mscx,.abc,.json');
  });
});
