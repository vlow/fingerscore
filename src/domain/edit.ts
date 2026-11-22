import { inst, rangeState } from './instruments';
import { keySignature, mod12, signatureLetters } from './keys';
import { barCap, DURATIONS, newId, splitDuration } from './time';
import type { Bar, Doc, Ev } from './types';

/** Pure edit operations on a document. Each returns a new document, or null when the edit is not allowed. */

/** Where an event sits: bar index, index in the bar, start tick within the bar. */
export interface Located { bar: number; index: number; tick: number; ev: Ev }

export function locate(doc: Doc, id: string): Located | null {
  for (let bar = 0; bar < doc.score.length; bar++) {
    let tick = 0;
    const evs = doc.score[bar].ev;
    for (let index = 0; index < evs.length; index++) {
      if (evs[index].id === id) return { bar, index, tick, ev: evs[index] };
      tick += evs[index].d;
    }
  }
  return null;
}

/** All events in score order. */
export function eventOrder(doc: Doc): Ev[] {
  return doc.score.flatMap(b => b.ev);
}

/** The event after this one, across bar lines. */
export function nextEvent(doc: Doc, id: string): Ev | null {
  const all = eventOrder(doc);
  const k = all.findIndex(e => e.id === id);
  return k >= 0 && k + 1 < all.length ? all[k + 1] : null;
}

const isDuration = (d: number) => (DURATIONS as readonly number[]).includes(d);

/** True when d is an allowed duration and the event, lengthened or shortened to d, stays inside its bar. */
export function fits(doc: Doc, id: string, d: number): boolean {
  const at = locate(doc, id);
  return !!at && isDuration(d) && at.tick + d <= doc.score[at.bar].cap;
}

export const BASE_LENGTHS = [3, 6, 12, 24, 48] as const;
const DOTTED: Record<number, number> = { 6: 9, 12: 18, 24: 36 };

export function splitLength(d: number): { base: number; dotted: boolean } {
  return d === 9 || d === 18 || d === 36 ? { base: (d * 2) / 3, dotted: true } : { base: d, dotted: false };
}

export function dottedOf(base: number): number | null {
  return DOTTED[base] ?? null;
}

// ---- helpers ----------------------------------------------------------------------------------

function withoutKeys<T>(map: Record<string, T>, drop: Set<string>): Record<string, T> {
  if (![...drop].some(id => id in map)) return map;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) if (!drop.has(k)) out[k] = v;
  return out;
}

/** Removes everything stored for events that no longer exist. */
function forget(doc: Doc, removed: Set<string>): Doc {
  if (removed.size === 0) return doc;
  return {
    ...doc,
    fingering: withoutKeys(doc.fingering, removed),
    chords: withoutKeys(doc.chords, removed),
    imported: { lyrics: withoutKeys(doc.imported.lyrics, removed), chords: withoutKeys(doc.imported.chords, removed) },
  };
}

function dropFingering(doc: Doc, id: string): Doc {
  return id in doc.fingering ? { ...doc, fingering: withoutKeys(doc.fingering, new Set([id])) } : doc;
}

function replaceBar(doc: Doc, index: number, bar: Bar): Doc {
  return { ...doc, score: doc.score.map((b, k) => (k === index ? bar : b)) };
}

function replaceEvent(doc: Doc, at: Located, ev: Ev): Doc {
  const bar = doc.score[at.bar];
  return replaceBar(doc, at.bar, { ...bar, ev: bar.ev.map((e, k) => (k === at.index ? ev : e)) });
}

/** Pitch of the nearest note at or before the given event; the event's own pitch when there is none. */
function rememberedPitch(doc: Doc, id: string): number {
  const all = eventOrder(doc);
  const k = all.findIndex(e => e.id === id);
  for (let i = k; i >= 0; i--) if (!all[i].r) return all[i].m;
  return k >= 0 ? all[k].m : 60;
}

function rests(ticks: number, m: number): Ev[] {
  return ticks > 0 ? splitDuration(ticks).map(d => ({ id: newId(), m, d, r: true, tie: false, l: '' })) : [];
}

/** Clears the ties of the given events whose next event is no longer a note of the same pitch. */
function fixTies(doc: Doc, ids: (string | undefined)[]): Doc {
  let out = doc;
  for (const id of ids) {
    if (!id) continue;
    const at = locate(out, id);
    if (!at || !at.ev.tie || canTie(out, id)) continue;
    out = replaceEvent(out, at, { ...at.ev, tie: false });
  }
  return out;
}

function previousId(doc: Doc, id: string): string | undefined {
  const all = eventOrder(doc);
  const k = all.findIndex(e => e.id === id);
  return k > 0 ? all[k - 1].id : undefined;
}

// ---- lengths ----------------------------------------------------------------------------------

/**
 * Sets an event's length. Shorter: rests fill the gap. Longer: the event consumes the following events of its bar;
 * a partly covered event keeps its id and end, or becomes rests when its remainder is no allowed duration.
 */
