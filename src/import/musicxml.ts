import JSZip from 'jszip';
import { ROOT_NAMES } from './chordNames';
import { barAt, barEndingAt, barStartingAt } from './grid';
import { jumpCollector, mergeMarks } from './jumpMarks';
import { songTimeSig } from './meter';
import { own } from './own';
import { MODE_BELOW_MAJOR } from '../domain/keys';
import type { Jump, Mode, TimeSig } from '../domain/types';
import { ImportError, type ParsedMark, type ParsedSong, type ParsedTrack, type RawNote } from './types';

const DEFAULT_TEMPO = 120;
const EPS = 1e-9;
const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const KIND_SUFFIX: Record<string, string> = {
  major: '', minor: 'm', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7', diminished: 'dim',
  augmented: 'aug', 'half-diminished': 'm7♭5', 'suspended-fourth': 'sus4', 'diminished-seventh': 'dim7',
  'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9', 'suspended-second': 'sus2', power: '5', 'major-minor': 'm(maj7)',
};
const NO_CHORD = /^n\.?\s*c\.?$/i;
const BEAT_UNITS: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 };

interface WrittenKey { tonicPc: number; mode: Mode | null; transpose: number }
type Mark = ParsedMark;
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

/** UTF-16 by byte-order mark (some Finale and Sibelius exports), else UTF-8. The decoder drops the mark. */
function decode(b: Uint8Array): string {
  const label = b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(label).decode(b);
}

async function readXml(file: string, bytes: Uint8Array): Promise<string> {
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
  return songTimeSig(file, sigs);
}

const mod12 = (x: number): number => ((x % 12) + 12) % 12;

const MUSICXML_MODES: Record<string, Mode> = {
  major: 'major', ionian: 'major', minor: 'minor', aeolian: 'minor',
  dorian: 'dorian', phrygian: 'phrygian', lydian: 'lydian', mixolydian: 'mixolydian', locrian: 'locrian',
};

/** The key as written in a part, with the part's transposition at that point (semitones, written to concert). */
function writtenKey(k: Element, transpose: number): WrittenKey | null {
  const fifths = num(text(k, 'fifths'));
  if (fifths === null) return null;
  const given = text(k, 'mode');
  const mode = (given !== undefined ? own(MUSICXML_MODES, given) : undefined) ?? null;    // unknown or no mode: estimated later
  return { tonicPc: mod12(fifths * 7 + (mode ? MODE_BELOW_MAJOR[mode] : 0)), mode, transpose };
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
    const unit = own(BEAT_UNITS, text(m, 'beat-unit') ?? 'quarter') ?? 1;
    return perMinute * unit * (kid(m, 'beat-unit-dot') ? 1.5 : 1);
  }
  return DEFAULT_TEMPO;
}

function chordText(h: Element, transpose: number): string {
  const name = (parent: Element | undefined, step: string, alter: string): string => {
    const letter = text(parent, step) ?? '';
    const a = Math.round(num(text(parent, alter)) ?? 0);
    const pc = own(STEP_PC, letter);
    if (transpose !== 0 && pc !== undefined) return ROOT_NAMES[mod12(pc + a + transpose)];
    return letter + (a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));
  };
  const kind = kid(h, 'kind');
  const kindName = kind?.textContent?.trim() ?? '';
  if (kindName === 'none' || NO_CHORD.test(kind?.getAttribute('text')?.trim() ?? '')) return '';
  const suffix = own(KIND_SUFFIX, kindName) ?? (kind?.getAttribute('text') ?? '');
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

type Jumps = ReturnType<typeof jumpCollector>;
type Family = 'dc' | 'ds';

/** The jumps the words of a direction name, without dots and spaces: "D.S. al Coda" is `dsalcoda`. */
const WORD_JUMPS: Record<string, Jump> = {};
for (const [heads, forms] of [[['dc', 'dacapo'], ['dc', 'dcFine', 'dcCoda']], [['ds', 'dalsegno'], ['ds', 'dsFine', 'dsCoda']]] as const) {
  for (const head of heads) {
    WORD_JUMPS[head] = forms[0];
    WORD_JUMPS[`${head}alfine`] = forms[1];
    WORD_JUMPS[`${head}alcoda`] = forms[2];
  }
}

