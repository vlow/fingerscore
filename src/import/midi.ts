import { Midi } from '@tonejs/midi';
import { parseMidi as parseMidiEvents } from 'midi-file';
import { isSupportedTimeSig } from '../domain/time';
import type { TimeSig } from '../domain/types';
import { ImportError, type ParsedSong, type ParsedTrack } from './types';

const PERCUSSION_CHANNEL = 9;
const DEFAULT_TEMPO = 120;
const ONSET_TOLERANCE = 1e-6;     // quarter notes

type Lyric = { at: number; text: string };
interface TextLists { lyrics: Lyric[]; texts: Lyric[] }

/** Lyric and text meta events per midi-file track, in quarter notes. Not index-aligned with @tonejs/midi tracks. */
function readTextLists(bytes: Uint8Array, ppq: number): TextLists[] {
  const data = parseMidiEvents(bytes);
  return data.tracks.map(events => {
    const out: TextLists = { lyrics: [], texts: [] };
    let tick = 0;
    for (const ev of events) {
      tick += ev.deltaTime;
      if (ev.type === 'lyrics') out.lyrics.push({ at: tick / ppq, text: ev.text });
      else if (ev.type === 'text' && ev.text.trim() !== '') out.texts.push({ at: tick / ppq, text: ev.text });
    }
    return out;
  });
}

function keyFromSignature(key: string, scale: string): { tonicPc: number; mode: 'major' | 'minor' } | null {
  const m = /^([A-G])([#b]?)$/.exec(key);
  if (!m) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const tonicPc = (base[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { tonicPc, mode: scale === 'minor' ? 'minor' : 'major' };
}

const onsetCount = (list: Lyric[], notes: { start: number }[]) =>
  list.filter(l => notes.some(n => Math.abs(n.start - l.at) < ONSET_TOLERANCE)).length;

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
  let perTrack: TextLists[];
  try {
    midi = new Midi(bytes);
    if (!Number.isFinite(midi.header.ppq) || midi.header.ppq <= 0) throw unreadable;   // SMPTE timing
    perTrack = readTextLists(bytes, midi.header.ppq);
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

  return { file, format: 'MIDI', timeSig, tempo, key, pickup, marks: [], tracks };
}
