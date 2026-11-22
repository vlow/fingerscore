import JSZip from 'jszip';
import { isSupportedTimeSig } from '../domain/time';
import type { TimeSig } from '../domain/types';
import { ImportError, type ParsedSong, type ParsedTrack, type RawNote } from './types';

const DEFAULT_TEMPO = 120;
const EPS = 1e-9;
const ROOT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const KIND_SUFFIX: Record<string, string> = {
  major: '', minor: 'm', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7', diminished: 'dim',
  augmented: 'aug', 'half-diminished': 'm7♭5', 'suspended-fourth': 'sus4',
};
const BEAT_UNITS: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 };

interface WrittenKey { tonicPc: number; mode: 'major' | 'minor' | null; transpose: number }
type Mark = ParsedSong['marks'][number];
type Lyric = ParsedTrack['lyrics'][number];

// ---- DOM helpers ----

const kids = (el: Element, name: string): Element[] => Array.from(el.children).filter(c => c.localName === name);
const kid = (el: Element, name: string): Element | undefined => kids(el, name)[0];
const text = (el: Element | undefined, name: string): string | undefined => {
  const t = el && kid(el, name)?.textContent;
  return t == null ? undefined : t.trim();
};
const num = (s: string | undefined): number | null => {
  if (s === undefined || s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

// ---- container and XML ----

async function readXml(file: string, bytes: Uint8Array): Promise<string> {
  const decode = (b: Uint8Array) => new TextDecoder('utf-8').decode(b);
  const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return decode(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const container = zip.file('META-INF/container.xml');
  if (!container) throw unreadable(file);
  const cdoc = new DOMParser().parseFromString(await container.async('string'), 'application/xml');
  const rootfiles = Array.from(cdoc.getElementsByTagName('rootfile'));
  const path = (rootfiles.find(r => !/pdf|image/i.test(r.getAttribute('media-type') ?? '')) ?? rootfiles[0])?.getAttribute('full-path');
  const entry = path ? zip.file(path) : null;
  if (!entry) throw unreadable(file);
  return decode(await entry.async('uint8array'));
}

const unreadable = (file: string) => new ImportError(`"${file}" could not be read as a MusicXML file.`);

function parseDoc(file: string, source: string): Element {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length > 0 || root.localName !== 'score-partwise') throw unreadable(file);
  return root;
}

// ---- song-level facts ----

function readTimeSig(file: string, root: Element): TimeSig {
  const sigs = Array.from(root.getElementsByTagName('time')).map(t => [num(text(t, 'beats')), num(text(t, 'beat-type'))] as const)
    .filter((s): s is readonly [number, number] => s[0] !== null && s[1] !== null);
  const first = sigs[0] ?? [4, 4];
  if (!isSupportedTimeSig(first[0], first[1])) {
    throw new ImportError(`${file} is in ${first[0]}/${first[1]}. fingerscore reads 4/4, 3/4, 2/4 and 6/8 for now.`);
  }
  if (sigs.some(s => s[0] !== first[0] || s[1] !== first[1])) {
    throw new ImportError(`${file} changes its time signature. fingerscore reads one time signature per song for now.`);
  }
  return [first[0], first[1]] as TimeSig;
}

const mod12 = (x: number): number => ((x % 12) + 12) % 12;

/** The key as written in a part, with the part's transposition at that point (semitones, written to concert). */
function writtenKey(k: Element, transpose: number): WrittenKey | null {
  const fifths = num(text(k, 'fifths'));
  if (fifths === null) return null;
  const given = text(k, 'mode');
  const mode = given === 'minor' ? 'minor' : given === 'major' ? 'major' : null;    // other or no mode: estimated later
  return { tonicPc: mod12(fifths * 7 + (mode === 'minor' ? 9 : 0)), mode, transpose };
}

/** Concert key: from the first part that does not transpose, else the first part's key converted. */
function concertKey(results: PartResult[]): ParsedSong['key'] {
  const keys = results.map(r => r.key).filter((k): k is WrittenKey => k !== null);
  const k = keys.find(x => mod12(x.transpose) === 0) ?? keys[0];
  return k ? { tonicPc: mod12(k.tonicPc + k.transpose), mode: k.mode } : null;
}

function readTempo(root: Element): number {
  for (const s of Array.from(root.getElementsByTagName('sound'))) {
    const t = num(s.getAttribute('tempo') ?? undefined);
    if (t !== null && t > 0) return t;
  }
  const m = root.getElementsByTagName('metronome')[0];
  const perMinute = num(text(m, 'per-minute'));
  if (m && perMinute !== null && perMinute > 0) {
    const unit = BEAT_UNITS[text(m, 'beat-unit') ?? 'quarter'] ?? 1;
    return perMinute * unit * (kid(m, 'beat-unit-dot') ? 1.5 : 1);
  }
  return DEFAULT_TEMPO;
}

function chordText(h: Element, transpose: number): string {
  const name = (parent: Element | undefined, step: string, alter: string): string => {
    const letter = text(parent, step) ?? '';
    const a = Math.round(num(text(parent, alter)) ?? 0);
    if (transpose !== 0 && letter in STEP_PC) return ROOT_NAMES[mod12(STEP_PC[letter] + a + transpose)];
    return letter + (a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));
  };
  const kind = kid(h, 'kind');
  const kindName = kind?.textContent?.trim() ?? '';
  const suffix = kindName in KIND_SUFFIX ? KIND_SUFFIX[kindName] : (kind?.getAttribute('text') ?? '');
  const bassEl = kid(h, 'bass');
  const bass = bassEl ? `/${name(bassEl, 'bass-step', 'bass-alter')}` : '';
  const root = name(kid(h, 'root'), 'root-step', 'root-alter');
  return root === '' ? '' : root + suffix + bass;
}

function lyricOf(note: Element): string | null {
  const all = kids(note, 'lyric');
  const ly = all.find(l => (l.getAttribute('number') ?? '1') === '1') ?? all[0];
  if (!ly) return null;
  const body = kids(ly, 'text').map(t => t.textContent ?? '').join('').trim();
  if (body === '') return null;
  const syllabic = text(ly, 'syllabic');
  return syllabic === 'begin' || syllabic === 'middle' ? `${body}-` : body;
}

// ---- parts ----

interface PartResult { key: WrittenKey | null; id: string; name: string; instrument: string; channel: number | null; voices: Map<string, { notes: RawNote[]; lyrics: Lyric[] }>; chords: Lyric[] }

/** Where measures start, in quarter notes, and how bars are laid over them. Shared by all parts. */
interface Grid {
  starts: number[]; ends: number[]; pickup: number; barLength: number;
}

/**
 * Walk the first part's measures. A measure's extent is the furthest position anything reaches, capped at a bar.
 * The first measure shorter than a bar is the pickup. A later measure keeps its real extent only when it or a
 * neighbour other than the pickup is `implicit="yes"` (a bar split by a mid-bar repeat); otherwise it counts as a full bar.
 */
function measureGrid(part: Element | undefined, barLength: number, divisionsDefault: number): Grid {
  const measures = part ? kids(part, 'measure') : [];
  const implicit = measures.map(m => m.getAttribute('implicit') === 'yes');
  let divisions = divisionsDefault;
  const extents = measures.map(m => {
    let pos = 0;
    let max = 0;
    for (const el of Array.from(m.children)) {
      const dur = (num(text(el, 'duration')) ?? 0) / divisions;
      if (el.localName === 'attributes') divisions = num(text(el, 'divisions')) ?? divisions;
      else if (el.localName === 'note') {
        if (!kid(el, 'chord') && !kid(el, 'grace')) pos += dur;
      } else if (el.localName === 'forward') pos += dur;
      else if (el.localName === 'backup') pos -= dur;
      max = Math.max(max, pos);
    }
    return Math.min(max, barLength);
  });
  const first = extents[0] ?? 0;
  const pickup = first > EPS && first < barLength - EPS ? first : 0;
  const starts: number[] = [];
  const ends: number[] = [];
  let t = 0;
  extents.forEach((e, i) => {
    const split = implicit[i] || (i > 1 && implicit[i - 1]) || implicit[i + 1] === true;   // the pickup is no split half
    const length = i === 0 ? (pickup > 0 ? pickup : barLength) : split && e < barLength - EPS ? e : barLength;
    starts.push(t);
    t += length;
    ends.push(t);
  });
  return { starts, ends, pickup, barLength };
}

/** Start of measure i; parts longer than the first part continue in full bars. */
function measureStartAt(g: Grid, i: number): number {
  if (i < g.starts.length) return g.starts[i];
  const last = g.ends.length > 0 ? g.ends[g.ends.length - 1] : 0;
  return last + (i - g.starts.length) * g.barLength;
}

/** Index of the bar (incl. pickup bar) that contains time t. */
function barAt(g: Grid, t: number): number {
  if (g.pickup > 0 && t < g.pickup - EPS) return 0;
  return Math.floor((t - g.pickup) / g.barLength + EPS) + (g.pickup > 0 ? 1 : 0);
}

const onBarLine = (g: Grid, t: number): boolean => {
  const k = (t - g.pickup) / g.barLength;
  return t < EPS || Math.abs(k - Math.round(k)) < EPS;
};

/** Ending numbers are a list ("1", "1,2", "1-2"). Only a plain 1 or 2 maps to a volta. */
function voltaOf(list: string): '1' | '2' | null {
  const numbers = new Set<number>();
  for (const token of list.split(',')) {
    const range = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(token);
    const lo = range ? Number(range[1]) : Number(token);
    const hi = range ? Number(range[2]) : lo;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi - lo > 50) return null;
    for (let k = lo; k <= hi; k++) numbers.add(k);
  }
  if (numbers.size !== 1) return null;
  return numbers.has(1) ? '1' : numbers.has(2) ? '2' : null;
}

