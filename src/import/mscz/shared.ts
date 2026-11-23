import { songTimeSig } from '../meter';
import { ImportError, type ParsedSong, type ParsedTrack, type RawNote } from '../types';
import { harmonyOf, kid, kids, lyricText, majorTonicOfFifths, mod12, num, text } from './common';

/** What the readers of versions 2 and 3/4 have in common: parts, the measure grid, tracks, key, tempo, chord symbols. The readers differ in where a measure keeps its elements and how voices, tuplets, ties and endings are written. */

export const EPS = 1e-9;
const DEFAULT_TEMPO = 120;
const MAX_VOICES = 4;

export type Timed = { at: number; text: string };

export interface PartInfo { name: string; instrument: string; percussion: boolean; transpose: number; staffIds: number[] }

export interface Bar { el: Element; start: number; length: number }

export interface VoiceRead { notes: RawNote[]; lyrics: Timed[]; harmonies: Timed[] }

/** The parts of the score that differ between file versions. */
export interface Dialect {
  /** The elements a measure holds in reading order, over all voices (time signatures, key signatures and tempo marks are looked up here). */
  items(measure: Element): Element[];
  /** Notes, lyrics and chord symbols of voice `voiceIndex` (0 to 3) over all measures of one staff. */
  readVoice(bars: Bar[], staffMeasures: Element[], voiceIndex: number): VoiceRead;
  /** Repeat signs and endings 1 and 2 of the first staff, as `ParsedSong.marks` (bar index = measure index). */
  readMarks(bars: Bar[]): ParsedSong['marks'];
}

