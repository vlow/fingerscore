import Parse, { type AbcElement, type AbcKey, type AbcMeter, type AbcPitch, type AbcStaff } from 'abcjs/src/parse/abc_parse';
import { mod12 } from '../domain/keys';
import type { Mode } from '../domain/types';
import { ROOT_NAMES } from './chordNames';
import { songTimeSig } from './meter';
import { ImportError, type ParsedSong, type ParsedTrack, type RawNote } from './types';

const DEFAULT_TEMPO = 120;
const EPS = 1e-9;
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];              // C D E F G A B
const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];             // F C G D A E B, as letter indexes
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];              // B E A D G C F
const ABC_MODES: Record<string, Mode> = { '': 'major', m: 'minor', Dor: 'dorian', Phr: 'phrygian', Lyd: 'lydian', Mix: 'mixolydian', Loc: 'locrian' };
const MAJOR_FIFTHS: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1 };
/** Fifths a mode adds to the major key on the same tonic. */
const MODE_FIFTHS: Record<Mode, number> = { major: 0, lydian: 1, mixolydian: -1, dorian: -2, minor: -3, phrygian: -4, locrian: -5 };
const ACCIDENTAL_SEMITONES: Record<string, number> = { sharp: 1, flat: -1, natural: 0, dblsharp: 2, dblflat: -2 };
const CHORD_SYMBOL = /^([A-G])([#b♯♭]?)(.*?)(?:\/([A-G])([#b♯♭]?))?$/;
/** What may follow the root: a kind word that ends there, or anything that does not start with a letter. */
const CHORD_START = /^(?:[0-9mMdasoø°+\-(Δ]|$)/;
const CHORD_KIND = /^(?:m(?:aj|in)?|dim|aug|sus|add|alt|o)?(?![a-z])/;

const unreadable = (file: string) => new ImportError(`"${file}" could not be read as an ABC file.`);

// ---- text ----

/** UTF-8, else Latin-1. The decoder drops a byte-order mark. */
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

/** The first tune: from the first `X:` line to the next one. A file without `X:` is one tune. */
function firstTune(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  const start = lines.findIndex(l => /^X:/.test(l));
  if (start < 0) return lines;
  const next = lines.findIndex((l, i) => i > start && /^X:/.test(l));
  return lines.slice(start, next < 0 ? undefined : next);
}

const isMusicLine = (l: string) => l.trim() !== '' && !l.startsWith('%') && !/^[A-Za-z+]:/.test(l);
const NAMES_VOICE = (l: string) => /^V:/.test(l) || (isMusicLine(l) && /\[V:/.test(l));
const DEFAULT_VOICE = '_melody';

/**
 * Music that comes before the first `V:` line belongs to a voice of its own. abcjs would fold it into the first
 * named voice, so give it an explicit one.
 */
function withDefaultVoice(lines: string[]): string[] {
  const firstMusic = lines.findIndex(isMusicLine);
  const firstVoice = lines.findIndex(NAMES_VOICE);
  if (firstMusic < 0 || firstVoice < 0 || firstMusic >= firstVoice) return lines;
  return [...lines.slice(0, firstMusic), `V:${DEFAULT_VOICE}`, ...lines.slice(firstMusic)];
}

/** Voice ids in the order the tune first names them: `V:` field lines and inline `[V:id]`. */
function voiceIds(lines: string[]): string[] {
  const ids: string[] = [];
  const add = (id: string | undefined) => { if (id && !ids.includes(id)) ids.push(id); };
  for (const line of lines) {
    if (line.startsWith('%')) continue;
    const field = /^V:\s*([^\s%]+)/.exec(line);
    if (field) { add(field[1]); continue; }
    if (/^[A-Za-z+]:/.test(line)) continue;
    for (const m of line.matchAll(/\[V:\s*([^\s\]]+)/g)) add(m[1]);
  }
  return ids;
}

// ---- keys ----

interface ReadKey { tonicPc: number; mode: Mode; alter: number[] }   // alter: semitones per letter index

function signatureAlter(fifths: number): number[] {
  const alter = [0, 0, 0, 0, 0, 0, 0];
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach(i => { alter[i] = 1; });
  if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach(i => { alter[i] = -1; });
  return alter;
}

/** Tonic and mode as written, and the signature they give. */
function readKey(file: string, k: Pick<AbcKey, 'root' | 'acc' | 'mode'>): ReadKey {
  const root = k.root === 'none' ? 'C' : k.root;
  const mode = ABC_MODES[k.mode];
  if (!(root in LETTER_INDEX) || mode === undefined) throw unreadable(file);
  const tonicPc = mod12(LETTER_PC[LETTER_INDEX[root]] + (k.acc === '#' ? 1 : k.acc === 'b' ? -1 : 0));
  const fifths = MAJOR_FIFTHS[root] + 7 * (k.acc === '#' ? 1 : k.acc === 'b' ? -1 : 0) + MODE_FIFTHS[mode];
  if (Math.abs(fifths) > 7) throw unreadable(file);
  return { tonicPc, mode, alter: signatureAlter(fifths) };
}

const CLEF_WORDS = /^(?:treble|bass|alto|tenor|perc|clef)/i;
/** Fifths a written mode word adds to the major key on the same tonic. */
function wordFifths(word: string): number {
  const w = word.toLowerCase();
  if (w === 'm' || w.startsWith('min') || w.startsWith('aeo')) return -3;
  if (w.startsWith('mix')) return -1;
  if (w.startsWith('dor')) return -2;
  if (w.startsWith('phr')) return -4;
  if (w.startsWith('lyd')) return 1;
  if (w.startsWith('loc')) return -5;
  return 0;
}

interface WrittenTonic { letter: string; acc: string }

/**
 * Reads the `K:` lines (field and inline) from the source text, apart from abcjs.
 * Refuses written accidentals (`exp ^f`, `_b`), a tonic that is not a note name, and a signature beyond seven
 * sharps or flats. Returns the tonic of the first line that names one.
 */
function checkSourceKeys(file: string, lines: string[]): WrittenTonic | null {
  const bodies = lines.flatMap(line => {
    if (line.startsWith('%')) return [];
    const field = /^K:([^%]*)/.exec(line);
    return field ? [field[1]] : Array.from(line.matchAll(/\[K:([^\]]*)\]/g), m => m[1]);
  });
  let first: WrittenTonic | null = null;
  for (const body of bodies) {
    const tokens = body.trim().split(/\s+/).filter(t => t !== '');
    if (tokens.some(t => t === 'exp' || /^(?:\^\^?|__?|=)[a-gA-G]$/.test(t))) throw unreadable(file);
    const head = tokens[0];
    if (head === undefined || head === 'none' || head.includes('=') || CLEF_WORDS.test(head)) continue;   // no tonic: the key stays
    const m = /^([A-G])([#b]?)(.*)$/.exec(head);
    if (!m) throw unreadable(file);
    const word = m[3] !== '' ? m[3] : tokens[1] && !tokens[1].includes('=') && !CLEF_WORDS.test(tokens[1]) ? tokens[1] : '';
    const fifths = MAJOR_FIFTHS[m[1]] + 7 * (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + wordFifths(word);
    if (Math.abs(fifths) > 7) throw unreadable(file);
    first ??= { letter: m[1], acc: m[2] };
  }
  return first;
}

// ---- meter and tempo ----

function meterOf(m: Pick<AbcMeter, 'type' | 'value'>): readonly [number, number] {
  if (m.type === 'common_time') return [4, 4];
  if (m.type === 'cut_time') return [2, 2];
  const v = m.value?.[0];
  if (m.type === 'specified' && v) {
    const num = v.num.split('+').reduce((sum, part) => sum + Number(part), 0);
    return [num, Number(v.den)];
  }
  return [3, 2];      // tempus perfectum and the other mensural signs: refused as an unsupported meter
}

function tempoOf(t: { duration?: number[]; bpm?: number } | undefined): number {
  const beat = (t?.duration ?? []).reduce((a, b) => a + b, 0) * 4;
  return t?.bpm && t.bpm > 0 && beat > 0 ? t.bpm * beat : DEFAULT_TEMPO;
}

// ---- chord symbols ----

/** A chord symbol with roots named by pitch class, moved by `transpose` semitones. Annotations and words give null. */
function chordText(name: string, transpose: number): string | null {
  const m = CHORD_SYMBOL.exec(name.trim());
  if (!m || /\s/.test(name.trim()) || !CHORD_START.test(m[3]) || !CHORD_KIND.test(m[3])) return null;
  const root = (letter: string, acc: string) =>
    ROOT_NAMES[mod12(LETTER_PC[LETTER_INDEX[letter]] + (acc === '#' || acc === '♯' ? 1 : acc === 'b' || acc === '♭' ? -1 : 0) + transpose)];
  return root(m[1], m[2]) + m[3] + (m[4] ? `/${root(m[4], m[5])}` : '');
}

// ---- voices ----

interface VoiceState {
  staff: number; voice: number;
  notes: RawNote[]; lyrics: ParsedTrack['lyrics']; chords: ParsedTrack['chords'];
  bars: { at: number; el: AbcElement }[];
  pos: number;                       // quarter notes
  key: ReadKey | null; keyName: string;
  barAccidentals: Map<number, number>;    // diatonic pitch → semitones, until the bar line
  waiting: Map<number, RawNote>;          // diatonic pitch → note waiting for its tie
  shift: number;                     // semitones from clef octave and transpose=
  transpose: number;                 // semitones from transpose= alone
  tupletLeft: number; tupletRatio: number;
}

const keyNameOf = (k: { root?: string; acc?: string; mode?: string }) => `${k.root}|${k.acc}|${k.mode}`;

function clefShift(clef: AbcStaff['clef']): number {
  const octave = /[+^]8$/.test(clef?.type ?? '') ? 12 : /[-_]8$/.test(clef?.type ?? '') ? -12 : 0;
  return octave + (clef?.transpose ?? 0);
}

function midiOf(state: VoiceState, p: AbcPitch): number {
  const letter = ((p.pitch % 7) + 7) % 7;
  let alter: number;
  if (p.accidental !== undefined) {
    alter = ACCIDENTAL_SEMITONES[p.accidental] ?? state.barAccidentals.get(p.pitch) ?? state.key!.alter[letter];
    if (p.accidental in ACCIDENTAL_SEMITONES) state.barAccidentals.set(p.pitch, alter);
  } else {
    alter = state.barAccidentals.get(p.pitch) ?? state.key!.alter[letter];
  }
  return 60 + 12 * Math.floor(p.pitch / 7) + LETTER_PC[letter] + alter + state.shift;
}

function readNote(state: VoiceState, el: AbcElement): void {
  if (el.duration === undefined) return;
  if (el.startTriplet !== undefined) {
    state.tupletRatio = el.tripletMultiplier ?? 1;
    state.tupletLeft = el.tripletR ?? el.startTriplet;
  }
  const dur = el.duration * 4 * (state.tupletLeft > 0 ? state.tupletRatio : 1);
  const at = state.pos;
  state.pos += dur;
  if (state.tupletLeft > 0) {
    state.tupletLeft -= 1;
    if (el.endTriplet) state.tupletLeft = 0;
  }

  const symbol = el.chord?.find(c => c.position === 'default');
  const text = symbol ? chordText(symbol.name, state.transpose) : null;
  if (text !== null) state.chords.push({ at, text });
  if (!el.pitches || el.rest) return;

  let fresh = false;
  for (const p of el.pitches) {
    const midi = midiOf(state, p);
    const target = p.endTie ? state.waiting.get(p.pitch) : undefined;
    let note: RawNote;
    if (target && Math.abs(target.start + target.dur - at) < 1e-6) {
      target.dur += dur;
      note = target;
    } else {
      note = { start: at, dur, midi };
      state.notes.push(note);
      fresh = true;
    }
    if (p.startTie) state.waiting.set(p.pitch, note); else state.waiting.delete(p.pitch);
  }

  const verse = el.lyric?.[0];
  if (fresh && verse && verse.syllable.trim() !== '') {
    state.lyrics.push({ at, text: verse.syllable.replace(/\u00a0/g, ' ') + (verse.divider === '-' ? '-' : '') });
  }
}

// ---- bars and endings ----

interface Grid { pickup: number; barLength: number }

function barAt(g: Grid, t: number): number {
  if (g.pickup > 0 && t < g.pickup - EPS) return 0;
  return Math.floor((t - g.pickup) / g.barLength + EPS) + (g.pickup > 0 ? 1 : 0);
}

const onBarLine = (g: Grid, t: number): boolean => {
  const k = (t - g.pickup) / g.barLength;
  return t < EPS || Math.abs(k - Math.round(k)) < EPS;
};

const voltaOf = (n: string): '1' | '2' | null => (/^\s*[12]\s*$/.test(n) ? (n.trim() as '1' | '2') : null);

/** Where the first bar ends: a short first bar is the pickup. */
function pickupOf(bars: VoiceState['bars'], barLength: number): number {
  const first = bars.find(b => b.at > EPS);
  return first && first.at < barLength - EPS ? first.at : 0;
}

function readMarks(bars: VoiceState['bars'], grid: Grid, end: number): ParsedSong['marks'] {
  const marks = new Map<number, ParsedSong['marks'][number]>();
  const mark = (bar: number) => {
    const m = marks.get(bar) ?? { bar };
    marks.set(bar, m);
    return m;
  };
  const lastBar = barAt(grid, Math.max(end - EPS, 0));
  let volta: '1' | '2' | null = null;
  for (const { at, el } of bars) {
    const boundary = onBarLine(grid, at);
    const next = barAt(grid, at) + (boundary ? 0 : 1);
    const before = barAt(grid, at) - (boundary ? 1 : 0);
    if ((el.type === 'bar_right_repeat' || el.type === 'bar_dbl_repeat') && before >= 0) mark(before).re = true;
    if ((el.type === 'bar_left_repeat' || el.type === 'bar_dbl_repeat') && next <= lastBar) mark(next).rs = true;
    if (el.endEnding) volta = null;
    if (el.startEnding !== undefined) volta = voltaOf(el.startEnding);
    if (volta && next <= lastBar) mark(next).volta ??= volta;
  }
  return Array.from(marks.values()).sort((a, b) => a.bar - b.bar);
}

// ---- entry ----

export async function parseAbc(file: string, bytes: Uint8Array): Promise<ParsedSong> {
  const lines = withDefaultVoice(firstTune(decode(bytes)));
  const written = checkSourceKeys(file, lines);
  const parser = new Parse();
  parser.parse(lines.join('\n') + '\n', {});
  const tune = parser.getTune();

  const meters: (readonly [number, number])[] = [];
  const states = new Map<string, VoiceState>();
  const titles = new Map<number, string>();
  const song: { key: ReadKey | null; root: string; acc: string } = { key: null, root: '', acc: '' };

  tune.lines.forEach(line => (line.staff ?? []).forEach((staff, s) => {
    if (staff.meter) meters.push(meterOf(staff.meter));
    const title = (staff.title ?? []).find(t => t) ?? '';
    if (title && !titles.has(s)) titles.set(s, title);
    staff.voices.forEach((elements, v) => {
      const id = `${s}:${v}`;
      let state = states.get(id);
      if (!state) {
        state = {
          staff: s, voice: v, notes: [], lyrics: [], chords: [], bars: [], pos: 0, key: null, keyName: '',
          barAccidentals: new Map(), waiting: new Map(), shift: 0, transpose: 0, tupletLeft: 0, tupletRatio: 1,
        };
        states.set(id, state);
      }
      state.shift = clefShift(staff.clef);
      state.transpose = staff.clef?.transpose ?? 0;
      if (staff.key && keyNameOf(staff.key) !== state.keyName) {
        state.key = readKey(file, staff.key);
        state.keyName = keyNameOf(staff.key);
        state.barAccidentals.clear();
        if (!song.key) { song.key = state.key; song.root = staff.key.root; song.acc = staff.key.acc; }
      }
      if (!state.key) state.key = readKey(file, { root: 'none', acc: '', mode: '' });
      for (const el of elements) {
        if (el.el_type === 'note') readNote(state, el);
        else if (el.el_type === 'bar') { state.bars.push({ at: state.pos, el }); state.barAccidentals.clear(); }
        else if (el.el_type === 'key') {
          state.key = readKey(file, { root: el.root ?? '', acc: el.acc ?? '', mode: el.mode ?? '' });
          state.keyName = keyNameOf(el);
          state.barAccidentals.clear();
        } else if (el.el_type === 'meter') meters.push(meterOf({ type: el.type ?? '', value: el.value }));
      }
    });
  }));

  const timeSig = songTimeSig(file, meters);
  const barLength = (timeSig[0] * 4) / timeSig[1];

  const ordered = Array.from(states.values()).sort((a, b) => a.staff - b.staff || a.voice - b.voice);
  const ids = voiceIds(lines);
  const bodyStart = lines.findIndex(l => /^K:/.test(l)) + 1;
  const idList = lines.some(l => /^%%(score|staves)\b/.test(l)) ? [] : [ids, voiceIds(lines.slice(bodyStart))].find(c => c.length === ordered.length) ?? [];
  const tracks: ParsedTrack[] = [];
  ordered.forEach((st, k) => {
    if (st.notes.length === 0) return;
    const id = idList[k] === DEFAULT_VOICE ? 'Melody' : idList[k];
    const name = (st.voice === 0 ? titles.get(st.staff) : undefined) ?? id ?? (ordered.length === 1 ? 'Melody' : `Voice ${k + 1}`);
    tracks.push({
      id: String(k + 1), name, instrument: '', channel: null, percussion: false,
      notes: [...st.notes].sort((a, b) => a.start - b.start || a.midi - b.midi),
      lyrics: st.lyrics, chords: st.chords,
    });
  });
  const first = ordered.find(st => st.notes.length > 0);
  if (written && song.key && (song.root !== written.letter || song.acc !== written.acc)) throw unreadable(file);   // abcjs fell back to a default key
  if (!first || !song.key) throw new ImportError(`"${file}" has no melody track.`);

  const pickup = pickupOf(first.bars, barLength);
  const end = Math.max(...ordered.map(st => st.pos));
  const key = song.key;
  return {
    file, format: 'ABC', timeSig, tempo: tempoOf(tune.metaText.tempo), pickup,
    key: { tonicPc: key.tonicPc, mode: key.mode },
    marks: readMarks(first.bars, { pickup, barLength }, end), tracks,
  };
}