export function setLength(doc: Doc, id: string, d: number): Doc | null {
  if (!fits(doc, id, d)) return null;
  const at = locate(doc, id)!;
  if (at.ev.d === d) return doc;
  const bar = doc.score[at.bar];
  const pitch = rememberedPitch(doc, id);
  const before = bar.ev.slice(0, at.index);
  const edited: Ev = { ...at.ev, d };
  const removed = new Set<string>();
  let after: Ev[];
  if (d < at.ev.d) {
    after = [...rests(at.ev.d - d, pitch), ...bar.ev.slice(at.index + 1)];
  } else {
    let need = d - at.ev.d;
    let k = at.index + 1;
    after = [];
    for (; k < bar.ev.length && need > 0; k++) {
      const e = bar.ev[k];
      if (e.d <= need) { removed.add(e.id); need -= e.d; continue; }
      const left = e.d - need;
      need = 0;
      if (isDuration(left)) after.push({ ...e, d: left });
      else { removed.add(e.id); after.push(...rests(left, pitch)); }
    }
    after.push(...bar.ev.slice(k));
  }
  const next = forget(replaceBar(doc, at.bar, { ...bar, ev: [...before, edited, ...after] }), removed);
  return fixTies(next, [id]);
}

// ---- pitches ----------------------------------------------------------------------------------

function setPitch(doc: Doc, id: string, m: number): Doc | null {
  const at = locate(doc, id);
  if (!at || m < 0 || m > 127) return null;
  if (!at.ev.r && at.ev.m === m) return doc;
  const next = dropFingering(replaceEvent(doc, at, { ...at.ev, m, r: false }), id);
  return fixTies(next, [previousId(doc, id), id]);
}

/** Moves a note by semitones; null on a rest or outside MIDI 0..127. */
export function shiftPitch(doc: Doc, id: string, semitones: number): Doc | null {
  const at = locate(doc, id);
  if (!at || at.ev.r) return null;
  return setPitch(doc, id, at.ev.m + semitones);
}

const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];

/**
 * Sets the note to a letter (0=C..6=B) with the written key signature's alteration, in the playable octave nearest
 * to the current written pitch (ties go to the lower one). A rest becomes a note.
 */
export function setLetter(doc: Doc, id: string, letter: number, prefer: 'nearest'): Doc | null {
  void prefer;
  const at = locate(doc, id);
  if (!at || !Number.isInteger(letter) || letter < 0 || letter > 6) return null;
  const instrument = inst(doc.inst);
  const toWritten = doc.shift + instrument.off;
  const sig = keySignature(mod12(doc.originalTonicPc + toWritten), doc.originalMode);
  const alter = signatureLetters(sig).includes(letter) ? Math.sign(sig) : 0;
  const pc = mod12(NATURAL_PC[letter] + alter);
  const current = at.ev.m + toWritten;
  const candidates: number[] = [];
  for (let w = pc; w - toWritten <= 127; w += 12) if (w - toWritten >= 0) candidates.push(w);
  const playable = candidates.filter(w => rangeState(instrument, w) !== 'bad');
  const pool = playable.length > 0 ? playable : candidates;
  let best: number | null = null;
  for (const w of pool) {
    if (best === null || Math.abs(w - current) < Math.abs(best - current)) best = w;   // ascending, so ties keep the lower
  }
  return best === null ? null : setPitch(doc, id, best - toWritten);
}

// ---- rests and ties ---------------------------------------------------------------------------

/** Note → rest keeps the pitch (remembered) and the lyric; rest → note sounds that pitch again. */
export function toggleRest(doc: Doc, id: string): Doc | null {
  const at = locate(doc, id);
  if (!at) return null;
  const ev: Ev = at.ev.r ? { ...at.ev, r: false } : { ...at.ev, r: true, tie: false };
  const next = dropFingering(replaceEvent(doc, at, ev), id);
  return fixTies(next, [previousId(doc, id)]);
}

/** True when the event is a note and the next event, across the bar line, is a note of the same pitch. */
export function canTie(doc: Doc, id: string): boolean {
  const at = locate(doc, id);
  if (!at || at.ev.r) return false;
  const next = nextEvent(doc, id);
  return !!next && !next.r && next.m === at.ev.m;
}

export function toggleTie(doc: Doc, id: string): Doc | null {
  const at = locate(doc, id);
  if (!at) return null;
  if (!at.ev.tie && !canTie(doc, id)) return null;
  return replaceEvent(doc, at, { ...at.ev, tie: !at.ev.tie });
}

// ---- bars -------------------------------------------------------------------------------------

/** Inserts a bar of the song's meter holding one whole-bar rest after the given bar, and selects that rest. */
export function addBarAfter(doc: Doc, barIndex: number): { doc: Doc; selectId: string } {
  const prev = doc.score[barIndex];
  const lastId = prev && prev.ev.length > 0 ? prev.ev[prev.ev.length - 1].id : undefined;
  const cap = barCap(doc.timeSig);
  const rest: Ev = { id: newId(), m: lastId ? rememberedPitch(doc, lastId) : 60, d: cap, r: true, tie: false, l: '' };
  const score = [...doc.score.slice(0, barIndex + 1), { cap, rs: false, re: false, volta: '' as const, ev: [rest] }, ...doc.score.slice(barIndex + 1)];
  return { doc: fixTies({ ...doc, score }, [lastId]), selectId: rest.id };
}

/** Removes a bar and selects the first event of the following bar, or of the previous one; null when one bar is left. */
export function removeBar(doc: Doc, barIndex: number): { doc: Doc; selectId: string } | null {
  if (doc.score.length <= 1 || barIndex < 0 || barIndex >= doc.score.length) return null;
  const removed = new Set(doc.score[barIndex].ev.map(e => e.id));
  const score = doc.score.filter((_b, k) => k !== barIndex);
  const before = barIndex > 0 ? doc.score[barIndex - 1].ev : [];
  const lastBefore = before.length > 0 ? before[before.length - 1].id : undefined;
  const select = score[barIndex] ?? score[barIndex - 1];
  return { doc: fixTies(forget({ ...doc, score }, removed), [lastBefore]), selectId: select.ev[0].id };
}
