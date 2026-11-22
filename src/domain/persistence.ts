import { inst, ORDER } from './instruments';
import { optionsFor } from './fingerings';
import { barCap, DURATIONS, isSupportedTimeSig } from './time';
import type { Bar, ChordSym, Doc, Ev, InstId, Mode, TimeSig } from './types';

export interface SheetFile { app: 'fingerscore'; format: 1; savedAt: string; title: string; doc: Doc }
export type ParseResult =
  | { ok: true; doc: Doc; title: string }
  | { ok: false; reason: 'not-a-sheet' | 'damaged' };

export function toFile(doc: Doc, now: Date = new Date()): SheetFile {
  return { app: 'fingerscore', format: 1, savedAt: now.toISOString(), title: doc.title, doc };
}

export function serializeFile(doc: Doc, now?: Date): string {
  return JSON.stringify(toFile(doc, now), null, 2);
}

/** Limits on what an import may hold; anything larger is refused before or during validation. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_BARS = 2000;
export const MAX_EVENTS_PER_BAR = 64;

/** Reads a sheet file: one larger than MAX_FILE_BYTES is refused unread, as not a sheet. */
export async function readSheet(file: File): Promise<ParseResult> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, reason: 'not-a-sheet' };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, reason: 'not-a-sheet' };
  }
  return parseFileText(text);
}

export function parseFileText(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-a-sheet' };
  }
  return parseFile(value);
}

export function parseFile(value: unknown): ParseResult {
  if (!isObject(value) || value.app !== 'fingerscore' || value.format !== 1 || !isObject(value.doc)) {
    return { ok: false, reason: 'not-a-sheet' };
  }
  const doc = validateDoc(value.doc);
  return doc ? { ok: true, doc, title: doc.title } : { ok: false, reason: 'damaged' };
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
  if (!isStr(id) || id === '' || isReservedId(id) || !isInt(m, 0, 127) || !isNum(d) || !(DURATIONS as readonly number[]).includes(d)) return null;
  if (!isBool(r) || !isBool(tie) || !isStr(l)) return null;
  return { id, m, d, r, tie, l };
}

function validBar(v: unknown, maxCap: number, ids: Set<string>): Bar | null {
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
  return sum === cap ? { cap, rs, re, volta, ev: events } : null;
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
  const formats = ['MIDI', 'MusicXML', 'sample', 'file', 'library'];
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
  if (originalMode !== 'major' && originalMode !== 'minor') return null;
  if (!Array.isArray(score) || score.length === 0 || score.length > MAX_BARS) return null;

  const ids = new Set<string>();
  const bars: Bar[] = [];
  for (const raw of score) {
    const b = validBar(raw, barCap(sig), ids);
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

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObject(v)) {
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  }
  return v;
}

/** Stable serialisation: equal documents give equal strings, whatever their key order. */
export function canonical(doc: Doc): string {
  return JSON.stringify(sortKeys(doc));
}

export function fileName(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'sheet'}.fingerscore.json`;
}

export function importMessage(file: string, reason: 'not-a-sheet' | 'damaged'): string {
  return reason === 'not-a-sheet'
    ? `"${file}" isn't a fingerscore sheet.`
    : `"${file}" is damaged and can't be opened.`;
}
