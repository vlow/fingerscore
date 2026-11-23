import data from '../data/scales.json';
import { chooseFingerings } from './chooser';
import { optionsFor, type FingeringOption, type RecorderSystem } from './fingerings';
import { inst, isTransposing, noteNameFlat, rangeState } from './instruments';
import { accidentalName, keySignature, mod12, signatureAlter, spell, spelledName, tonicName, type AccidentalName, type Alter, type Spelled } from './keys';
import type { InstId, Mode } from './types';

export type ScaleId = 'maj' | 'nmin' | 'hmin' | 'mmin' | 'pmaj' | 'pmin' | 'blues' | 'chrom';
export const SCALE_IDS: ScaleId[] = ['maj', 'nmin', 'hmin', 'mmin', 'pmaj', 'pmin', 'blues', 'chrom'];

/** deg = [semitones above the tonic, scale degree index 0..6]; down = the scale used when descending. */
interface ScaleDef { name: string; minor: boolean; deg?: [number, number][]; down?: ScaleId; chromatic?: boolean }
const DEFS = data as unknown as Record<ScaleId, ScaleDef>;

export function scaleName(id: ScaleId): string {
  return DEFS[id].name;
}

export function isMinorType(id: ScaleId): boolean {
  return DEFS[id].minor;
}

const modeOf = (id: ScaleId): Mode => (isMinorType(id) ? 'minor' : 'major');

export type ScaleRange = 'one' | 'two' | 'all';
export type ScaleDirection = 'up' | 'updown';
export interface ScaleNote { written: number; spelled: Spelled; state: 'ok' | 'ext'; ascending: boolean; accidental: AccidentalName | null }
export interface ScaleResult { notes: ScaleNote[]; sig: number; tonic: string; notice: string | null }

const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** The letter on the given scale degree, and the alteration that makes it sound `written`. */
function spellDegree(written: number, letter: number): Spelled {
  let alter = mod12(written - LETTER_PC[letter]);
  if (alter > 6) alter -= 12;
  // The octave in which the letter's natural pitch is nearest to the written pitch (B♯3 = 60, C♭5 = 71).
  const octave = (written - alter - LETTER_PC[letter]) / 12 - 1;
  return { letter, alter: alter as Alter, octave, name: spelledName(letter, alter as Alter, octave) };
}

const SEMITONES_ALL = Array.from({ length: 12 }, (_, i) => i);
const semitones = (id: ScaleId): number[] => DEFS[id].deg?.map(([s]) => s) ?? SEMITONES_ALL;

/** Written pitches lo..hi in the scale, ascending. */
function pitchesIn(id: ScaleId, tonicPc: number, from: number, to: number): number[] {
  const rel = new Set(semitones(id));
  const out: number[] = [];
  for (let w = from; w <= to; w++) if (rel.has(mod12(w - tonicPc))) out.push(w);
  return out;
}