/**
 * Reads what one measure says about jumps. A mark belongs to the measure it is written in, wherever it stands there:
 * Segno and Coda to the first bar of the measure, Fine, To Coda and the jumps to its last bar. A sign in a right barline
 * belongs to the start of the next measure. Words decide a jump; a `sound` without words is settled by the file's Fine or To Coda.
 */
function measureJumpReader(measureStart: number, measureEnd: number, grid: Grid, jumps: Jumps) {
  const first = barAt(grid, measureStart);
  const last = barEndingAt(grid, measureEnd);
  const wordJumps: string[] = [];
  const soundJumps: Family[] = [];
  const sound = (el: Element) => {
    const has = (name: string) => el.getAttribute(name) !== null;
    if (has('segno')) jumps.segno(first);
    if (has('coda')) jumps.coda(first);
    if (has('fine')) jumps.fine(last);
    if (has('tocoda')) jumps.toCoda(last);
    if (has('dacapo')) soundJumps.push('dc');
    if (has('dalsegno')) soundJumps.push('ds');
  };
  /** The words without anything but letters: dots, spaces and symbols such as the Coda sign are no part of the match. */
  const squeeze = (words: string) => words.toLowerCase().replace(/[^\p{L}]/gu, '');
  return {
    read(el: Element): void {
      if (el.localName === 'barline') {
        const bar = el.getAttribute('location') === 'left' ? first : barAt(grid, measureEnd);
        if (kid(el, 'segno')) jumps.segno(bar);
        if (kid(el, 'coda')) jumps.coda(bar);
      } else if (el.localName === 'sound') {
        sound(el);
      } else if (el.localName === 'direction') {
        const types = kids(el, 'direction-type');
        if (types.some(d => kid(d, 'segno'))) jumps.segno(first);
        if (types.some(d => kid(d, 'coda'))) jumps.coda(first);
        const words = types.flatMap(d => kids(d, 'words')).map(w => w.textContent ?? '').join(' ').trim();
        const plain = squeeze(words);
        if (plain === 'fine') jumps.fine(last);
        else if (plain === 'tocoda') jumps.toCoda(last);
        else if (/^(dc|ds|dacapo|dalsegno)/.test(plain)) wordJumps.push(words);
        for (const sd of kids(el, 'sound')) sound(sd);
      }
    },
    /** At the end of the measure, when its words and its sounds are all in. */
    finish(): void {
      if (wordJumps.length === 0) {
        for (const family of soundJumps) jumps.jumpByFile(last, family);
        return;
      }
      for (const words of wordJumps) {
        const form = own(WORD_JUMPS, squeeze(words));
        if (form) jumps.jump(last, form);
        else jumps.unsupported(last, words);
      }
    },
  };
}

function readPart(part: Element, info: Map<string, Element>, grid: Grid, marks: Map<number, Mark> | null, jumps: Jumps): PartResult {
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
    const measureJumps = measureJumpReader(measureStart, measureEnd, grid, jumps);
    for (const el of Array.from(measure.children)) {
      const name = el.localName;
      if (name === 'direction' || name === 'sound' || name === 'barline') measureJumps.read(el);
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
        if (rep === 'forward') mark(barStartingAt(grid, measureStart)).rs = true;
        if (rep === 'backward') mark(barEndingAt(grid, measureEnd)).re = true;
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
        const step = own(STEP_PC, text(pitch, 'step') ?? '');
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
    measureJumps.finish();
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
  const jumps = jumpCollector();      // the marks of every part, merged by bar: the marks may stand in any one part
  const tracks: ParsedTrack[] = [];
  const results = parts.map((part, i) => readPart(part, info, grid, i === 0 ? marks : null, jumps));
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
  const found = jumps.result(pickup);
  return {
    file, format: 'MusicXML', timeSig, tempo: readTempo(root), key: concertKey(results), pickup,
    marks: mergeMarks(Array.from(marks.values()), found.marks), dropped: found.dropped, tracks,
  };
}
