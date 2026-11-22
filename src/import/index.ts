import type { Prefs } from '../domain/transpose';
import type { InstId } from '../domain/types';
import type { BuildOptions } from './buildDoc';
import { analyseTracks, usableTracks } from './melody';
import { parseMidi } from './midi';
import { parseMusicXml } from './musicxml';
import { ImportError, type ParsedSong } from './types';

export const ACCEPT = '.mid,.midi,.musicxml,.xml,.mxl';

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export async function parseFile(file: File): Promise<ParsedSong> {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  const isMidi = ext === '.mid' || ext === '.midi';
  const isXml = ext === '.musicxml' || ext === '.xml' || ext === '.mxl';
  if (!isMidi && !isXml) {
    throw new ImportError(`"${file.name}" is not a format fingerscore reads yet. Use MIDI or MusicXML.`);
  }
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(file);
  } catch {
    throw new ImportError(`"${file.name}" could not be read as a ${isMidi ? 'MIDI' : 'MusicXML'} file.`);
  }
  return isMidi ? parseMidi(file.name, bytes) : parseMusicXml(file.name, bytes);
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

/** Options for the recommended track (the first track when none is usable). */
export function defaultBuildOptions(song: ParsedSong, instId: InstId, prefs: Prefs): BuildOptions {
  const infos = analyseTracks(song);
  const rec = song.tracks.find((_, i) => infos[i].recommended) ?? song.tracks[0];
  return buildOptionsFor(song, rec.id, instId, prefs);
}
