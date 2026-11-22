import { describe, expect, it } from 'vitest';
import { mkDoc, type EvSpec } from '../test/helpers';
import { parseChord } from './chords';
import {
  addBarAfter, canTie, dottedOf, eventOrder, fits, lengthName, locate, nextEvent, removeBar, setLength, setLetter, shiftPitch,
  splitLength, toggleDotted, toggleRest, toggleTie,
} from './edit';
import { sampleDoc } from './fixture';
import { validateDoc } from './persistence';
import { DURATIONS } from './time';
import type { Doc } from './types';

const sum = (d: Doc) => d.score.every(b => b.ev.reduce((s, e) => s + e.d, 0) === b.cap);
const ids = (d: Doc) => d.score.flatMap(b => b.ev.map(e => e.id));
const uniq = (d: Doc) => new Set(ids(d)).size === ids(d).length;
const shape = (d: Doc, bar = 0) => d.score[bar].ev.map(e => (e.r ? 'r' : 'n') + e.d);
const ok = (d: Doc | null): Doc => { expect(d).not.toBeNull(); expect(sum(d!)).toBe(true); expect(uniq(d!)).toBe(true); return d!; };

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

describe('navigation', () => {
  it('locate, eventOrder and nextEvent work across bar lines', () => {
    const d = mkDoc([{ ev: [[60, 24], [62, 24]] }, { ev: [[64, 48]] }]);
    const [a, b] = d.score[0].ev; const c = d.score[1].ev[0];
    expect(locate(d, b.id)).toEqual({ bar: 0, index: 1, tick: 24, ev: b });
    expect(locate(d, c.id)).toEqual({ bar: 1, index: 0, tick: 0, ev: c });
    expect(locate(d, 'nope')).toBeNull();
    expect(eventOrder(d).map(e => e.id)).toEqual([a.id, b.id, c.id]);
    expect(nextEvent(d, b.id)).toBe(c);
    expect(nextEvent(d, c.id)).toBeNull();
  });
});

