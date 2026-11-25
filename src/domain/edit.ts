import { inst, rangeState } from './instruments';
import { MAX_BARS } from './persistence';
import { keySignature, mod12, signatureLetters } from './keys';
import { barCap, isPlainLength, isTripletLength, newId, splitDuration } from './time';
import { canStartGroup, groupOf, MEMBER_LENGTHS, notatedLength, tripletGroups, tripletRestLayouts } from './triplets';
import type { Span, TripletGroup } from './triplets';
import type { BarMark } from './jumps';
import type { Bar, Doc, Ev, Jump } from './types';

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

const isDuration = isPlainLength;

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

export const LENGTH_NAMES: Record<number, string> = { 3: 'sixteenth', 6: 'eighth', 12: 'quarter', 24: 'half', 48: 'whole' };

/** The spoken length of an event: "eighth", "dotted quarter". */
export function lengthName(d: number): string {
  if (isTripletLength(d)) return `triplet ${LENGTH_NAMES[notatedLength(d)]}`;
  const { base, dotted } = splitLength(d);
  const name = LENGTH_NAMES[base] ?? '';
  return dotted ? `dotted ${name}` : name;
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

/** False when the event's bar holds a triplet length outside any group; edits refuse such a bar. */
function barIsValid(doc: Doc, at: Located): boolean {
  return tripletGroups(doc.score[at.bar], barCap(doc.timeSig)) !== null;
}

/** The triplet group an event belongs to, with its bar's groups; null for a plain event. */
function groupAt(doc: Doc, at: Located): TripletGroup | null {
  const groups = tripletGroups(doc.score[at.bar], barCap(doc.timeSig));
  return groups ? groupOf(groups, at.ev.id) : null;
}

/**
 * Length change of a group member: a member length of its group that ends inside the group's window; null otherwise.
 * The filling rests are laid out so that the window still reads as one group of the same start and span (design 4.4):
 * the layouts of the gap are tried fewest rests first. Null when no layout keeps the group.
 */
function setMemberLength(doc: Doc, at: Located, group: TripletGroup, d: number): Doc | null {
  const bar = doc.score[at.bar];
  const end = group.start + group.span;
  if (!MEMBER_LENGTHS[group.span].includes(d) || at.tick + d > end) return null;
  if (at.ev.d === d) return doc;
  const pitch = rememberedPitch(doc, at.ev.id);
  const edited: Ev = { ...at.ev, d };
  const removed = new Set<string>();
  let kept: Ev[];      // what follows the filling rests in the bar
  let gap: number;     // ticks the filling rests take, right after the edited member or the consumed ones
  let keepsLeft: Ev | null = null;
  if (d < at.ev.d) {
    gap = at.ev.d - d;
    kept = bar.ev.slice(at.index + 1);
  } else {
    let need = d - at.ev.d;
    let k = at.index + 1;
    gap = 0;
    for (; k < bar.ev.length && need > 0; k++) {
      const e = bar.ev[k];
      if (e.d <= need) { removed.add(e.id); need -= e.d; continue; }
      const left = e.d - need;
      need = 0;
      if (MEMBER_LENGTHS[group.span].includes(left)) keepsLeft = { ...e, d: left };
      else { removed.add(e.id); gap = left; }
    }
    kept = [...(keepsLeft ? [keepsLeft] : []), ...bar.ev.slice(k)];
  }
  const full = barCap(doc.timeSig);
  for (const layout of gap > 0 ? tripletRestLayouts(gap, group.span) : [[]]) {
    const ev = [...bar.ev.slice(0, at.index), edited, ...layout.map(len => rest(len, pitch)), ...kept];
    const candidate: Bar = { ...bar, ev };
    const groups = tripletGroups(candidate, full);
    if (!groups || !groups.some(g => g.start === group.start && g.span === group.span)) continue;
    const next = forget(replaceBar(doc, at.bar, candidate), removed);
    return fixTies(next, [at.ev.id]);
  }
  return null;
}

/**
 * Sets an event's length. Shorter: rests fill the gap. Longer: the event consumes the following events of its bar;
 * a partly covered event keeps its id and end, or becomes rests when its remainder is no allowed length.
 * A group member takes a member length of its group and never leaves the group's window. A plain event that reaches
 * into a group removes the members it covers and turns the rest of the window into plain rests.
 */
export function setLength(doc: Doc, id: string, d: number): Doc | null {
  const at = locate(doc, id);
  if (!at || !barIsValid(doc, at)) return null;
  if (isTripletLength(at.ev.d)) {
    const group = groupAt(doc, at);
    return group ? setMemberLength(doc, at, group, d) : null;
  }
  if (!fits(doc, id, d)) return null;
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
    const groups = tripletGroups(bar, barCap(doc.timeSig)) ?? [];
    const stop = at.tick + d;
    let tick = at.tick + at.ev.d;
    let k = at.index + 1;
    after = [];
    while (k < bar.ev.length && tick < stop) {
      const e = bar.ev[k];
      const group = isTripletLength(e.d) ? groupOf(groups, e.id) : null;
      if (group) {
        for (const m of group.ids) removed.add(m);
        const groupEnd = group.start + group.span;
        if (groupEnd > stop) after.push(...rests(groupEnd - stop, pitch));
        tick = groupEnd;
        k += group.ids.length;
        continue;
      }
      k += 1;
      tick += e.d;
      if (tick <= stop) { removed.add(e.id); continue; }
      const left = tick - stop;
      if (isDuration(left)) after.push({ ...e, d: left });
      else { removed.add(e.id); after.push(...rests(left, pitch)); }
    }
    after.push(...bar.ev.slice(k));
  }
  const next = forget(replaceBar(doc, at.bar, { ...bar, ev: [...before, edited, ...after] }), removed);
  return fixTies(next, [id]);
}

