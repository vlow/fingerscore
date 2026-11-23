import { describe, expect, it } from 'vitest';
import { mkDoc } from '../test/helpers';
import {
  addBarAfter, eventOrder, lengthChoices, removeBar, setLength, shiftPitch, toggleDotted, toggleRest, toggleTie, toggleTriplet,
} from './edit';
import { validateDoc } from './persistence';
import { barCap, isTripletLength } from './time';
import { tripletGroups } from './triplets';
import type { Doc } from './types';

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

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const STEPS = 300;

function startDoc(): Doc {
  return mkDoc([
    { ev: [[60, 12], [62, 12], [64, 12], [65, 12]] },
    { ev: [[67, 24], [65, 12], [64, 6], [62, 6]] },
    { ev: [[60, 48]] },
    { ev: [[0, 12], [62, 6], [64, 6], [65, 24]] },
  ]);
}

function problem(doc: Doc): string | null {
  const full = barCap(doc.timeSig);
  for (const [i, b] of doc.score.entries()) {
    if (b.ev.reduce((s, e) => s + e.d, 0) !== b.cap) return `bar ${i} does not sum to cap`;
    if (tripletGroups(b, full) === null) return `bar ${i} has a triplet length outside a group`;
  }
  const ids = eventOrder(doc).map(e => e.id);
  if (new Set(ids).size !== ids.length) return 'ids are not unique';
  if (validateDoc(JSON.parse(JSON.stringify(doc))) === null) return 'validateDoc refuses the document';
  return null;
}

let applied = 0;

describe('random edit sequences', () => {
  it.each(SEEDS)(`seed %i: ${STEPS} operations keep every bar valid`, seed => {
    const rnd = mulberry32(seed);
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
    let doc = startDoc();
    const ops: string[] = [];
    let accepted = 0;
    for (let step = 0; step < STEPS; step++) {
      const events = eventOrder(doc);
      const id = pick(events).id;
      const kind = pick(['length', 'length', 'triplet', 'triplet', 'pitch', 'rest', 'tie', 'dot', 'addBar', 'removeBar']);
      let next: Doc | null = null;
      let label = `${kind} ${id}`;
      if (kind === 'length') {
        const enabled = lengthChoices(doc, id).filter(c => c.enabled);
        const d = enabled.length > 0 ? pick(enabled).d : 12;
        label = `setLength ${id} ${d}`;
        next = setLength(doc, id, d);
        if (enabled.length > 0) expect(next, `${label}: an enabled length returned null`).not.toBeNull();
      } else if (kind === 'triplet') next = toggleTriplet(doc, id)?.doc ?? null;
      else if (kind === 'pitch') next = shiftPitch(doc, id, pick([-12, -1, 1, 12]));
      else if (kind === 'rest') next = toggleRest(doc, id);
      else if (kind === 'tie') next = toggleTie(doc, id);
      else if (kind === 'dot') next = toggleDotted(doc, id);
      else if (kind === 'addBar') { const bar = Math.floor(rnd() * doc.score.length); label = `addBarAfter ${bar}`; next = addBarAfter(doc, bar)?.doc ?? null; }
      else { const bar = Math.floor(rnd() * doc.score.length); label = `removeBar ${bar}`; next = removeBar(doc, bar)?.doc ?? null; }
      ops.push(label);
      if (next === null) continue;
      const why = problem(next);
      if (why) expect.fail(`seed ${seed}, step ${step}: ${why}\noperations:\n${ops.join('\n')}`);
      doc = next;
      if (doc.score.some(b => b.ev.some(e => isTripletLength(e.d)))) accepted += 1;
    }
    expect(doc.score.length).toBeGreaterThan(0);
    applied += accepted;
  });

  it('the sequences make and edit triplets', () => {
    expect(applied).toBeGreaterThan(500);   // 2028 of 6000 steps with the fixed seeds
  });
});