describe('lengths', () => {
  it('check 6: quarter → eighth inserts an eighth rest', () => {
    const d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 24]] }]); const id = d.score[0].ev[0].id;
    const r = ok(setLength(d, id, 6)); expect(shape(r)).toEqual(['n6', 'r6', 'n12', 'n24']); expect(r.score[0].ev[0].id).toBe(id);
  });
  it('shorter: the gap is filled greedily', () => {
    const d = mkDoc([{ ev: [[60, 48]] }]);
    expect(shape(ok(setLength(d, d.score[0].ev[0].id, 3)))).toEqual(['n3', 'r36', 'r9']);
  });
  it('new rests remember the pitch of the nearest earlier note and get new ids', () => {
    const d = mkDoc([{ ev: [[60, 12], [0, 36]] }]);
    const r = ok(setLength(d, d.score[0].ev[1].id, 9)); expect(shape(r)).toEqual(['n12', 'r9', 'r24', 'r3']);
    expect(r.score[0].ev.slice(2).map(e => [e.r, e.m])).toEqual([[true, 60], [true, 60]]);
    expect(ids(r).slice(2).some(i => ids(d).includes(i))).toBe(false);
  });
  it('longer: consumes whole events', () => {
    const d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 24]] }]);
    const r = ok(setLength(d, d.score[0].ev[0].id, 24)); expect(shape(r)).toEqual(['n24', 'n24']);
    expect(ids(r)).toEqual([d.score[0].ev[0].id, d.score[0].ev[2].id]);
  });
  it.each<[string, EvSpec[], number, string[] | null]>([
    ['quarter +3 over a quarter', [[60, 12], [62, 12], [64, 24]], 15, null],                     // 15 is not an allowed duration
    ['quarter → dotted quarter over a quarter', [[60, 12], [62, 12], [64, 24]], 18, ['n18', 'n6', 'n24']],
    ['eighth → dotted eighth over an eighth', [[60, 6], [62, 6], [64, 36]], 9, ['n9', 'n3', 'n36']],
    ['quarter → dotted quarter over a half', [[60, 12], [62, 24], [64, 12]], 18, ['n18', 'n18', 'n12']],
    ['quarter → half over an eighth and a dotted quarter', [[60, 12], [62, 6], [64, 18], [65, 12]], 24, ['n24', 'n12', 'n12']],
    ['sixteenth → dotted quarter over a rest and a half', [[60, 3], [0, 9], [62, 24], [64, 12]], 18, ['n18', 'n18', 'n12']],
    ['quarter → whole over the rest of the bar', [[60, 12], [62, 12], [64, 24]], 48, ['n48']],
  ])('longer over a partly covered neighbour: %s', (_n, evs, d, expected) => {
    const doc = mkDoc([{ ev: evs }]);
    const r = setLength(doc, doc.score[0].ev[0].id, d);
    if (expected === null) { expect(r).toBeNull(); return; }
    expect(shape(ok(r))).toEqual(expected);
  });
  it('a partly covered neighbour keeps its id, its end and its data', () => {
    const d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 24]] }]); const b = d.score[0].ev[1];
    const r = ok(setLength({ ...d, fingering: { [b.id]: 1 } }, d.score[0].ev[0].id, 18));
    expect(r.score[0].ev[1]).toMatchObject({ id: b.id, m: 62, d: 6 }); expect(r.fingering).toEqual({ [b.id]: 1 });
  });
  it('a partly covered neighbour with a non-representable remainder becomes rests', () => {
    const d = mkDoc([{ ev: [[60, 3], [62, 24], [64, 12], [0, 9]] }]);                            // 3 + 24 + 12 + 9 = 48
    const r = ok(setLength(d, d.score[0].ev[0].id, 6)); expect(shape(r)).toEqual(['n6', 'r18', 'r3', 'n12', 'r9']);
    expect(ids(r)).not.toContain(d.score[0].ev[1].id);
  });
  it('the same length returns the document unchanged', () => {
    const d = mkDoc([{ ev: [[60, 48]] }]); expect(setLength(d, d.score[0].ev[0].id, 48)).toBe(d);
  });
  it('never crosses the bar line; fits() agrees', () => {
    const d = mkDoc([{ ev: [[60, 24], [62, 24]] }, { ev: [[64, 48]] }]); const id = d.score[0].ev[1].id;
    expect(fits(d, id, 24)).toBe(true); expect(fits(d, id, 36)).toBe(false); expect(setLength(d, id, 36)).toBeNull(); expect(fits(d, id, 5)).toBe(false);
  });
  it('pickup bar and 3/4', () => {
    const d = mkDoc([{ ev: [[60, 12]] }, { ev: [[62, 36]] }], [3, 4]); const p = d.score[0].ev[0].id;
    expect(fits(d, p, 18)).toBe(false); expect(shape(ok(setLength(d, p, 6)))).toEqual(['n6', 'r6']);
    expect(fits(d, d.score[1].ev[0].id, 48)).toBe(false); const a = addBarAfter(d, 1); expect(a.doc.score[2]).toMatchObject({ cap: 36, rs: false, re: false, volta: '' });
    expect(a.doc.score[2].ev).toHaveLength(1); expect(a.doc.score[2].ev[0]).toMatchObject({ r: true, d: 36, m: 62 }); expect(a.selectId).toBe(a.doc.score[2].ev[0].id);
  });
  it('6/8 bar capacity', () => { const d = mkDoc([{ ev: [[60, 36]] }], [6, 8]); expect(addBarAfter(d, 0).doc.score[1].cap).toBe(36); });
  it('shortening a tied note clears its tie', () => {
    const d = mkDoc([{ ev: [[60, 24, { tie: true }], [60, 24]] }]);
    expect(ok(setLength(d, d.score[0].ev[0].id, 12)).score[0].ev[0].tie).toBe(false);
  });
  it('lyrics, chords and fingering stay with surviving events and leave with consumed ones', () => {
    let d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 24]] }]); const [a, b, c] = d.score[0].ev;
    d = { ...d, score: d.score.map(bar => ({ ...bar, ev: bar.ev.map(e => ({ ...e, l: e.id })) })), fingering: { [b.id]: 1, [c.id]: 1 },
          chords: { [b.id]: parseChord('C', 0), [c.id]: parseChord('G', 0) }, imported: { lyrics: { [b.id]: 'x', [c.id]: 'y' }, chords: { [b.id]: 'C' } } };
    const r = ok(setLength(d, a.id, 24));
    expect(Object.keys(r.fingering)).toEqual([c.id]); expect(Object.keys(r.chords)).toEqual([c.id]); expect(r.imported).toEqual({ lyrics: { [c.id]: 'y' }, chords: {} });
    expect(r.score[0].ev[1].l).toBe(c.id); expect(d.score[0].ev).toHaveLength(3);   // input untouched
  });
  it('dots', () => {
    expect(splitLength(9)).toEqual({ base: 6, dotted: true }); expect(splitLength(36)).toEqual({ base: 24, dotted: true }); expect(splitLength(12)).toEqual({ base: 12, dotted: false });
    expect([3, 6, 12, 24, 48].map(dottedOf)).toEqual([null, 9, 18, 36, null]);
  });
});

