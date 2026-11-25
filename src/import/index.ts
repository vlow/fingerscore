import { LOAD_FAILED } from '../shell/loadFailed';
import type { Prefs } from '../domain/transpose';
import type { InstId } from '../domain/types';
import type { BuildOptions } from './buildDoc';
import { analyseTracks, usableTracks } from './melody';
import { ImportError, type ParsedSong } from './types';

export type Parser = (file: string, bytes: Uint8Array) => Promise<ParsedSong>;

export interface Format {
  name: 'MIDI' | 'MusicXML' | 'MuseScore' | 'ABC';
  extensions: string[];
  article: 'a' | 'an';
  /** Loads the parser's chunk on first use, so its libraries stay out of the entry chunk. */
  load: () => Promise<Parser>;
}

export const FORMATS: Format[] = [
  {
    name: 'MIDI', extensions: ['.mid', '.midi'], article: 'a',
    load: async () => { const { parseMidi } = await import('./midi'); return async (file, bytes) => parseMidi(file, bytes); },
  },
  {
    name: 'MusicXML', extensions: ['.musicxml', '.xml', '.mxl'], article: 'a',
    load: async () => (await import('./musicxml')).parseMusicXml,
  },
  {
    name: 'MuseScore', extensions: ['.mscz', '.mscx'], article: 'a',
    load: async () => (await import('./mscz')).parseMuseScore,
  },
  {
    name: 'ABC', extensions: ['.abc'], article: 'an',
    load: async () => (await import('./abc')).parseAbc,
  },
];

export const ACCEPT = [...FORMATS.flatMap(f => f.extensions), '.json'].join(',');

const MAX_BYTES = 20 * 1024 * 1024;

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseFile(file: File): Promise<ParsedSong> {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  const format = FORMATS.find(f => f.extensions.includes(ext));
  if (!format) {
    throw new ImportError(`"${file.name}" is not a format fingerscore reads. Use MIDI, MusicXML, MuseScore or ABC.`);
  }
  if (file.size > MAX_BYTES) throw new ImportError(`"${file.name}" is larger than 20 MB and can't be opened.`);
  const unreadable = () => new ImportError(`"${file.name}" could not be read as ${format.article} ${format.name} file.`);
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(file);
  } catch {
    throw unreadable();
  }
  let parse: Parser;
  try {
    parse = await format.load();
  } catch {
    throw new ImportError(LOAD_FAILED);
  }
  try {
    return await parse(file.name, bytes);
  } catch (e) {
    throw e instanceof ImportError ? e : unreadable();
  }
}

/** Options for building the sheet from one track: top note, lyrics and chord symbols from the most likely source. */
export function buildOptionsFor(song: ParsedSong, trackId: string, instId: InstId, prefs: Prefs): BuildOptions {
  const track = song.tracks.find(t => t.id === trackId);
  const withLyrics = track && track.lyrics.length > 0 ? track : song.tracks.find(t => t.lyrics.length > 0);
  const infos = analyseTracks(song);
  const chordTrack = usableTracks(song).find(t =>
    t.id !== trackId && infos[song.tracks.indexOf(t)].tags.includes('Chords'));
  return {
    trackId,
    keep: 'top',
    lyricsFrom: withLyrics?.id ?? null,
    chordsFrom: track && track.chords.length > 0 ? 'file' : chordTrack?.id ?? null,
    instId,
    prefs,
  };
}

/** Options for the recommended track. Throws an ImportError when no track is usable. */
export function defaultBuildOptions(song: ParsedSong, instId: InstId, prefs: Prefs): BuildOptions {
  const infos = analyseTracks(song);
  const rec = song.tracks.find((_, i) => infos[i].recommended);
  if (!rec) throw new ImportError(`"${song.file}" has no melody track.`);
  return buildOptionsFor(song, rec.id, instId, prefs);
}
