import { ROOT_NAMES } from '../chordNames';
import { own } from '../own';
import type { ParsedSong } from '../types';

/** Reads one version's main score. `score` is the root's `<Score>` child; `version` is the root's `version` attribute. */
export interface ScoreReader { (file: string, score: Element, version: number): ParsedSong }

// ---- DOM helpers ----

export const kids = (el: Element, name: string): Element[] => Array.from(el.children).filter(c => c.localName === name);
export const kid = (el: Element, name: string): Element | undefined => kids(el, name)[0];
export const text = (el: Element | undefined, name: string): string | undefined => {
  const t = el && kid(el, name)?.textContent;
  return t == null ? undefined : t.trim();
};
export const num = (s: string | undefined): number | null => {
  if (s === undefined || s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

// ---- music helpers ----

export const mod12 = (x: number): number => ((x % 12) + 12) % 12;

const TYPE_QUARTERS: Record<string, number> = {
  long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625, '128th': 1 / 32, '256th': 1 / 64,
};

/** Length in quarter notes of a written note value. `measure` (a full-measure rest) is the caller's: null here. */
export function durationQuarters(type: string, dots: number): number | null {
  const base = own(TYPE_QUARTERS, type);
  if (base === undefined) return null;
  return Number.isInteger(dots) && dots >= 0 && dots <= 4 ? base * (2 - 2 ** -dots) : null;
}

/** Pitch class of a tonal pitch class number (14 = C, 15 = G, 13 = F, 16 = D, ...). */
export const pcOfTpc = (tpc: number): number => mod12((tpc - 14) * 7);

/** Pitch class of the major key with this many sharps (negative: flats). */
export const majorTonicOfFifths = (fifths: number): number => mod12(fifths * 7);

// ---- lyrics and chord symbols ----

/** A lyric as the song model wants it: `begin` and `middle` syllables end in a hyphen. */
export const lyricText = (text: string, syllabic: string | null): string =>
  syllabic === 'begin' || syllabic === 'middle' ? `${text}-` : text;

/** The kind text as MuseScore stores it, with its short leading token written out: `mi` → `m`, `ma` → `maj`, `o` → `°`, `0` → `ø`. A token followed by a lowercase letter is part of a longer word (`min7`, `madd9`, `omit5`) and stays. */
function kindText(name: string): string {
  const short = /^(mi|ma|o)(?![a-z])/.exec(name);
  if (short) return ({ mi: 'm', ma: 'maj', o: '°' })[short[1] as 'mi' | 'ma' | 'o'] + name.slice(short[1].length);
  return name.startsWith('0') ? 'ø' + name.slice(1) : name;
}

/** A note name as the tonal pitch class spells it: 14 = C, 13 = F, 12 = B♭, 20 = F♯, 7 = C♭, 0 = C♭♭. Outside -1 to 33, by pitch class. */
export function spellTpc(tpc: number): string {
  if (!Number.isInteger(tpc) || tpc < -1 || tpc > 33) return ROOT_NAMES[pcOfTpc(Math.round(tpc))] ?? '';
  const accidentals = Math.floor((tpc + 1) / 7) - 2;
  return 'FCGDAEB'[(tpc + 1) % 7] + (accidentals > 0 ? '♯'.repeat(accidentals) : '♭'.repeat(-accidentals));
}

/** Chord symbol text from tonal pitch classes (root, bass), spelled as the file spells them, and MuseScore's kind text. */
export const harmonyText = (rootTpc: number, name: string | null, bassTpc: number | null): string =>
  spellTpc(rootTpc) + kindText(name ?? '') + (bassTpc === null ? '' : `/${spellTpc(bassTpc)}`);

/**
 * The text of a `<Harmony>`, or null when it has no root. Version 3 puts `<root>`, `<name>` and `<base>` in the element,
 * version 4 puts them in `<harmonyInfo>` and calls the bass `<bass>`; version 2 is like version 3.
 */
export function harmonyOf(h: Element): string | null {
  const info = kid(h, 'harmonyInfo');
  const field = (name: string): string | undefined => text(h, name) ?? text(info, name);
  const root = num(field('root'));
  if (root === null) return null;
  return harmonyText(root, field('name') ?? null, num(field('base') ?? field('bass')));
}