describe('pitches, rests and ties', () => {
  it('pitch: semitone, octave, limits, rests', () => {
    const d = mkDoc([{ ev: [[60, 24], [0, 24]] }]); const [n, rest] = d.score[0].ev;
    expect(ok(shiftPitch(d, n.id, 1)).score[0].ev[0].m).toBe(61); expect(ok(shiftPitch(d, n.id, -12)).score[0].ev[0].m).toBe(48);
    expect(shiftPitch(d, n.id, 100)).toBeNull(); expect(shiftPitch(d, rest.id, 1)).toBeNull();
  });
  it('a pitch change drops that note\'s fingering choice only', () => {
    let d = mkDoc([{ ev: [[60, 24], [62, 24]] }]); const [a, b] = d.score[0].ev;
    d = { ...d, fingering: { [a.id]: 1, [b.id]: 1 } }; expect(ok(shiftPitch(d, a.id, 1)).fingering).toEqual({ [b.id]: 1 });
  });
  it('ties: allowed only into a same-pitch note, cleared when pitches part', () => {
    const d = mkDoc([{ ev: [[60, 24], [60, 24]] }, { ev: [[60, 24], [62, 24]] }]); const [a, b] = d.score[0].ev; const c = d.score[1].ev[0];
    expect(canTie(d, a.id)).toBe(true); expect(canTie(d, b.id)).toBe(true); expect(canTie(d, c.id)).toBe(false);          // b ties over the bar line
    const tied = ok(toggleTie(d, a.id)); expect(tied.score[0].ev[0].tie).toBe(true); expect(ok(toggleTie(tied, a.id)).score[0].ev[0].tie).toBe(false);
    expect(ok(shiftPitch(tied, b.id, 2)).score[0].ev[0].tie).toBe(false);          // the tie into b is cleared
    expect(ok(shiftPitch(tied, a.id, 2)).score[0].ev[0].tie).toBe(false);          // the tie out of a is cleared
    expect(ok(toggleRest(tied, b.id)).score[0].ev[0].tie).toBe(false); expect(toggleTie(d, c.id)).toBeNull();
  });
  it('rest ↔ note remembers the pitch and keeps the lyric', () => {
    let d = mkDoc([{ ev: [[60, 24], [62, 24]] }]); const b = d.score[0].ev[1];
    d = { ...d, score: [{ ...d.score[0], ev: [d.score[0].ev[0], { ...b, l: 'la' }] }] };
    const r = ok(toggleRest(d, b.id)); expect(r.score[0].ev[1]).toMatchObject({ r: true, m: 62, l: 'la', tie: false });
    expect(ok(toggleRest(r, b.id)).score[0].ev[1]).toMatchObject({ r: false, m: 62, l: 'la' });
  });
  it('turning a note into a rest drops its fingering choice', () => {
    const d = { ...mkDoc([{ ev: [[60, 24], [62, 24]] }]) }; const b = d.score[0].ev[1];
    expect(ok(toggleRest({ ...d, fingering: { [b.id]: 1 } }, b.id)).fingering).toEqual({});
  });
  it('letters: key signature and nearest playable octave', () => {
    const d = { ...mkDoc([{ ev: [[67, 48]] }]), inst: 'fl' as const, originalTonicPc: 7, shift: 0 };     // G major, written = concert on flute
    const id = d.score[0].ev[0].id; expect(ok(setLetter(d, id, 3, 'nearest')).score[0].ev[0].m).toBe(66);   // F → F♯4 (nearest to G4)
    expect(ok(setLetter(d, id, 0, 'nearest')).score[0].ev[0].m).toBe(72);                                   // C → C5 (5 up) rather than C4 (7 down)
    const low = { ...d, score: [{ ...d.score[0], ev: [{ ...d.score[0].ev[0], m: 61 }] }] };                 // C♯4 on a flute (lowest note C4)
    expect(ok(setLetter(low, id, 6, 'nearest')).score[0].ev[0].m).toBe(71);                                 // B: B3 is unplayable → B4
  });
  it('letters follow the written key of a transposing instrument and turn a rest into a note', () => {
    // alto sax sounds a major sixth lower: written = concert + 9; concert F major → written D major (F♯, C♯)
    const d = { ...mkDoc([{ ev: [[0, 48]] }]), inst: 'asax' as const, originalTonicPc: 5, shift: 0 };
    const rest = { ...d, score: [{ ...d.score[0], ev: [{ ...d.score[0].ev[0], m: 65 }] }] };          // remembers concert F4, written D5
    const r = ok(setLetter(rest, d.score[0].ev[0].id, 0, 'nearest')).score[0].ev[0];                     // C → C♯5 written, 1 below D5
    expect(r).toMatchObject({ r: false, m: 64 });
  });
});

