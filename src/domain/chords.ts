import { mod12, spell } from './keys';
import type { ChordSym } from './types';

const CHORD_RE = /^([A-G])([#♯b♭]?)(.*?)(\/([A-G])([#♯b♭]?))?$/i;
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_LETTERS = 'CDEFGAB';

function alterOf(mark: string): number {
  return mark === '#' || mark === '♯' ? 1 : mark === 'b' || mark === '♭' ? -1 : 0;
}

function spelledPc(letter: string, mark: string): number {
  return mod12(LETTER_PC[letter.toUpperCase()] + alterOf(mark));
}

function noteName(pc: number, sig: number): string {
  const s = spell(60 + mod12(pc), sig);
  return NOTE_LETTERS[s.letter] + (s.alter === 1 ? '♯' : s.alter === -1 ? '♭' : '');
}

/** tk = (shift + off) mod 12 the text is spelled in. pc and bass are stored relative to the original concert key. */
export function parseChord(text: string, tk: number): ChordSym {
  const m = CHORD_RE.exec(text);
  if (!m) return { raw: text, ok: false, pc: 0, rest: '', bass: null, tk };
  return {
    raw: text,
    ok: true,
    pc: mod12(spelledPc(m[1], m[2]) - tk),
    rest: m[3],
    bass: m[5] ? mod12(spelledPc(m[5], m[6]) - tk) : null,
    tk,
  };
}

export function chordText(c: ChordSym, tk: number, sig: number): string {
  if (!c.ok || tk === c.tk) return c.raw;
  const bass = c.bass === null ? '' : `/${noteName(c.bass + tk, sig)}`;
  return `${noteName(c.pc + tk, sig)}${c.rest}${bass}`;
}

export interface ChordParts { root: string; quality: string; ext: string; bass: string | null }

const QUALITY_RE = /^(min|dim|aug|m(?!aj)|-|°|\+|ø)/;

function pretty(s: string): string {
  return s.replace(/#/g, '♯').replace(/b/g, '♭');
}

export function chordParts(text: string): ChordParts {
  const m = CHORD_RE.exec(text);
  if (!m) return { root: text, quality: '', ext: '', bass: null };
  const root = m[1].toUpperCase() + pretty(m[2]);
  const q = QUALITY_RE.exec(m[3]);
  const quality = q ? q[1] : '';
  const ext = pretty(m[3].slice(quality.length));
  const bass = m[5] ? m[5].toUpperCase() + pretty(m[6]) : null;
  return { root, quality, ext, bass };
}

export function prettyChord(text: string): string {
  if (!CHORD_RE.test(text)) return text;
  const { root, quality, ext, bass } = chordParts(text);
  return `${root}${quality}${ext}${bass === null ? '' : `/${bass}`}`;
}
