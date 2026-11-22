import { Midi } from '@tonejs/midi';
import { parseMidi as parseMidiEvents } from 'midi-file';
import { isSupportedTimeSig } from '../domain/time';
import type { TimeSig } from '../domain/types';
import { ImportError, type ParsedSong, type ParsedTrack } from './types';

const PERCUSSION_CHANNEL = 9;
const DEFAULT_TEMPO = 120;
const ONSET_TOLERANCE = 1e-6;     // quarter notes

type Lyric = { at: number; text: string };

/** Lyric events per MIDI track (by track index), in quarter notes. `text` events are kept apart for the fallback. */
function readLyrics(bytes: Uint8Array, ppq: number): { lyrics: Lyric[]; texts: Lyric[] }[] {
  const data = parseMidiEvents(bytes);
  return data.tracks.map(events => {
    const lyrics: Lyric[] = [];
    const texts: Lyric[] = [];
    let tick = 0;
    for (const ev of events) {
      tick += ev.deltaTime;
      if (ev.type === 'lyrics') lyrics.push({ at: tick / ppq, text: ev.text });
      else if (ev.type === 'text') texts.push({ at: tick / ppq, text: ev.text });
    }
    return { lyrics, texts };
  });
}

function keyFromSignature(key: string, scale: string): { tonicPc: number; mode: 'major' | 'minor' } | null {
  const m = /^([A-G])([#b]?)$/.exec(key);
  if (!m) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const tonicPc = (base[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { tonicPc, mode: scale === 'minor' ? 'minor' : 'major' };
}

/** Text events stand in for lyrics only when every one of them sits on a note onset. */
function textAsLyrics(texts: Lyric[], notes: { start: number }[]): Lyric[] {
  const words = texts.filter(t => t.text.trim() !== '');
  if (words.length === 0) return [];
  const aligned = words.every(w => notes.some(n => Math.abs(n.start - w.at) < ONSET_TOLERANCE));
  return aligned ? words : [];
}

export function parseMidi(file: string, bytes: Uint8Array): ParsedSong {
  const unreadable = new ImportError(`"${file}" could not be read as a MIDI file.`);
  let midi: Midi;
  let perTrack: ReturnType<typeof readLyrics>;
  try {
    midi = new Midi(bytes);
    perTrack = readLyrics(bytes, midi.header.ppq);
  } catch {
    throw unreadable;
  }
  const ppq = midi.header.ppq;

  const sigs = midi.header.timeSignatures;
  const first = sigs[0]?.timeSignature ?? [4, 4];
  if (!isSupportedTimeSig(first[0], first[1])) {
    throw new ImportError(`${file} is in ${first[0]}/${first[1]}. fingerscore reads 4/4, 3/4, 2/4 and 6/8 for now.`);
  }
  if (sigs.some(s => s.timeSignature[0] !== first[0] || s.timeSignature[1] !== first[1])) {
    throw new ImportError(`${file} changes its time signature. fingerscore reads one time signature per song for now.`);
  }
  const timeSig = [first[0], first[1]] as TimeSig;
  const barLength = (timeSig[0] * 4) / timeSig[1];

  const ks = midi.header.keySignatures[0];
  const key = ks ? keyFromSignature(ks.key, ks.scale) : null;
  const tempo = midi.header.tempos[0]?.bpm ?? DEFAULT_TEMPO;

  const tracks: ParsedTrack[] = [];
  midi.tracks.forEach((t, i) => {
    if (t.notes.length === 0) return;     // conductor and other note-less tracks
    const percussion = t.channel === PERCUSSION_CHANNEL || t.instrument.percussion;
    const notes = t.notes
      .map(n => ({ start: n.ticks / ppq, dur: n.durationTicks / ppq, midi: n.midi }))
      .sort((a, b) => a.start - b.start || a.midi - b.midi);
    const { lyrics, texts } = perTrack[i] ?? { lyrics: [], texts: [] };
    tracks.push({
      id: `t${i}`,
      name: t.name.trim() || `Track ${tracks.length + 1}`,
      instrument: t.instrument.name,
      channel: t.channel + 1,
      percussion,
      notes,
      lyrics: lyrics.length > 0 ? lyrics : textAsLyrics(texts, notes),
      chords: [],
    });
  });

  const melodic = tracks.filter(t => !t.percussion);
  if (melodic.length === 0) throw new ImportError(`"${file}" has no melody track.`);

  const t0 = Math.min(...melodic.map(t => t.notes[0].start));
  let pickup = 0;
  if (t0 > 0 && t0 < barLength && barLength - t0 <= barLength / 2) {
    pickup = barLength - t0;
    for (const t of tracks) {
      t.notes = t.notes.map(n => ({ ...n, start: n.start - t0 }));
      t.lyrics = t.lyrics.map(l => ({ ...l, at: l.at - t0 }));
    }
  }

  return { file, format: 'MIDI', timeSig, tempo, key, pickup, marks: [], tracks };
}