describe('minor keys and compound meter', () => {
  it('letters in a minor key use its signature', () => {
    // E minor (one sharp, F♯) on a flute: written = concert
    const d = { ...mkDoc([{ ev: [[64, 48]] }]), inst: 'fl' as const, originalTonicPc: 4, originalMode: 'minor' as const, shift: 0 };
    const id = d.score[0].ev[0].id;
    expect(ok(setLetter(d, id, 3, 'nearest')).score[0].ev[0].m).toBe(66);   // F → F♯4, 2 above E4
    expect(ok(setLetter(d, id, 2, 'nearest')).score[0].ev[0].m).toBe(64);   // E → E4 itself
    // D minor (one flat, B♭): B → B♭
    const dm = { ...d, originalTonicPc: 2 };
    expect(ok(setLetter(dm, id, 6, 'nearest')).score[0].ev[0].m).toBe(70);  // B♭4, 6 above E4 (B♭3 is unplayable)
  });
  it('lengths inside a 6/8 bar', () => {
    const d = mkDoc([{ ev: [[60, 18], [62, 6], [64, 6], [65, 6]] }], [6, 8]); const [a, , , last] = d.score[0].ev;
    expect(d.score[0].cap).toBe(36);
    expect(shape(ok(setLength(d, a.id, 24)))).toEqual(['n24', 'n6', 'n6']);
    expect(shape(ok(setLength(d, a.id, 36)))).toEqual(['n36']);
    expect(fits(d, a.id, 48)).toBe(false); expect(setLength(d, a.id, 48)).toBeNull();
    expect(shape(ok(setLength(d, a.id, 6)))).toEqual(['n6', 'r12', 'n6', 'n6', 'n6']);
    expect(fits(d, last.id, 9)).toBe(false); expect(fits(d, last.id, 3)).toBe(true);
  });
});