/** The five length buttons as the panel shows them. For a group member `d` is the triplet length of the notated value. */
export function lengthChoices(doc: Doc, id: string): { notated: number; d: number; enabled: boolean; pressed: boolean }[] {
  const at = locate(doc, id);
  const group = at && isTripletLength(at.ev.d) ? groupAt(doc, at) : null;
  const usable = !!at && barIsValid(doc, at);
  // A disabled entry's d may not be a length of the group's kind (the whole note has no triplet length): do not pass it on.
  return BASE_LENGTHS.map(notated => {
    if (!at || !usable) return { notated, d: notated, enabled: false, pressed: false };
    if (!group) return { notated, d: notated, enabled: fits(doc, id, notated), pressed: splitLength(at.ev.d).base === notated };
    const d = notated === 48 ? 48 : (notated * 2) / 3;
    return { notated, d, enabled: setMemberLength(doc, at, group, d) !== null, pressed: at.ev.d === d };
  });
}

// ---- triplets ---------------------------------------------------------------------------------

function rest(d: number, m: number): Ev {
  return { id: newId(), m, d, r: true, tie: false, l: '' };
}

/** The span of the group a plain event of this length would become, or null when no group can start there. */
function spanOfMake(doc: Doc, at: Located): Span | null {
  const d = at.ev.d;
  if ((d !== 6 && d !== 12 && d !== 24) || !barIsValid(doc, at)) return null;
  const metric = at.tick + barCap(doc.timeSig) - doc.score[at.bar].cap;
  return canStartGroup(metric, d) ? d : null;
}

export function canMakeTriplet(doc: Doc, id: string): boolean {
  const at = locate(doc, id);
  return !!at && spanOfMake(doc, at) !== null;
}

export function inTriplet(doc: Doc, id: string): boolean {
  const at = locate(doc, id);
  return !!at && isTripletLength(at.ev.d) && groupAt(doc, at) !== null;
}

/** Splits a plain event into three members of a third each. The first keeps the event's id and texts. */
export function makeTriplet(doc: Doc, id: string): Doc | null {
  const at = locate(doc, id);
  if (!at) return null;
  const span = spanOfMake(doc, at);
  if (span === null) return null;
  const third = span / 3;
  const first: Ev = { ...at.ev, d: third, tie: false };
  const copy = (tie: boolean): Ev => ({ id: newId(), m: at.ev.m, d: third, r: at.ev.r, tie, l: '' });
  const last = copy(at.ev.tie);
  const bar = doc.score[at.bar];
  const ev = [...bar.ev.slice(0, at.index), first, copy(false), last, ...bar.ev.slice(at.index + 1)];
  const next = fixTies(replaceBar(doc, at.bar, { ...bar, ev }), [last.id]);
  return tripletGroups(next.score[at.bar], barCap(doc.timeSig)) ? next : null;
}

/**
 * Turns a group into one plain event of its span. It takes the id and texts of the first member that is a note
 * (the first member when all are rests) and the tie of the last member when that tie is still valid.
 */
