import { describe, expect, it } from 'vitest';
import { mkDoc } from '../test/helpers';
import { parseChord } from './chords';
import {
  addBarAfter, canMakeTriplet, canTie, eventOrder, inTriplet, lengthChoices, locate, makeTriplet, removeBar, setLength, setLetter,
  shiftPitch, toggleDotted, toggleRest, toggleTie, toggleTriplet,
} from './edit';
import { validateDoc } from './persistence';
import { barCap, isTripletLength } from './time';
import { groupOf, tripletGroups } from './triplets';
import type { Doc, TimeSig } from './types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = [1, 2, 3, 4];
const STEPS = 300;

type Bars = [number, number][][];
/** Start documents: every meter, with and without a pickup (a first bar shorter than the meter), some holding groups. */
const STARTS: Record<string, [Bars, TimeSig]> = {
  '4/4': [[[[60, 4], [62, 4], [64, 4], [65, 12], [67, 24]], [[60, 8], [62, 8], [64, 8], [65, 24]], [[60, 6], [62, 2], [64, 2], [65, 2], [67, 36]], [[60, 12], [62, 12], [64, 24]], [[0, 48]]], [4, 4]],
  '3/4': [[[[60, 4], [62, 4], [64, 4], [65, 24]], [[60, 12], [62, 8], [64, 8], [65, 8]], [[60, 36]]], [3, 4]],
  '6/8': [[[[60, 6], [62, 2], [64, 2], [65, 2], [67, 24]], [[60, 18], [62, 4], [64, 4], [65, 4], [67, 6]], [[60, 36]]], [6, 8]],
  '2/2': [[[[60, 8], [62, 8], [64, 8], [65, 24]], [[60, 48]], [[60, 12], [62, 12], [64, 24]]], [2, 2]],
  '4/4 pickup 12': [[[[60, 4], [62, 4], [64, 4]], [[60, 12], [62, 12], [64, 24]], [[60, 8], [62, 8], [64, 8], [65, 24]]], [4, 4]],
  '4/4 pickup 18': [[[[60, 6], [62, 12]], [[60, 12], [62, 12], [64, 24]], [[60, 4], [62, 4], [64, 4], [65, 36]]], [4, 4]],
  '4/4 pickup 15': [[[[60, 3], [62, 12]], [[60, 12], [62, 12], [64, 24]], [[60, 48]]], [4, 4]],
  '6/8 pickup': [[[[60, 6], [62, 6], [64, 6]], [[60, 12], [62, 12], [64, 12]]], [6, 8]],
  '3/4 pickup': [[[[60, 6], [62, 6]], [[60, 4], [62, 4], [64, 4], [65, 24]], [[60, 12], [62, 24]]], [3, 4]],
  '2/2 pickup': [[[[60, 8], [62, 8], [64, 8]], [[60, 8], [62, 8], [64, 8], [65, 24]], [[60, 12], [62, 12], [64, 24]]], [2, 2]],
};

/** Every event gets a lyric and an imported lyric and chord; every note a chord and a fingering choice. */
function startDoc(name: string): Doc {
  const [bars, ts] = STARTS[name];
  const d = mkDoc(bars.map(ev => ({ ev })), ts);
  const fingering: Doc['fingering'] = {};
  const chords: Doc['chords'] = {};
  const lyrics: Record<string, string> = {};
  const impChords: Record<string, string> = {};
  let n = 0;
  for (const b of d.score) {
    b.ev = b.ev.map(e => {
      n += 1;
      if (!e.r) { fingering[e.id] = 0; chords[e.id] = parseChord('C', 0); }
      lyrics[e.id] = `l${n}`; impChords[e.id] = 'C';
      return { ...e, l: `l${n}` };
    });
  }
  return { ...d, fingering, chords, imported: { lyrics, chords: impChords } };
}

const idsOf = (doc: Doc) => eventOrder(doc).map(e => e.id);

function problem(prev: Doc, next: Doc, kind: string): string | null {
  const full = barCap(next.timeSig);
  for (const [i, b] of next.score.entries()) {
    if (b.ev.reduce((s, e) => s + e.d, 0) !== b.cap) return `bar ${i} does not sum to cap`;
    if (tripletGroups(b, full) === null) return `bar ${i} has a triplet length outside a group: [${b.ev.map(e => e.d)}]`;
  }
  const ids = idsOf(next);
  const known = new Set(ids);
  if (known.size !== ids.length) return 'ids are not unique';
  if (validateDoc(JSON.parse(JSON.stringify(next))) === null) return 'validateDoc refuses the document';
  for (const [map, keys] of [['chords', Object.keys(next.chords)], ['fingering', Object.keys(next.fingering)],
    ['imported lyrics', Object.keys(next.imported.lyrics)], ['imported chords', Object.keys(next.imported.chords)]] as const) {
    for (const k of keys) if (!known.has(k)) return `${map} keep the removed id ${k}`;
  }
  const before = new Map(eventOrder(prev).map(e => [e.id, e]));
  // Length, triplet and bar edits leave a surviving event's texts alone. Pitch edits may drop its fingering choice.
  if (['length', 'triplet', 'addBar', 'removeBar'].includes(kind)) {
    for (const e of eventOrder(next)) {
      const o = before.get(e.id);
      if (!o) continue;
      if (o.l !== e.l) return `survivor ${e.id} lost its lyric`;
      if (prev.chords[e.id] && !next.chords[e.id]) return `survivor ${e.id} lost its chord`;
      if (prev.fingering[e.id] !== undefined && next.fingering[e.id] === undefined) return `survivor ${e.id} lost its fingering choice`;
      if (prev.imported.lyrics[e.id] !== undefined && next.imported.lyrics[e.id] === undefined) return `survivor ${e.id} lost its imported lyric`;
      if (prev.imported.chords[e.id] !== undefined && next.imported.chords[e.id] === undefined) return `survivor ${e.id} lost its imported chord`;
    }
  }
  const all = eventOrder(next);
  for (const [k, e] of all.entries()) {
    if (!e.tie) continue;
    const nx = all[k + 1];
    if (e.r || !nx || nx.r || nx.m !== e.m) return `tie on ${e.id} does not join two notes of one pitch`;
  }
  return null;
}