describe('bars', () => {
  it('addBarAfter refuses a bar index that does not exist', () => {
    const d = mkDoc([{ ev: [[60, 48]] }]);
    expect(() => addBarAfter(d, 1)).toThrow(RangeError); expect(() => addBarAfter(d, -1)).toThrow(RangeError);
    expect(() => addBarAfter(d, 0.5)).toThrow(RangeError);
  });
  it('bars: add and remove', () => {
    const d = mkDoc([{ ev: [[60, 48]], rs: true }, { ev: [[62, 48]], re: true, volta: '1' }]);
    const a = addBarAfter(d, 0); expect(a.doc.score.map(b => [b.rs, b.re, b.volta])).toEqual([[true, false, ''], [false, false, ''], [false, true, '1']]);
    const r = removeBar(a.doc, 1)!; expect(r.doc.score).toHaveLength(2); expect(r.selectId).toBe(d.score[1].ev[0].id);
    const last = removeBar(d, 1)!; expect(last.selectId).toBe(d.score[0].ev[0].id); expect(removeBar(mkDoc([{ ev: [[60, 48]] }]), 0)).toBeNull();
  });
  it('a removed bar takes its events\' data along; ties into it are cleared', () => {
    let d = mkDoc([{ ev: [[60, 48, { tie: true }]] }, { ev: [[60, 48]] }, { ev: [[62, 48]] }]); const gone = d.score[1].ev[0];
    d = { ...d, fingering: { [gone.id]: 1 }, chords: { [gone.id]: parseChord('C', 0) }, imported: { lyrics: { [gone.id]: 'a' }, chords: { [gone.id]: 'C' } } };
    const r = removeBar(d, 1)!;
    expect(r.doc.fingering).toEqual({}); expect(r.doc.chords).toEqual({}); expect(r.doc.imported).toEqual({ lyrics: {}, chords: {} });
    expect(r.doc.score[0].ev[0].tie).toBe(false);
  });
  it('a bar added after a tied note clears the tie', () => {
    const d = mkDoc([{ ev: [[60, 48, { tie: true }]] }, { ev: [[60, 48]] }]);
    expect(addBarAfter(d, 0).doc.score[0].ev[0].tie).toBe(false);
  });
});

describe('every edit result', () => {
  it('passes validation and leaves its input untouched', () => {
    const d = deepFreeze(sampleDoc('asax'));
    const before = JSON.stringify(d);
    const results: Doc[] = [];
    const push = (r: Doc | null) => { if (r && r !== d) results.push(r); };
    for (const e of eventOrder(d)) {
      for (const len of DURATIONS) push(setLength(d, e.id, len));
      for (const s of [-12, -1, 1, 12]) push(shiftPitch(d, e.id, s));
      for (let letter = 0; letter < 7; letter++) push(setLetter(d, e.id, letter, 'nearest'));
      push(toggleRest(d, e.id)); push(toggleTie(d, e.id));
    }
    d.score.forEach((_b, i) => { push(addBarAfter(d, i).doc); push(removeBar(d, i)?.doc ?? null); });
    expect(results.length).toBeGreaterThan(500);
    for (const r of results) {
      expect(sum(r) && uniq(r)).toBe(true);
      expect(validateDoc(JSON.parse(JSON.stringify(r)))).not.toBeNull();
    }
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('length names and the dot toggle', () => {
  it('names every allowed length', () => {
    expect(DURATIONS.map(lengthName)).toEqual(['whole', 'dotted half', 'half', 'dotted quarter', 'quarter', 'dotted eighth', 'eighth', 'sixteenth']);
  });

  it('toggles the dot when it fits; null otherwise', () => {
    const d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 24]] }]);
    const [a, , c] = d.score[0].ev.map(e => e.id);
    const dotted = toggleDotted(d, a)!;
    expect(locate(dotted, a)!.ev.d).toBe(18);
    expect(locate(toggleDotted(dotted, a)!, a)!.ev.d).toBe(12);
    expect(toggleDotted(d, c)).toBeNull();                         // a dotted half does not fit
    expect(toggleDotted(mkDoc([{ ev: [[60, 48]] }]), 't1')).toBeNull();   // no dotted whole
    expect(toggleDotted(d, 'nope')).toBeNull();
  });
});
