import { Midi } from '@tonejs/midi';
import { parseMidi as parseMidiEvents, type MidiEvent } from 'midi-file';
import { songTimeSig } from './meter';
import { fileTitle } from './title';
import { ImportError, type ParsedSong, type ParsedTrack } from './types';

const PERCUSSION_CHANNEL = 9;
const DEFAULT_TEMPO = 120;
const ONSET_TOLERANCE = 1e-6;     // quarter notes
const LYRIC_REACH = 0.25;         // quarter notes: 3 ticks of 12, the same reach buildDoc uses

type Lyric = { at: number; text: string };
interface TextLists { lyrics: Lyric[]; texts: Lyric[] }

/** Karaoke conventions: `@` starts a header, a leading `/` or `\` marks a new line or verse. Null: not a syllable. */
function cleanLyric(raw: string): string | null {
  if (raw.startsWith('@')) return null;
  let end = raw.length;
  while (end > 0 && (raw[end - 1] === '\r' || raw[end - 1] === '\n')) end--;
  const text = raw.slice(0, end).replace(/^[/\\]+/, '').trim();
  return text === '' ? null : text;
}

/** Lyric and text meta events per midi-file track, in quarter notes. Not index-aligned with @tonejs/midi tracks. */
function readTextLists(rawTracks: MidiEvent[][], ppq: number): TextLists[] {
  return rawTracks.map(events => {
    const out: TextLists = { lyrics: [], texts: [] };
    let tick = 0;
    for (const ev of events) {
      tick += ev.deltaTime;
      if (ev.type !== 'lyrics' && ev.type !== 'text') continue;
      const text = cleanLyric(ev.text);
      if (text !== null) (ev.type === 'lyrics' ? out.lyrics : out.texts).push({ at: tick / ppq, text });
    }
    return out;
  });
}

/**
 * The name of the first track names the sequence (Standard MIDI File spec). A first track with notes is a format 0
 * file or a track named for its instrument, so only a note-less first track gives the title. @tonejs/midi drops
 * such a track, so this reads the midi-file events.
 */
function readTitle(rawTracks: MidiEvent[][]): string {
  const first = rawTracks[0] ?? [];
  if (first.some(ev => ev.type === 'noteOn')) return '';
  return fileTitle(first.find(ev => ev.type === 'trackName')?.text);
}

/** @tonejs/midi names the MAJOR key of the signature's sharps/flats, even when `scale` is minor. */
function keyFromSignature(key: string, scale: string): { tonicPc: number; mode: 'major' | 'minor' } | null {
  const m = /^([A-G])([#b]?)$/.exec(key);
  if (!m) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const majorPc = (base[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return scale === 'minor' ? { tonicPc: (majorPc + 9) % 12, mode: 'minor' } : { tonicPc: majorPc, mode: 'major' };
}

const onsetCount = (list: Lyric[], notes: { start: number }[]) =>
  list.filter(l => notes.some(n => Math.abs(n.start - l.at) <= LYRIC_REACH + ONSET_TOLERANCE)).length;

/**
 * Attach each lyric list to the note track whose onsets it matches best (ties: higher share of that track's notes).
 * Text events count only when all of them sit on onsets. A list that matches no track is dropped.
 */
function attachLyrics(tracks: ParsedTrack[], lists: TextLists[]): void {
  const best = new Map<ParsedTrack, { real: boolean; count: number; list: Lyric[] }>();
  for (const { lyrics, texts } of lists) {
    for (const [real, list] of [[true, lyrics], [false, texts]] as const) {
      if (list.length === 0) continue;
      let pick: ParsedTrack | null = null;
      let pickCount = 0;
      let pickShare = 0;
      for (const t of tracks) {
        const count = onsetCount(list, t.notes);
        const share = count / t.notes.length;
        if (count > pickCount || (count === pickCount && count > 0 && share > pickShare)) {
          pick = t; pickCount = count; pickShare = share;
        }
      }
      if (!pick || (!real && pickCount < list.length)) continue;
      const cur = best.get(pick);
      if (!cur || (real && !cur.real) || (real === cur.real && pickCount > cur.count)) {
        best.set(pick, { real, count: pickCount, list });
      }
    }
  }
  for (const [t, { list }] of best) t.lyrics = list;
}

export function parseMidi(file: string, bytes: Uint8Array): ParsedSong {
  const unreadable = new ImportError(`"${file}" could not be read as a MIDI file.`);
  let midi: Midi;
  let rawTracks: MidiEvent[][];
  let perTrack: TextLists[];
  try {
    midi = new Midi(bytes);
    if (!Number.isFinite(midi.header.ppq) || midi.header.ppq <= 0) throw unreadable;   // SMPTE timing
    rawTracks = parseMidiEvents(bytes).tracks;
    perTrack = readTextLists(rawTracks, midi.header.ppq);
  } catch {
    throw unreadable;
  }
  const ppq = midi.header.ppq;

  const timeSig = songTimeSig(file, midi.header.timeSignatures.map(s => s.timeSignature as [number, number]));
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
    tracks.push({
      id: `t${i}`,
      name: t.name.trim() || `Track ${tracks.length + 1}`,
      instrument: t.instrument.name,
      channel: t.channel + 1,
      percussion,
      notes,
      lyrics: [],
      chords: [],
    });
  });

  const melodic = tracks.filter(t => !t.percussion);
  if (melodic.length === 0) throw new ImportError(`"${file}" has no melody track.`);

  attachLyrics(tracks, perTrack);

  // Drop whole leading bars in which no melodic track sounds (count-in), then apply the pickup rule.
  const first0 = Math.min(...melodic.map(t => t.notes[0].start));
  const leadBars = Math.floor(first0 / barLength + ONSET_TOLERANCE);
  const rest = first0 - leadBars * barLength;
  let pickup = 0;
  if (rest > ONSET_TOLERANCE && barLength - rest <= barLength / 2 + ONSET_TOLERANCE) pickup = barLength - rest;
  const shift = leadBars * barLength + (pickup > 0 ? rest : 0);
  if (shift > 0) {
    for (const t of tracks) {
      t.notes = t.notes.map(n => ({ ...n, start: n.start - shift }));
      t.lyrics = t.lyrics.map(l => ({ ...l, at: l.at - shift }));
    }
  }
  for (const t of tracks) {
    if (!t.percussion) continue;
    t.notes = t.notes.filter(n => n.start >= -ONSET_TOLERANCE);
  }

  return { file, format: 'MIDI', title: readTitle(rawTracks), timeSig, tempo, key, pickup, marks: [], dropped: [], tracks };
}