function readPart(part: Element, info: Map<string, Element>, grid: Grid, marks: Map<number, Mark> | null): PartResult {
  const id = part.getAttribute('id') ?? 'P1';
  const sp = info.get(id);
  const channel = num(text(kid(sp ?? part, 'midi-instrument'), 'midi-channel'));
  const result: PartResult = {
    key: null, id, name: text(sp, 'part-name') ?? '', instrument: text(kid(sp ?? part, 'score-instrument'), 'instrument-name') ?? '',
    channel, voices: new Map(), chords: [],
  };
  const open = new Map<string, Map<number, RawNote>>();      // per voice: pitch → note waiting for its tie stop
  let divisions = 1;
  let transpose = 0;      // semitones from written to concert pitch
  let measureStart = 0;
  let voltaActive: '1' | '2' | null = null;
  const mark = (bar: number): Mark => {
    const m = marks!.get(bar) ?? { bar };
    marks!.set(bar, m);
    return m;
  };

  kids(part, 'measure').forEach((measure, index) => {
    measureStart = measureStartAt(grid, index);
    const measureEnd = index < grid.ends.length ? grid.ends[index] : measureStart + grid.barLength;
    let pos = 0;
    let lastStart = 0;
    let endVolta = false;
    for (const el of Array.from(measure.children)) {
      const name = el.localName;
      if (name === 'attributes') {
        divisions = num(text(el, 'divisions')) ?? divisions;
        const tr = kid(el, 'transpose');
        if (tr) transpose = (num(text(tr, 'chromatic')) ?? 0) + 12 * (num(text(tr, 'octave-change')) ?? 0);
        const keyEl = kid(el, 'key');
        if (keyEl && !result.key) result.key = writtenKey(keyEl, transpose);
      } else if (name === 'backup' || name === 'forward') {
        const d = (num(text(el, 'duration')) ?? 0) / divisions;
        pos += name === 'forward' ? d : -d;
      } else if (name === 'harmony') {
        const offset = (num(text(el, 'offset')) ?? 0) / divisions;
        const chord = chordText(el, transpose);
        if (chord !== '') result.chords.push({ at: measureStart + pos + offset, text: chord });
      } else if (name === 'barline') {
        if (!marks) continue;
        const rep = kid(el, 'repeat')?.getAttribute('direction');
        // a forward repeat mid-bar starts the next bar; a backward repeat mid-bar ends the bar containing it
        if (rep === 'forward') mark(barAt(grid, measureStart) + (onBarLine(grid, measureStart) ? 0 : 1)).rs = true;
        if (rep === 'backward') mark(barAt(grid, measureEnd) - (onBarLine(grid, measureEnd) ? 1 : 0)).re = true;
        const ending = kid(el, 'ending');
        const type = ending?.getAttribute('type');
        if (ending && type === 'start') {
          voltaActive = voltaOf(ending.getAttribute('number') ?? '');
        } else if (ending && (type === 'stop' || type === 'discontinue')) endVolta = true;
      } else if (name === 'note') {
        if (kid(el, 'grace')) continue;
        const dur = (num(text(el, 'duration')) ?? 0) / divisions;
        const isChord = !!kid(el, 'chord');
        const start = isChord ? lastStart : pos;
        if (!isChord) {
          lastStart = pos;
          pos += dur;
        }
        const pitch = kid(el, 'pitch');
        if (!pitch || kid(el, 'rest') || kid(el, 'cue')) continue;     // cue notes take time but are not played
        const step = STEP_PC[text(pitch, 'step') ?? ''];
        const octave = num(text(pitch, 'octave'));
        if (step === undefined || octave === null) continue;
        const midi = (octave + 1) * 12 + step + Math.round(num(text(pitch, 'alter')) ?? 0) + transpose;
        const abs = measureStart + start;

        const voiceId = text(el, 'voice') ?? '1';
        let voice = result.voices.get(voiceId);
        if (!voice) { voice = { notes: [], lyrics: [] }; result.voices.set(voiceId, voice); }
        const waiting = open.get(voiceId) ?? new Map<number, RawNote>();
        open.set(voiceId, waiting);

        const notations = kids(el, 'notations').flatMap(nt => kids(nt, 'tied'));
        const ties = [...kids(el, 'tie'), ...notations].map(t => t.getAttribute('type'));
        const tieStop = ties.includes('stop');
        const tieStart = ties.includes('start');
        let target = tieStop ? waiting.get(midi) : undefined;
        if (target && Math.abs(target.start + target.dur - abs) < 1e-6) {
          target.dur += dur;
        } else {
          target = { start: abs, dur, midi };
          voice.notes.push(target);
          const ly = lyricOf(el);
          if (ly !== null) voice.lyrics.push({ at: abs, text: ly });
        }
        if (tieStart) waiting.set(midi, target); else waiting.delete(midi);
      }
    }
    if (marks && voltaActive) {
      const m = mark(barAt(grid, (measureStart + measureEnd) / 2));
      m.volta ??= voltaActive;
    }
    if (endVolta) voltaActive = null;
  });
  return result;
}

