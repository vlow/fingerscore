import { songTimeSig } from '../meter';
import { ImportError, type ParsedSong, type ParsedTrack, type RawNote } from '../types';
import { durationQuarters, harmonyOf, kid, kids, lyricText, majorTonicOfFifths, mod12, num, text, type ScoreReader } from './common';

const DEFAULT_TEMPO = 120;
const EPS = 1e-9;
const MAX_VOICES = 4;

type Timed = { at: number; text: string };

interface PartInfo { name: string; instrument: string; percussion: boolean; transpose: number; staffIds: number[] }

/** `a/b` as a number (a fraction of a whole note when it comes from MuseScore). */
function fraction(s: string | undefined): number | null {
  const m = /^\s*(-?\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(s ?? '');
  if (!m) return null;
  const d = m[2] === undefined ? 1 : Number(m[2]);
  return d === 0 ? null : Number(m[1]) / d;
}

// ---- parts ----

/** The parts of the main score. A part's `<Staff>` carries its id in version 3; version 4 may leave it out, then the staves count up in order. */
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

interface Bar { el: Element; start: number; length: number }

/** The first staff's measure grid, and its time signatures. */
function readGrid(measures: Element[]): { bars: Bar[]; sigs: [number, number][] } {
  const sigs: [number, number][] = [];
  const bars: Bar[] = [];
  let meter = 4;
  let start = 0;
  for (const m of measures) {
    for (const v of kids(m, 'voice')) {
      for (const ts of kids(v, 'TimeSig')) {
        const n = num(text(ts, 'sigN')), d = num(text(ts, 'sigD'));
        if (n !== null && d !== null && d > 0) { sigs.push([n, d]); meter = n * 4 / d; }
      }
    }
    const declared = (fraction(m.getAttribute('len') ?? undefined) ?? NaN) * 4;
    const length = declared > 0 ? declared : meter;     // a zero, negative or missing length is the meter's
    bars.push({ el: m, start, length });
    start += length;
  }
  return { bars, sigs };
}

// ---- voices ----

const isGrace = (chord: Element): boolean =>
  Array.from(chord.children).some(c => /^(grace|acciaccatura|appoggiatura)/.test(c.localName));

const hasTieStart = (note: Element): boolean =>
  kids(note, 'Spanner').some(s => s.getAttribute('type') === 'Tie' && kid(s, 'next') !== undefined);

/** Verse 1 text of a chord: a `<Lyrics>` without `<no>` or with `<no>0</no>`. */
function verseOne(chord: Element): string | null {
  const ly = kids(chord, 'Lyrics').find(l => (num(text(l, 'no')) ?? 0) === 0);
  const body = ly && text(ly, 'text');
  return ly && body ? lyricText(body, text(ly, 'syllabic') ?? null) : null;
}

/**
 * Notes, verse 1 lyrics and chord symbols of one voice over all measures. A note with a tie start continues into the next
 * note of its pitch. A chord symbol sits at the next chord or rest of its voice.
 */
function readVoice(bars: Bar[], staffMeasures: Element[], voiceIndex: number): { notes: RawNote[]; lyrics: Timed[]; harmonies: Timed[] } {
  const notes: RawNote[] = [];
  const lyrics: Timed[] = [];
  const harmonies: Timed[] = [];
  let waitingHarmonies: string[] = [];
  const open = new Map<number, RawNote>();     // tied notes waiting for their continuation, by pitch
  staffMeasures.forEach((m, i) => {
    const voice = kids(m, 'voice')[voiceIndex];
    if (!voice || i >= bars.length) return;
    const bar = bars[i];
    let pos = bar.start;
    const ratios: number[] = [];
    for (const el of Array.from(voice.children)) {
      const name = el.localName;
      if (name === 'Tuplet') {
        const normal = num(text(el, 'normalNotes')), actual = num(text(el, 'actualNotes'));
        ratios.push(normal && actual ? normal / actual : 1);
      } else if (name === 'endTuplet') {
        ratios.pop();
      } else if (name === 'location') {
        pos += (fraction(text(el, 'fractions')) ?? 0) * 4;
      } else if (name === 'Harmony') {
        const h = harmonyOf(el);
        if (h !== null) waitingHarmonies.push(h);
      } else if (name === 'Chord' || name === 'Rest') {
        if (name === 'Chord' && isGrace(el)) continue;
        for (const h of waitingHarmonies) harmonies.push({ at: pos, text: h });
        waitingHarmonies = [];
        const type = text(el, 'durationType') ?? '';
        const written = type === 'measure' ? bar.length : durationQuarters(type, num(text(el, 'dots')) ?? 0);
        if (written === null) throw new Error(`unknown note value ${type}`);
        const dur = type === 'measure' ? written : written * ratios.reduce((a, r) => a * r, 1);
        if (name === 'Chord') {
          const ly = verseOne(el);
          if (ly !== null) lyrics.push({ at: pos, text: ly });
          for (const note of kids(el, 'Note')) {
            const midi = num(text(note, 'pitch'));
            if (midi === null) continue;
            const waiting = open.get(midi);
            if (waiting && Math.abs(waiting.start + waiting.dur - pos) < EPS) {
              waiting.dur += dur;
              if (!hasTieStart(note)) open.delete(midi);
            } else {
              const raw = { start: pos, dur, midi };
              notes.push(raw);
              if (hasTieStart(note)) open.set(midi, raw); else open.delete(midi);
            }
          }
        }
        pos += dur;
      }
    }
  });
  return { notes: notes.sort((a, b) => a.start - b.start), lyrics, harmonies };
}

// ---- repeats and endings ----

/** Repeat signs and endings 1 and 2 of the first staff, as `ParsedSong.marks` (bar index = measure index). */
function readMarks(bars: Bar[]): ParsedSong['marks'] {
  const marks = new Map<number, ParsedSong['marks'][number]>();
  const at = (bar: number) => { let m = marks.get(bar); if (!m) { m = { bar }; marks.set(bar, m); } return m; };
  bars.forEach(({ el }, i) => {
    if (kid(el, 'startRepeat')) at(i).rs = true;
    if (kid(el, 'endRepeat')) at(i).re = true;
    for (const spanner of kids(el, 'voice').flatMap(v => kids(v, 'Spanner'))) {
      if (spanner.getAttribute('type') !== 'Volta') continue;
      const endings = text(kid(spanner, 'Volta'), 'endings');
      const next = kid(spanner, 'next');
      if ((endings !== '1' && endings !== '2') || !next) continue;
      // Rule from the Entertainer sample: the end sits `measures` bars on, plus a part of a bar when `fractions` is there: an ending inside one bar has no `measures`.
      const location = kid(next, 'location');
      const length = (num(text(location, 'measures')) ?? 0) + ((fraction(text(location, 'fractions')) ?? 0) > 0 ? 1 : 0);
      for (let b = i; b < Math.min(i + Math.max(length, 1), bars.length); b++) at(b).volta = endings;
    }
  });
  return Array.from(marks.values()).sort((a, b) => a.bar - b.bar);
}

// ---- song-level facts ----

function readTempo(measures: Element[][]): number {
  for (const staffMeasures of measures) {
    for (const m of staffMeasures) {
      for (const v of kids(m, 'voice')) {
        for (const t of kids(v, 'Tempo')) {
          const perSecond = num(text(t, 'tempo'));
          if (perSecond !== null && perSecond > 0) return Math.round(perSecond * 60);
        }
      }
    }
  }
  return DEFAULT_TEMPO;
}

/** Concert key from the first measure of the first pitched part's first staff. */
function readKey(score: Element, version: number, first: Element[] | undefined, transpose: number): ParsedSong['key'] {
  const sig = first?.[0] && kids(first[0], 'voice').flatMap(v => kids(v, 'KeySig'))[0];
  if (version >= 4) {
    return { tonicPc: majorTonicOfFifths(num(text(sig, 'concertKey')) ?? 0), mode: null };
  }
  const written = majorTonicOfFifths(num(text(sig, 'accidental')) ?? 0);
  const concertPitch = text(kid(score, 'Style'), 'concertPitch') === '1';
  return { tonicPc: concertPitch ? written : mod12(written + transpose), mode: null };
}

export const readV3: ScoreReader = (file, score, version) => {
  const staves = kids(score, 'Staff')
    .map(s => ({ id: num(s.getAttribute('id') ?? undefined) ?? 0, measures: kids(s, 'Measure') }))
    .filter(s => s.measures.length > 0);
  const byId = new Map(staves.map(s => [s.id, s.measures]));
  const parts = readParts(score, staves.map(s => s.id));
  const listed = new Set(parts.flatMap(p => p.staffIds));
  for (const s of staves) {     // a staff no part lists still counts
    if (!listed.has(s.id)) parts.push({ name: `Staff ${s.id}`, instrument: '', percussion: false, transpose: 0, staffIds: [s.id] });
  }

  const { bars, sigs } = readGrid(staves[0]?.measures ?? []);
  const timeSig = songTimeSig(file, sigs);
  const meter = timeSig[0] * 4 / timeSig[1];
  const pickup = bars.length > 0 && bars[0].length < meter - EPS ? bars[0].length : 0;

  const tracks: ParsedTrack[] = [];
  const symbols: Timed[] = [];     // chord symbols of the whole score
  for (const part of parts) {
    const staffReads = part.staffIds.map(staffId => {
      const measures = byId.get(staffId) ?? [];
      const read = Array.from({ length: MAX_VOICES }, (_, v) => ({ voice: v + 1, ...readVoice(bars, measures, v) }));
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
  const chords = symbols.filter((s, i) => !symbols.slice(0, i).some(o => o.at === s.at && o.text === s.text));
  for (const t of tracks) if (!t.percussion) t.chords = chords;
  if (!tracks.some(t => !t.percussion)) throw new ImportError(`"${file}" has no melody track.`);

  const keyPart = parts.find(p => !p.percussion && p.staffIds.length > 0);
  const key = readKey(score, version, keyPart && byId.get(keyPart.staffIds[0]), keyPart?.transpose ?? 0);
  return { file, format: 'MuseScore', timeSig, tempo: readTempo(staves.map(s => s.measures)), key, pickup, marks: readMarks(bars), tracks };
};
