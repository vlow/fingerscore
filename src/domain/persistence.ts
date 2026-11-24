import { inst, ORDER } from './instruments';
import { optionsFor } from './fingerings';
import { MODES } from './keys';
import { barCap, isPlainLength, isSupportedTimeSig, isTripletLength } from './time';
import { tripletGroups } from './triplets';
import type { Bar, ChordSym, Doc, Ev, InstId, Mode, TimeSig } from './types';

export interface SheetFile { app: 'fingerscore'; format: 1; savedAt: string; title: string; doc: Doc }
export type ParseResult =
  | { ok: true; doc: Doc; title: string }
  | { ok: false; reason: 'not-a-sheet' | 'damaged' };

/** One sheet of a library export: what the library lists about it, and the document. */
export interface LibrarySheet { title: string; inst: string; key: string; fam: string; savedAt: string; doc: Doc }
export interface LibraryFile { app: 'fingerscore'; format: 1; kind: 'library'; savedAt: string; sheets: LibrarySheet[] }
/** A sheet read from a file; savedAt is null when the file gives no usable time. */
export interface ImportedSheet { doc: Doc; savedAt: string | null }
export type ImportFailure = 'not-a-sheet' | 'damaged' | 'empty-library';
/** A single sheet file or a library export. `skipped` counts the library's damaged sheets. */
export type ImportParse =
  | { ok: true; kind: 'sheet'; doc: Doc; title: string }
  | { ok: true; kind: 'library'; sheets: ImportedSheet[]; skipped: number }
  | { ok: false; reason: ImportFailure };

export const LIBRARY_FILE_NAME = 'fingerscore-library.json';

export function toFile(doc: Doc, now: Date = new Date()): SheetFile {
  return { app: 'fingerscore', format: 1, savedAt: now.toISOString(), title: doc.title, doc };
}

export function serializeFile(doc: Doc, now?: Date): string {
  return JSON.stringify(toFile(doc, now), null, 2);
}

/** The library export: every sheet in one file. Not indented, so that it stays about as large as the stored library. */
export function serializeLibrary(sheets: LibrarySheet[], now: Date = new Date()): string {
  const file: LibraryFile = {
    app: 'fingerscore', format: 1, kind: 'library', savedAt: now.toISOString(),
    sheets: sheets.map(({ title, inst: instName, key, fam, savedAt, doc }) => ({ title, inst: instName, key, fam, savedAt, doc })),
  };
  return JSON.stringify(file);
}

/** Limits on what an import may hold; anything larger is refused before or during validation. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 4 * MAX_FILE_BYTES;
export const MAX_LIBRARY_SHEETS = 2000;
export const MAX_BARS = 2000;
export const MAX_EVENTS_PER_BAR = 64;

async function textOf(file: File, maxBytes: number): Promise<string | null> {
  if (file.size > maxBytes) return null;
  try {
    return await file.text();
  } catch {
    return null;
  }
}

/** Reads a sheet file: one larger than MAX_FILE_BYTES is refused unread, as not a sheet. */
export async function readSheet(file: File): Promise<ParseResult> {
  const text = await textOf(file, MAX_FILE_BYTES);
  return text === null ? { ok: false, reason: 'not-a-sheet' } : parseFileText(text);
}

/** Reads a sheet file or a library export. A single sheet keeps the MAX_FILE_BYTES limit; a library may be larger. */
export async function readImport(file: File): Promise<ImportParse> {
  const text = await textOf(file, MAX_LIBRARY_BYTES);
  if (text === null) return { ok: false, reason: 'not-a-sheet' };
  const parsed = parseImportText(text);
  if (parsed.ok && parsed.kind === 'sheet' && file.size > MAX_FILE_BYTES) return { ok: false, reason: 'not-a-sheet' };
  return parsed;
}

function parseJson(text: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
}

export function parseFileText(text: string): ParseResult {
  const json = parseJson(text);
  return json ? parseFile(json.value) : { ok: false, reason: 'not-a-sheet' };
}

export function parseFile(value: unknown): ParseResult {
  if (!isObject(value) || value.app !== 'fingerscore' || value.format !== 1 || !isObject(value.doc)) {
    return { ok: false, reason: 'not-a-sheet' };
  }
  const doc = validateDoc(value.doc);
  return doc ? { ok: true, doc, title: doc.title } : { ok: false, reason: 'damaged' };
}

export function parseImportText(text: string): ImportParse {
  const json = parseJson(text);
  return json ? parseImport(json.value) : { ok: false, reason: 'not-a-sheet' };
}