export function buildScale(o: { inst: InstId; scale: ScaleId; tonicPc: number; range: ScaleRange; direction: ScaleDirection }): ScaleResult {
  const i = inst(o.inst);
  const def = DEFS[o.scale];
  const mode = modeOf(o.scale);
  const tonicPc = mod12(o.tonicPc);
  const tonic = tonicName(tonicPc, mode);
  const tonicLetter = LETTERS.indexOf(tonic[0]);
  const sig = def.chromatic ? 0 : keySignature(tonicPc, mode);

  // Range and limits (design 4.1).
  let start = i.lo;
  while (mod12(start - tonicPc) !== 0) start++;
  let top: number;
  let notice: string | null = null;
  if (o.range === 'all') {
    start = i.lo;
    top = i.hi;
  } else {
    top = start + (o.range === 'one' ? 12 : 24);
    if (top > i.ext) {
      top = i.ext;
      const shown = pitchesIn(o.scale, tonicPc, start, top);
      const last = shown[shown.length - 1];
      const prefix = o.range === 'two' ? 'The second octave does not fit this instrument. ' : 'This octave does not fit this instrument. ';
      const amber = last > i.hi ? ` Notes above ${noteNameFlat(i.hi)} need extended fingerings and are marked amber.` : '';
      notice = `${prefix}Shown up to ${noteNameFlat(last)}.${amber}`;
    } else if (top > i.hi) {
      notice = `Notes above ${noteNameFlat(i.hi)} need extended fingerings and are marked amber. Try 1 octave or another key for an easier scale.`;
    }
  }

  const up = pitchesIn(o.scale, tonicPc, start, top);
  const downScale = def.down ?? o.scale;
  // The descent ends where the ascent started; over the whole range it reaches the descending form's lowest note
  // (melodic minor's natural-minor descent can go below the ascent's first note).
  const bottom = o.range === 'all' ? i.lo : up[0];
  const down = o.direction === 'updown' && up.length > 0 ? pitchesIn(downScale, tonicPc, bottom, up[up.length - 1] - 1).reverse() : [];

  // Chromatic: sharps ascending unless the tonic's major key has flats; flats descending (design 4.2).
  const chromaticSig = (ascending: boolean) => (ascending && keySignature(tonicPc, 'major') >= 0 ? 1 : -1);
  const spellNote = (written: number, ascending: boolean, id: ScaleId): Spelled => {
    if (DEFS[id].chromatic) return spell(written, chromaticSig(ascending));
    const degree = DEFS[id].deg!.find(([s]) => s === mod12(written - tonicPc))![1];
    return spellDegree(written, (tonicLetter + degree) % 7);
  };

  const seq = [
    ...up.map(written => ({ written, ascending: true, spelled: spellNote(written, true, o.scale) })),
    ...down.map(written => ({ written, ascending: false, spelled: spellNote(written, false, downScale) })),
  ];

  // Accidentals (design 4.2): differs from the signature, or from the latest earlier note on the same letter and octave.
  const lastAlter = new Map<string, Alter>();
  const notes: ScaleNote[] = seq.map(n => {
    const key = `${n.spelled.letter}/${n.spelled.octave}`;
    const before = lastAlter.get(key);
    lastAlter.set(key, n.spelled.alter);
    const shown = n.spelled.alter !== signatureAlter(n.spelled.letter, sig) || (before !== undefined && before !== n.spelled.alter);
    return {
      ...n,
      state: rangeState(i, n.written) === 'ext' ? 'ext' : 'ok',
      accidental: shown ? accidentalName(n.spelled.alter) : null,
    };
  });

  return { notes, sig, tonic, notice };
}

export interface KeyChip { writtenPc: number; concertPc: number; written: string; concert: string }

/** 12 key chips, ordered from C by the leading name: the written key ('read') or the concert key ('sound'). */
export function keyChips(id: InstId, scale: ScaleId, by: 'read' | 'sound'): KeyChip[] {
  const { off } = inst(id);
  const mode = modeOf(scale);
  return SEMITONES_ALL.map(pc => {
    const writtenPc = by === 'read' ? pc : mod12(pc + off);
    const concertPc = mod12(writtenPc - off);
    return { writtenPc, concertPc, written: tonicName(writtenPc, mode), concert: tonicName(concertPc, mode) };
  });
}

/** Whether written and concert keys differ; octave-transposing instruments count as non-transposing. */
export function isKeyTransposing(id: InstId): boolean {
  return isTransposing(inst(id));
}

/** A note's fingerings: its options, the chosen one, the app's own pick (auto) and whether the player picked it. */
export interface ScaleFingering { options: FingeringOption[]; chosen: number | undefined; auto: number | undefined; overridden: boolean }

/** Whether an override is an option index of the note; anything else is ignored. */
export function validPick(value: unknown, options: FingeringOption[]): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < options.length;
}

/**
 * The sheet's chooser along the scale's note sequence (design 4.3), with the player's picks (note index → option index)
 * as fixed points. auto is the pick without that note's own override, with the others' as fixed points where they hold,
 * as on a sheet. A note without options breaks the run.
 */
export function scaleFingerings(id: InstId, notes: ScaleNote[], recorderSystem: RecorderSystem, overrides: Record<number, number>): ScaleFingering[] {
  const options = notes.map(n => optionsFor(id, n.written, recorderSystem));
  const items = notes.map((n, i) => ({ id: String(i), written: n.written, options: options[i] }));
  const pins: Record<string, number> = {};
  options.forEach((o, i) => { if (validPick(overrides[i], o)) pins[String(i)] = overrides[i]; });
  const pinned = chooseFingerings(items, pins);
  const free = Object.keys(pins).length ? chooseFingerings(items, {}) : pinned;
  return options.map((o, i) => {
    const overridden = String(i) in pins;
    const auto = overridden ? free[String(i)] : pinned[String(i)];
    return { options: o, auto, overridden, chosen: overridden ? overrides[i] : auto };
  });
}