/** `a/b` as a number (a fraction of a whole note when it comes from MuseScore). */
export function fraction(s: string | undefined): number | null {
  const m = /^\s*(-?\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(s ?? '');
  if (!m) return null;
  const d = m[2] === undefined ? 1 : Number(m[2]);
  return d === 0 ? null : Number(m[1]) / d;
}

/** Ratio (normal / actual notes) of a tuplet element; 1 when either count is missing, zero or negative. */
export function ratioOf(tuplet: Element): number {
  const normal = num(text(tuplet, 'normalNotes')), actual = num(text(tuplet, 'actualNotes'));
  return normal !== null && actual !== null && normal > 0 && actual > 0 ? normal / actual : 1;
}

// ---- parts ----

/** The parts of the main score. A part's `<Staff>` carries its id in versions 2 and 3; version 4 may leave it out, then the staves count up in order. */
function readParts(score: Element, staffIds: number[]): PartInfo[] {
  let next = 1;
  return kids(score, 'Part').map(p => {
    const staves = kids(p, 'Staff');
    const ids = staves.map(s => { const id = num(s.getAttribute('id') ?? undefined) ?? next; next = id + 1; return id; });
    const ins = kid(p, 'Instrument');
    const trackName = text(p, 'trackName') || text(ins, 'trackName') || text(ins, 'longName') || '';
    return {
      name: trackName,
      instrument: text(ins, 'longName') || text(ins, 'trackName') || trackName,
      percussion: text(ins, 'useDrumset') === '1' || staves.some(s => kid(s, 'StaffType')?.getAttribute('group') === 'percussion'),
      transpose: num(text(ins, 'transposeChromatic')) ?? 0,
      staffIds: ids.filter(id => staffIds.includes(id)),
    };
  });
}

// ---- measures ----

/** The first staff's measure grid, and its time signatures. */
function readGrid(measures: Element[], items: Dialect['items']): { bars: Bar[]; sigs: [number, number][] } {
  const sigs: [number, number][] = [];
  const bars: Bar[] = [];
  let meter = 4;
  let start = 0;
  for (const m of measures) {
    for (const ts of items(m).filter(e => e.localName === 'TimeSig')) {
      const n = num(text(ts, 'sigN')), d = num(text(ts, 'sigD'));
      if (n !== null && d !== null && d > 0) { sigs.push([n, d]); meter = n * 4 / d; }
    }
    const declared = (fraction(m.getAttribute('len') ?? undefined) ?? NaN) * 4;
    const length = declared > 0 ? declared : meter;     // a zero, negative or missing length is the meter's
    bars.push({ el: m, start, length });
    start += length;
  }
  return { bars, sigs };
}

// ---- notes of one voice ----

export const isGrace = (chord: Element): boolean =>
  Array.from(chord.children).some(c => /^(grace|acciaccatura|appoggiatura)/.test(c.localName));

/** Verse 1 text of a chord: a `<Lyrics>` without `<no>` or with `<no>0</no>`. */
function verseOne(chord: Element): string | null {
  const ly = kids(chord, 'Lyrics').find(l => (num(text(l, 'no')) ?? 0) === 0);
  const body = ly && text(ly, 'text');
  return ly && body ? lyricText(body, text(ly, 'syllabic') ?? null) : null;
}

/**
 * Collects the notes, verse 1 lyrics and chord symbols of one voice. A note with a tie start continues into the next
 * note of its pitch. A chord symbol sits at the position the reader gives it (`harmony`).
 */
export function voiceSink(hasTieStart: (note: Element) => boolean) {
  const notes: RawNote[] = [];
  const lyrics: Timed[] = [];
  const harmonies: Timed[] = [];
  const open = new Map<number, RawNote>();     // tied notes waiting for their continuation, by pitch
  return {
    harmony(h: Element, at: number): void { const t = harmonyOf(h); if (t !== null) harmonies.push({ at, text: t }); },
    chord(el: Element, pos: number, dur: number): void {
      const ly = verseOne(el);
      if (ly !== null) lyrics.push({ at: pos, text: ly });
      for (const note of kids(el, 'Note')) {
        const midi = num(text(note, 'pitch'));
        if (midi === null) continue;
        const waitingNote = open.get(midi);
        if (waitingNote && Math.abs(waitingNote.start + waitingNote.dur - pos) < EPS) {
          waitingNote.dur += dur;
          if (!hasTieStart(note)) open.delete(midi);
        } else {
          const raw = { start: pos, dur, midi };
          notes.push(raw);
          if (hasTieStart(note)) open.set(midi, raw); else open.delete(midi);
        }
      }
    },
    result(): VoiceRead { return { notes: notes.sort((a, b) => a.start - b.start), lyrics, harmonies }; },
  };
}

// ---- song-level facts ----

function readTempo(measures: Element[][], items: Dialect['items']): number {
  for (const staffMeasures of measures) {
    for (const m of staffMeasures) {
      for (const t of items(m).filter(e => e.localName === 'Tempo')) {
        const perSecond = num(text(t, 'tempo'));
        if (perSecond !== null && perSecond > 0) return Math.round(perSecond * 60);
      }
    }
  }
  return DEFAULT_TEMPO;
}

/** Concert key from the first measure of the first pitched part's first staff. */
function readKey(score: Element, version: number, first: Element[] | undefined, transpose: number, items: Dialect['items']): ParsedSong['key'] {
  const sig = first?.[0] && items(first[0]).filter(e => e.localName === 'KeySig')[0];
  if (version >= 4) {
    return { tonicPc: majorTonicOfFifths(num(text(sig, 'concertKey')) ?? 0), mode: null };
  }
  const written = majorTonicOfFifths(num(text(sig, 'accidental')) ?? 0);
  const concertPitch = text(kid(score, 'Style'), 'concertPitch') === '1';
  return { tonicPc: concertPitch ? written : mod12(written + transpose), mode: null };
}

/** Reads the main score with the dialect of the file's version. */
export function readScore(file: string, score: Element, version: number, dialect: Dialect): ParsedSong {
  const { items } = dialect;
  const staves = kids(score, 'Staff')
    .map(s => ({ id: num(s.getAttribute('id') ?? undefined) ?? 0, measures: kids(s, 'Measure') }))
    .filter(s => s.measures.length > 0);
  const byId = new Map(staves.map(s => [s.id, s.measures]));
  const parts = readParts(score, staves.map(s => s.id));
  const listed = new Set(parts.flatMap(p => p.staffIds));
  for (const s of staves) {     // a staff no part lists still counts
    if (!listed.has(s.id)) parts.push({ name: `Staff ${s.id}`, instrument: '', percussion: false, transpose: 0, staffIds: [s.id] });
  }

  const { bars, sigs } = readGrid(staves[0]?.measures ?? [], items);
  const timeSig = songTimeSig(file, sigs);
  const meter = timeSig[0] * 4 / timeSig[1];
  const pickup = bars.length > 0 && bars[0].length < meter - EPS ? bars[0].length : 0;

  const tracks: ParsedTrack[] = [];
  const symbols: Timed[] = [];     // chord symbols of the whole score
  for (const part of parts) {
    const staffReads = part.staffIds.map(staffId => {
      const measures = byId.get(staffId) ?? [];
      const read = Array.from({ length: MAX_VOICES }, (_, v) => ({ voice: v + 1, ...dialect.readVoice(bars, measures, v) }));
      for (const r of read) symbols.push(...r.harmonies);
      return { staffId, staffNo: part.staffIds.indexOf(staffId) + 1, voices: read.filter(v => v.notes.length > 0) };
    });
    const staffCount = staffReads.filter(r => r.voices.length > 0).length;
    for (const { staffId, staffNo, voices } of staffReads) {
      for (const { voice, notes, lyrics } of voices) {
        const name = part.name + (staffCount > 1 ? ` · staff ${staffNo}` : '') + (voices.length > 1 ? ` · voice ${voice}` : '');
        tracks.push({
          id: `${staffId}:${voice}`, name, instrument: part.instrument, channel: part.percussion ? 10 : null,
          percussion: part.percussion, notes, lyrics, chords: [],
        });
      }
    }
  }
  // Every pitched track carries all symbols of the score, in position order, each (position, text) once.
  symbols.sort((a, b) => a.at - b.at);     // stable: symbols at one position keep their order
  const seen = new Set<string>();
  const chords = symbols.filter(s => {
    const key = `${Math.round(s.at * 1e6)}|${s.text}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
  for (const t of tracks) if (!t.percussion) t.chords = chords;
  if (!tracks.some(t => !t.percussion)) throw new ImportError(`"${file}" has no melody track.`);

  const keyPart = parts.find(p => !p.percussion && p.staffIds.length > 0);
  const key = readKey(score, version, keyPart && byId.get(keyPart.staffIds[0]), keyPart?.transpose ?? 0, items);
  return { file, format: 'MuseScore', timeSig, tempo: readTempo(staves.map(s => s.measures), items), key, pickup, marks: dialect.readMarks(bars), tracks };
}
