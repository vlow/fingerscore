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
  whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
};

/** Length in quarter notes of a written note value. `measure` (a full-measure rest) is the caller's: null here. */
export function durationQuarters(type: string, dots: number): number | null {
  const base = TYPE_QUARTERS[type];
  if (base === undefined) return null;
  return dots === 1 ? base * 1.5 : dots === 2 ? base * 1.75 : base;
}

/** Pitch class of a tonal pitch class number (14 = C, 15 = G, 13 = F, 16 = D, ...). */
export const pcOfTpc = (tpc: number): number => mod12((tpc - 14) * 7);

/** Pitch class of the major key with this many sharps (negative: flats). */
export const majorTonicOfFifths = (fifths: number): number => mod12(fifths * 7);