let withTriplets = 0;
let steps = 0;

describe('random edit sequences', () => {
  const cases = Object.keys(STARTS).flatMap(name => SEEDS.map(seed => [name, seed] as const));
  it.each(cases)('%s, seed %i: every result is valid', (name, seed) => {
    const rnd = mulberry32(seed * 7919 + name.length);
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
    let doc = startDoc(name);
    const ops: string[] = [];
    const fail = (step: number, why: string): never => expect.fail(`${name}, seed ${seed}, step ${step}: ${why}\noperations:\n${ops.join('\n')}`);
    for (let step = 0; step < STEPS; step++) {
      const id = pick(eventOrder(doc)).id;
      const kind = pick(['length', 'length', 'length', 'triplet', 'triplet', 'triplet', 'pitch', 'letter', 'rest', 'tie', 'dot', 'addBar', 'removeBar']);
      let label = `${kind} ${id}`;
      let next: Doc | null = null;
      let group: ReturnType<typeof groupOf> = null;
      if (kind === 'length') {
        const enabled = lengthChoices(doc, id).filter(c => c.enabled);
        const d = rnd() < 0.7 && enabled.length > 0 ? pick(enabled).d : pick([0, 1, 2, 3, 4, 5, 6, 8, 9, 12, 16, 18, 24, 36, 48, 96]);
        label = `setLength ${id} ${d}`;
        const at = locate(doc, id)!;
        if (isTripletLength(at.ev.d)) group = groupOf(tripletGroups(doc.score[at.bar], barCap(doc.timeSig))!, id);
        next = setLength(doc, id, d);
        if (next === null && enabled.some(c => c.d === d)) fail(step, `an enabled length returned null: ${label}`);
        if (next !== null && group) {
          const nb = next.score[at.bar];
          let t = 0;
          const inside = nb.ev.filter(e => { const here = t >= group!.start && t < group!.start + group!.span; t += e.d; return here; });
          if (!inside.every(e => isTripletLength(e.d)) || inside.reduce((s, e) => s + e.d, 0) !== group.span) fail(step, `the window changed shape: ${label}`);
        }
      } else if (kind === 'triplet') {
        if (!inTriplet(doc, id) && canMakeTriplet(doc, id) !== (makeTriplet(doc, id) !== null)) fail(step, `canMakeTriplet and makeTriplet disagree: ${label}`);
        const t = toggleTriplet(doc, id);
        next = t?.doc ?? null;
        if (t && inTriplet(doc, id) === inTriplet(t.doc, t.selectId)) fail(step, `the selection does not show the toggle: ${label}`);
      } else if (kind === 'pitch') next = shiftPitch(doc, id, pick([-12, -1, 1, 12]));
      else if (kind === 'letter') { const letter = Math.floor(rnd() * 7); label = `setLetter ${id} ${letter}`; next = setLetter(doc, id, letter, 'nearest'); }
      else if (kind === 'rest') next = toggleRest(doc, id);
      else if (kind === 'tie') next = toggleTie(doc, id);
      else if (kind === 'dot') next = toggleDotted(doc, id);
      else if (kind === 'addBar') { const b = Math.floor(rnd() * doc.score.length); label = `addBarAfter ${b}`; next = addBarAfter(doc, b)?.doc ?? null; }
      else { const b = Math.floor(rnd() * doc.score.length); label = `removeBar ${b}`; next = removeBar(doc, b)?.doc ?? null; }
      ops.push(label);
      steps += 1;
      if (next === null) continue;
      const why = problem(doc, next, kind);
      if (why) fail(step, why);
      if (kind === 'tie' && next !== doc) expect(canTie(next, id) || !locate(next, id)!.ev.tie).toBe(true);
      doc = next;
      if (doc.score.some(b => b.ev.some(e => isTripletLength(e.d)))) withTriplets += 1;
    }
  });

  it('the sequences make and edit triplets', () => {
    expect(steps).toBe(cases.length * STEPS);
    expect(withTriplets).toBeGreaterThan(steps / 4);
  });
});