export async function parseMusicXml(file: string, bytes: Uint8Array): Promise<ParsedSong> {
  let root: Element;
  try {
    root = parseDoc(file, await readXml(file, bytes));
  } catch (e) {
    throw e instanceof ImportError ? e : unreadable(file);
  }

  const timeSig = readTimeSig(file, root);
  const barLength = (timeSig[0] * 4) / timeSig[1];
  const parts = kids(root, 'part');
  const info = new Map<string, Element>();
  for (const sp of Array.from(root.getElementsByTagName('score-part'))) info.set(sp.getAttribute('id') ?? '', sp);

  const firstDivisions = num(text(kid(parts[0] ?? root, 'measure')?.getElementsByTagName('attributes')[0], 'divisions')) ?? 1;
  const grid = measureGrid(parts[0], barLength, firstDivisions);
  const pickup = grid.pickup;

  const marks = new Map<number, Mark>();
  const tracks: ParsedTrack[] = [];
  const results = parts.map((part, i) => readPart(part, info, grid, i === 0 ? marks : null));
  results.forEach((r, i) => {
    const voiceIds = Array.from(r.voices.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    voiceIds.forEach((vid, vi) => {
      const v = r.voices.get(vid)!;
      if (v.notes.length === 0) return;
      const base = r.name || `Part ${i + 1}`;
      tracks.push({
        id: `${r.id}:${vid}`,
        name: vi === 0 ? base : `${base} · voice ${vid}`,
        instrument: r.instrument,
        channel: r.channel,
        percussion: r.channel === 10,
        notes: [...v.notes].sort((a, b) => a.start - b.start || a.midi - b.midi),
        lyrics: v.lyrics,
        chords: r.chords,
      });
    });
  });

  if (!tracks.some(t => !t.percussion)) throw new ImportError(`"${file}" has no melody track.`);
  return {
    file, format: 'MusicXML', timeSig, tempo: readTempo(root), key: concertKey(results), pickup,
    marks: Array.from(marks.values()).sort((a, b) => a.bar - b.bar), tracks,
  };
}