export function undoTriplet(doc: Doc, id: string): { doc: Doc; selectId: string } | null {
  const at = locate(doc, id);
  if (!at || !isTripletLength(at.ev.d)) return null;
  const group = groupAt(doc, at);   // null for an invalid bar
  if (!group) return null;
  const bar = doc.score[at.bar];
  const members = bar.ev.filter(e => group.ids.includes(e.id));
  const keeper = members.find(e => !e.r) ?? members[0];
  const merged: Ev = { ...keeper, d: group.span, tie: members[members.length - 1].tie };
  const first = bar.ev.findIndex(e => e.id === members[0].id);
  const ev = [...bar.ev.slice(0, first), merged, ...bar.ev.slice(first + members.length)];
  const removed = new Set(members.filter(e => e !== keeper).map(e => e.id));
  const next = fixTies(forget(replaceBar(doc, at.bar, { ...bar, ev }), removed), [previousId(doc, members[0].id), merged.id]);
  return { doc: next, selectId: merged.id };
}

/** Makes a triplet of a plain event or undoes the group of a member; the selection goes to the first member or the merged event. */
export function toggleTriplet(doc: Doc, id: string): { doc: Doc; selectId: string } | null {
  if (inTriplet(doc, id)) return undoTriplet(doc, id);
  const next = makeTriplet(doc, id);
  return next ? { doc: next, selectId: id } : null;
}

// ---- pitches ----------------------------------------------------------------------------------

function setPitch(doc: Doc, id: string, m: number): Doc | null {
  const at = locate(doc, id);
  if (!at || m < 0 || m > 127 || !barIsValid(doc, at)) return null;
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
  if (!at || !barIsValid(doc, at)) return null;
  const ev: Ev = at.ev.r ? { ...at.ev, r: false } : { ...at.ev, r: true, tie: false };
  const next = dropFingering(replaceEvent(doc, at, ev), id);
  return fixTies(next, [previousId(doc, id)]);
}

/** True when the event is a note and the next event, across the bar line, is a note of the same pitch. */
export function canTie(doc: Doc, id: string): boolean {
  const at = locate(doc, id);
  if (!at || at.ev.r || !barIsValid(doc, at)) return false;
  const next = nextEvent(doc, id);
  return !!next && !next.r && next.m === at.ev.m;
}

export function toggleTie(doc: Doc, id: string): Doc | null {
  const at = locate(doc, id);
  if (!at || !barIsValid(doc, at)) return null;
  if (!at.ev.tie && !canTie(doc, id)) return null;
  return replaceEvent(doc, at, { ...at.ev, tie: !at.ev.tie });
}

// ---- bars -------------------------------------------------------------------------------------

/** False once the score holds MAX_BARS bars: one more could not be saved. */
export function canAddBar(doc: Doc): boolean {
  return doc.score.length < MAX_BARS;
}

/**
 * Inserts a bar of the song's meter holding one whole-bar rest after the given bar, and selects that rest;
 * null at the bar limit.
 */
export function addBarAfter(doc: Doc, barIndex: number): { doc: Doc; selectId: string } | null {
  if (!Number.isInteger(barIndex) || barIndex < 0 || barIndex >= doc.score.length) throw new RangeError(`No bar ${barIndex}`);
  if (!canAddBar(doc)) return null;
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

/** Puts a field on one bar and takes it off every other: a document never holds two of a mark. */
function placeField(doc: Doc, bar: number, key: BarMark | 'jump', value: true | Jump | undefined): Doc {
  if (!Number.isInteger(bar) || bar < 0 || bar >= doc.score.length) return doc;
  const score = doc.score.map((b, k) => {
    if (k !== bar && (value === undefined || b[key] === undefined)) return b;
    const { [key]: _gone, ...rest } = b;
    return k === bar && value !== undefined ? { ...rest, [key]: value } as Bar : rest;
  });
  return { ...doc, score };
}

/** Sets or clears a mark of a bar; a mark that stands on another bar moves here. An unknown bar changes nothing. */
export const setBarMark = (doc: Doc, bar: number, mark: BarMark, on: boolean): Doc => placeField(doc, bar, mark, on ? true : undefined);

/** Sets the jump at the end of a bar, or clears it with null; a jump on another bar moves here. */
export const setJump = (doc: Doc, bar: number, jump: Jump | null): Doc => placeField(doc, bar, 'jump', jump ?? undefined);

/** The dot toggle: a dotted length goes back to its base, a base length gets its dot; null when that is not allowed. */
export function toggleDotted(doc: Doc, id: string): Doc | null {
  const at = locate(doc, id);
  if (!at || isTripletLength(at.ev.d)) return null;
  const { base, dotted } = splitLength(at.ev.d);
  if (dotted) return setLength(doc, id, base);
  const longer = dottedOf(base);
  return longer === null ? null : setLength(doc, id, longer);
}