/** A library export gives its valid sheets and counts the damaged ones; any other value is read as a single sheet. */
export function parseImport(value: unknown): ImportParse {
  if (!isObject(value) || value.kind !== 'library') {
    const single = parseFile(value);
    return single.ok ? { ...single, kind: 'sheet' } : single;
  }
  if (value.app !== 'fingerscore' || value.format !== 1 || !Array.isArray(value.sheets)) return { ok: false, reason: 'not-a-sheet' };
  if (value.sheets.length === 0) return { ok: false, reason: 'empty-library' };
  if (value.sheets.length > MAX_LIBRARY_SHEETS) return { ok: false, reason: 'damaged' };
  const sheets: ImportedSheet[] = [];
  for (const raw of value.sheets) {
    const doc = isObject(raw) ? validateDoc(raw.doc) : null;
    if (!doc) continue;
    const savedAt = isObject(raw) && isStr(raw.savedAt) && !Number.isNaN(Date.parse(raw.savedAt)) ? raw.savedAt : null;
    sheets.push({ doc, savedAt });
  }
  if (sheets.length === 0) return { ok: false, reason: 'damaged' };
  return { ok: true, kind: 'library', sheets, skipped: value.sheets.length - sheets.length };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => isNum(v) && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Event ids key the fingering and chords maps. An id that names something every object inherits
 * (`__proto__`, `constructor`, `toString`, `valueOf`, …) would read that inherited value instead.
 */
const isReservedId = (id: string): boolean => id === 'prototype' || id in Object.prototype;

function validEvent(v: unknown): Ev | null {
  if (!isObject(v)) return null;
  const { id, m, d, r, tie, l } = v;
  if (!isStr(id) || id === '' || isReservedId(id) || !isInt(m, 0, 127) || !isNum(d) || !(isPlainLength(d) || isTripletLength(d))) return null;
  if (!isBool(r) || !isBool(tie) || !isStr(l)) return null;
  return { id, m, d, r, tie, l };
}

function validBar(v: unknown, maxCap: number, fullCap: number, ids: Set<string>): Bar | null {
  if (!isObject(v)) return null;
  const { cap, rs, re, volta, ev } = v;
  if (!isNum(cap) || !Number.isInteger(cap) || cap <= 0 || cap > maxCap || cap % 3 !== 0) return null;
  if (!isBool(rs) || !isBool(re) || (volta !== '' && volta !== '1' && volta !== '2') || !Array.isArray(ev) || ev.length > MAX_EVENTS_PER_BAR) return null;
  const events: Ev[] = [];
  let sum = 0;
  for (const raw of ev) {
    const e = validEvent(raw);
    if (!e || ids.has(e.id)) return null;
    ids.add(e.id);
    sum += e.d;
    events.push(e);
  }
  if (sum !== cap) return null;
  const bar: Bar = { cap, rs, re, volta, ev: events };
  return tripletGroups(bar, fullCap) ? bar : null;
}

function validChord(v: unknown): ChordSym | null {
  if (!isObject(v)) return null;
  const { raw, ok, pc, rest, bass, tk } = v;
  if (!isStr(raw) || !isBool(ok) || !isInt(pc, 0, 11) || !isStr(rest) || !(bass === null || isInt(bass, 0, 11)) || !isInt(tk, 0, 11)) return null;
  return { raw, ok, pc, rest, bass, tk };
}

function validSource(v: unknown): Doc['source'] {
  const fallback: Doc['source'] = { file: '', format: 'file', track: '', trackCount: 0, simplified: false };
  if (!isObject(v)) return fallback;
  const formats = ['MIDI', 'MusicXML', 'MuseScore', 'ABC', 'sample', 'file', 'library'];
  const { file, format, track, trackCount, simplified } = v;
  if (!isStr(file) || !isStr(format) || !formats.includes(format) || !isStr(track) || !isNum(trackCount) || !isBool(simplified)) return fallback;
  return { file, format: format as Doc['source']['format'], track, trackCount, simplified };
}

function validShow(v: unknown): Doc['show'] {
  const s = isObject(v) ? v : {};
  const flag = (x: unknown) => (isBool(x) ? x : true);
  return { fingerings: flag(s.fingerings), chords: flag(s.chords), lyrics: flag(s.lyrics), raiseExtensions: flag(s.raiseExtensions) };
}

/** Returns a new document holding only known fields, or null when the document is damaged. */
export function validateDoc(value: unknown): Doc | null {
  if (!isObject(value)) return null;
  const { timeSig, inst: instId, shift, tempo, originalTonicPc, originalMode, score } = value;
  if (!Array.isArray(timeSig) || timeSig.length !== 2 || !isNum(timeSig[0]) || !isNum(timeSig[1]) || !isSupportedTimeSig(timeSig[0], timeSig[1])) return null;
  const sig = [timeSig[0], timeSig[1]] as TimeSig;
  if (!isStr(instId) || !ORDER.includes(instId as InstId)) return null;
  if (!isInt(shift, -24, 24) || !isNum(tempo) || !isInt(originalTonicPc, 0, 11)) return null;
  if (!MODES.includes(originalMode as Mode)) return null;
  if (!Array.isArray(score) || score.length === 0 || score.length > MAX_BARS) return null;

  const ids = new Set<string>();
  const bars: Bar[] = [];
  for (const raw of score) {
    const b = validBar(raw, barCap(sig), barCap(sig), ids);
    if (!b) return null;
    bars.push(b);
  }

  const id = instId as InstId;
  const recorderSystem: Doc['recorderSystem'] = value.recorderSystem === 'german' ? 'german' : 'baroque';
  const events = new Map<string, Ev>();
  for (const b of bars) for (const e of b.ev) events.set(e.id, e);

  const fingering: Doc['fingering'] = {};
  if (isObject(value.fingering)) {
    for (const [evId, index] of Object.entries(value.fingering)) {
      const e = events.get(evId);
      if (!e || e.r || !isInt(index, 0, 1e6)) continue;
      if (optionsFor(id, e.m + shift + inst(id).off, recorderSystem)[index]) fingering[evId] = index;
    }
  }

  const chords: Doc['chords'] = {};
  if (isObject(value.chords)) {
    for (const [evId, raw] of Object.entries(value.chords)) {
      const c = validChord(raw);
      if (events.has(evId) && c) chords[evId] = c;
    }
  }

  const imported: Doc['imported'] = { lyrics: {}, chords: {} };
  if (isObject(value.imported)) {
    for (const key of ['lyrics', 'chords'] as const) {
      const map = value.imported[key];
      if (!isObject(map)) continue;
      for (const [evId, text] of Object.entries(map)) if (events.has(evId) && isStr(text)) imported[key][evId] = text;
    }
  }

  return {
    score: bars, timeSig: sig, originalTonicPc, originalMode: originalMode as Mode,
    tempo: Math.max(40, Math.min(200, tempo)), inst: id, shift, fingering, chords, imported,
    title: isStr(value.title) ? value.title : '',
    subtitle: isStr(value.subtitle) ? value.subtitle : '',
    chartStyle: value.chartStyle === 'full' ? 'full' : 'compact',
    recorderSystem,
    show: validShow(value.show),
    source: validSource(value.source),
  };
}

/** The order of a plain sort(): by UTF-16 code unit, the same in every locale. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObject(v)) {
    return Object.fromEntries(Object.keys(v).sort(byCodeUnit).map(k => [k, sortKeys(v[k])]));
  }
  return v;
}

const canonicalCache = new WeakMap<Doc, string>();

/**
 * Stable serialisation: equal documents give equal strings, whatever their key order.
 * Cached per document object; documents are never changed in place.
 */
export function canonical(doc: Doc): string {
  let text = canonicalCache.get(doc);
  if (text === undefined) {
    text = JSON.stringify(sortKeys(doc));
    canonicalCache.set(doc, text);
  }
  return text;
}

const LETTERS: Record<string, string> = {
  'ł': 'l', 'Ł': 'L', 'ø': 'o', 'Ø': 'O', 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'đ': 'd', 'Đ': 'D',
  'ı': 'i', 'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'TH', 'ħ': 'h', 'Ħ': 'H', 'ŧ': 't', 'Ŧ': 'T', 'ŋ': 'n', 'Ŋ': 'N',
};
const MAX_SLUG = 80;
const ACCIDENTAL_WORDS: Record<string, string> = { '♯': '-sharp', '#': '-sharp', '♭': '-flat', '𝄪': '-double-sharp', '𝄫': '-double-flat' };

/**
 * A sharp or flat sign directly after a letter A-G is written as a word (F♯ → f-sharp, B♭ → b-flat), so that keys keep
 * different names. Then compatibility forms and accents dropped (ﬁ → fi, Ž → z, ł → l, ß → ss), lower case, runs outside
 * a-z0-9 become one hyphen, hyphens at both ends trimmed, cut to 80 characters. May be empty.
 */
export function slug(text: string): string {
  const named = text.replace(/([A-Ga-g])(♯|#|♭|𝄪|𝄫)/gu, (_, letter: string, sign: string) => `${letter}${ACCIDENTAL_WORDS[sign]}`);
  const plain = named.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[łŁøØßæÆœŒđĐıðÐþÞħĦŧŦŋŊ]/g, c => LETTERS[c]);
  return trimHyphens(trimHyphens(plain.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, MAX_SLUG));
}

/** Without the hyphens at both ends. */
function trimHyphens(s: string): string {
  let from = 0;
  let to = s.length;
  while (from < to && s[from] === '-') from++;
  while (to > from && s[to - 1] === '-') to--;
  return s.slice(from, to);
}

export function fileName(title: string): string {
  return `${slug(title) || 'sheet'}.fingerscore.json`;
}

export function importMessage(file: string, reason: ImportFailure): string {
  if (reason === 'empty-library') return `"${file}" holds no sheets.`;
  return reason === 'not-a-sheet'
    ? `"${file}" isn't a fingerscore sheet.`
    : `"${file}" is damaged and can't be opened.`;
}

/** What a library import added: "3 sheets added to your sheets", with the damaged sheets it left out. */
export function importedMessage(added: number, skipped: number): string {
  const sheets = (n: number) => `${n} ${n === 1 ? 'sheet' : 'sheets'}`;
  const left = skipped > 0 ? ` · ${skipped} damaged ${skipped === 1 ? 'sheet' : 'sheets'} skipped` : '';
  return `${sheets(added)} added to your sheets${left}`;
}
