import { describe, expect, it } from 'vitest';
import { mkDoc, type EvSpec } from '../test/helpers';
import { expectValidBars } from '../test/validBars';
import { parseChord } from './chords';
import {
  addBarAfter, canMakeTriplet, canTie, dottedOf, eventOrder, fits, inTriplet, lengthChoices, lengthName, locate, makeTriplet, nextEvent,
  removeBar, setLength, setLetter, shiftPitch, splitLength, toggleDotted, toggleRest, toggleTie, toggleTriplet, undoTriplet,
} from './edit';
import { sampleDoc } from './fixture';
import { MAX_BARS, validateDoc } from './persistence';
import { DURATIONS, isTripletLength } from './time';
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
    expect(fits(d, d.score[1].ev[0].id, 48)).toBe(false); const a = addBarAfter(d, 1)!; expect(a.doc.score[2]).toMatchObject({ cap: 36, rs: false, re: false, volta: '' });
    expect(a.doc.score[2].ev).toHaveLength(1); expect(a.doc.score[2].ev[0]).toMatchObject({ r: true, d: 36, m: 62 }); expect(a.selectId).toBe(a.doc.score[2].ev[0].id);
  });
  it('2/2: a whole note fits at the bar start and a new bar holds 48 ticks', () => {
    const d = mkDoc([{ ev: [[60, 24], [62, 24]] }], [2, 2]);
    expect(shape(ok(setLength(d, d.score[0].ev[0].id, 48)))).toEqual(['n48']);
    expect(addBarAfter(d, 0)!.doc.score[1].cap).toBe(48);
  });
  it('6/8 bar capacity', () => { const d = mkDoc([{ ev: [[60, 36]] }], [6, 8]); expect(addBarAfter(d, 0)!.doc.score[1].cap).toBe(36); });
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
  it('addBarAfter stops at the saveable limit of MAX_BARS bars', () => {
    const full = mkDoc(Array.from({ length: MAX_BARS }, () => ({ ev: [[60, 48]] as EvSpec[] })));
    expect(addBarAfter(full, 0)).toBeNull();
    const one = { ...full, score: full.score.slice(1) };
    expect(addBarAfter(one, 0)!.doc.score).toHaveLength(MAX_BARS);
    expect(validateDoc(addBarAfter(one, 0)!.doc)).not.toBeNull();
  });
  it('bars: add and remove', () => {
    const d = mkDoc([{ ev: [[60, 48]], rs: true }, { ev: [[62, 48]], re: true, volta: '1' }]);
    const a = addBarAfter(d, 0)!; expect(a.doc.score.map(b => [b.rs, b.re, b.volta])).toEqual([[true, false, ''], [false, false, ''], [false, true, '1']]);
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
    expect(addBarAfter(d, 0)!.doc.score[0].ev[0].tie).toBe(false);
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
    d.score.forEach((_b, i) => { push(addBarAfter(d, i)!.doc); push(removeBar(d, i)?.doc ?? null); });
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

// ---- triplets ---------------------------------------------------------------------------------

/** A 4/4 document of one bar from lengths; a negative length is a rest. Pitches count up from 60. */
function bar(...lengths: number[]): Doc {
  return mkDoc([{ ev: lengths.map((d, i): [number, number] => [d < 0 ? 0 : 60 + i, Math.abs(d)]) }]);
}
const valid = (d: Doc | null): Doc => { expect(d).not.toBeNull(); expectValidBars(d!.score, d!.timeSig); expect(uniq(d!)).toBe(true); return d!; };
const lens = (d: Doc, b = 0) => d.score[b].ev.map(e => (e.r ? -e.d : e.d));
const idAt = (d: Doc, k: number, b = 0) => d.score[b].ev[k].id;

describe('make a triplet', () => {
  it('quarter at tick 0: three eighth triplets; the first keeps everything, the others are new notes of the same pitch', () => {
    const d0 = bar(12, 12, 24);
    const a = idAt(d0, 0);
    const d = { ...d0, chords: { [a]: parseChord('C', 0) }, fingering: { [a]: 1 }, imported: { lyrics: { [a]: 'la' }, chords: {} } };
    d.score[0].ev[0] = { ...d.score[0].ev[0], l: 'la' };
    const r = valid(makeTriplet(d, a));
    expect(lens(r)).toEqual([4, 4, 4, 12, 24]);
    const [x, y, z] = r.score[0].ev;
    expect(x).toMatchObject({ id: a, m: 60, l: 'la', r: false });
    expect(r.chords[a]).toEqual(d.chords[a]); expect(r.fingering[a]).toBe(1);
    for (const e of [y, z]) { expect(e).toMatchObject({ m: 60, r: false, tie: false, l: '' }); expect(ids(d)).not.toContain(e.id); }
  });
  it('a rest becomes three rests', () => {
    const r = valid(makeTriplet(bar(-12, 12, 24), idAt(bar(-12, 12, 24), 0)));
    expect(lens(r)).toEqual([-4, -4, -4, 12, 24]);
  });
  it('an eighth at tick 6 gives [..., 2, 2, 2, ...]', () => {
    const d = bar(6, 6, 6, 6, 24);
    expect(lens(valid(makeTriplet(d, idAt(d, 1))))).toEqual([6, 2, 2, 2, 6, 6, 24]);
  });
  it('a half at tick 12 gives three quarter triplets', () => {
    const d = bar(12, 24, 12);
    expect(lens(valid(makeTriplet(d, idAt(d, 1))))).toEqual([12, 8, 8, 8, 12]);
  });
  it('is not allowed on a dotted quarter, a whole, a sixteenth, a misplaced quarter or a member', () => {
    const dotted = bar(18, 6, 24); expect(canMakeTriplet(dotted, idAt(dotted, 0))).toBe(false); expect(makeTriplet(dotted, idAt(dotted, 0))).toBeNull();
    const whole = bar(48); expect(canMakeTriplet(whole, idAt(whole, 0))).toBe(false);
    const sixteenth = bar(3, 3, 6, 12, 24); expect(canMakeTriplet(sixteenth, idAt(sixteenth, 0))).toBe(false);
    const off = bar(6, 24, 18); expect(canMakeTriplet(off, idAt(off, 1))).toBe(false); expect(makeTriplet(off, idAt(off, 1))).toBeNull();   // a half at tick 6
    const off3 = bar(3, 12, 3, 6, 24); expect(canMakeTriplet(off3, idAt(off3, 1))).toBe(false);   // a quarter at tick 3
    const and = bar(6, 12, 6, 24); expect(canMakeTriplet(and, idAt(and, 1))).toBe(true);   // a quarter at tick 6: an eighth triplet may start on the "and" (design 4.1)
    const g = bar(4, 4, 4, 36); expect(canMakeTriplet(g, idAt(g, 0))).toBe(false);
    expect(canMakeTriplet(g, 'nope')).toBe(false);
  });
  it('the tie moves to the third member when the next note has the same pitch, else it is cleared', () => {
    const same = mkDoc([{ ev: [[60, 12, { tie: true }], [60, 36]] }]);
    const r = valid(makeTriplet(same, same.score[0].ev[0].id));
    expect(r.score[0].ev.map(e => e.tie)).toEqual([false, false, true, false]);
    const other = mkDoc([{ ev: [[60, 12, { tie: true }], [62, 36]] }]);
    expect(valid(makeTriplet(other, other.score[0].ev[0].id)).score[0].ev.some(e => e.tie)).toBe(false);
  });
});

describe('undo a triplet', () => {
  it('a group becomes one plain event with the first member id', () => {
    const d = bar(4, 4, 4, 36);
    const r = undoTriplet(d, idAt(d, 1))!; valid(r.doc);
    expect(lens(r.doc)).toEqual([12, 36]); expect(r.selectId).toBe(idAt(d, 0)); expect(idAt(r.doc, 0)).toBe(idAt(d, 0));
    expect(inTriplet(d, idAt(d, 1))).toBe(true); expect(inTriplet(r.doc, idAt(d, 0))).toBe(false);
  });
  it('first member a rest, second a note: the result takes the second member', () => {
    const d0 = mkDoc([{ ev: [[0, 4], [64, 4], [66, 4], [60, 36]] }]);
    const b = d0.score[0].ev[1].id;
    d0.score[0].ev[1] = { ...d0.score[0].ev[1], l: 'ba' };
    const d = { ...d0, chords: { [b]: parseChord('G', 0) }, fingering: { [b]: 0 }, imported: { lyrics: { [b]: 'ba' }, chords: { [d0.score[0].ev[2].id]: 'D' } } };
    const r = undoTriplet(d, d.score[0].ev[0].id)!; valid(r.doc);
    expect(r.selectId).toBe(b);
    expect(r.doc.score[0].ev[0]).toMatchObject({ id: b, m: 64, r: false, l: 'ba', d: 12 });
    expect(r.doc.chords[b]).toBeDefined(); expect(r.doc.fingering[b]).toBe(0);
    expect(r.doc.imported.chords).toEqual({});
  });
  it('all rests give a rest', () => {
    const d = bar(-4, -4, -4, 36);
    const r = undoTriplet(d, idAt(d, 2))!;
    expect(lens(r.doc)).toEqual([-12, 36]); expect(r.selectId).toBe(idAt(d, 0));
  });
  it('the tie of the last member survives when still valid; removed members lose their texts', () => {
    const d0 = mkDoc([{ ev: [[60, 4], [60, 4], [60, 4, { tie: true }], [60, 36]] }]);
    const [a, b, c] = d0.score[0].ev.map(e => e.id);
    const d = { ...d0, chords: { [b]: parseChord('C', 0), [c]: parseChord('F', 0) }, fingering: { [b]: 0, [c]: 0 }, imported: { lyrics: { [c]: 'x' }, chords: { [b]: 'C' } } };
    const r = undoTriplet(d, b)!; valid(r.doc);
    expect(r.doc.score[0].ev[0]).toMatchObject({ id: a, d: 12, tie: true });
    expect(r.doc.chords).toEqual({}); expect(r.doc.fingering).toEqual({}); expect(r.doc.imported).toEqual({ lyrics: {}, chords: {} });
    const lost = mkDoc([{ ev: [[60, 4], [60, 4], [60, 4, { tie: true }], [62, 36]] }]);
    expect(undoTriplet(lost, lost.score[0].ev[0].id)!.doc.score[0].ev[0].tie).toBe(false);
  });
  it('null for a plain event', () => { expect(undoTriplet(bar(12, 36), idAt(bar(12, 36), 0))).toBeNull(); });
  it('toggleTriplet makes or undoes and names the selection', () => {
    const d = bar(12, 36);
    const m = toggleTriplet(d, idAt(d, 0))!; valid(m.doc); expect(m.selectId).toBe(idAt(d, 0)); expect(lens(m.doc)).toEqual([4, 4, 4, 36]);
    const u = toggleTriplet(m.doc, m.doc.score[0].ev[1].id)!; expect(u.selectId).toBe(idAt(d, 0)); expect(lens(u.doc)).toEqual([12, 36]);
    expect(toggleTriplet(bar(18, 6, 24), idAt(bar(18, 6, 24), 0))).toBeNull();
  });
});

describe('length inside a group', () => {
  it('first of [4,4,4] to 8: the second is consumed, the third stays', () => {
    const d = bar(4, 4, 4, 36);
    const r = valid(setLength(d, idAt(d, 0), 8));
    expect(lens(r)).toEqual([8, 4, 36]); expect(idAt(r, 1)).toBe(idAt(d, 2));
  });
  it('first of [4,4,4] to 2: a triplet rest fills the gap', () => {
    const d = bar(4, 4, 4, 36);
    expect(lens(valid(setLength(d, idAt(d, 0), 2)))).toEqual([2, -2, 4, 4, 36]);
  });
  it('in [4,8] the first to 8: the partly covered member keeps id and end', () => {
    const d = bar(4, 8, 36);
    const r = valid(setLength(d, idAt(d, 0), 8));
    expect(lens(r)).toEqual([8, 4, 36]); expect(idAt(r, 1)).toBe(idAt(d, 1));
  });
  it('in [4,4,2,2] the third to 4', () => {
    const d = bar(4, 4, 2, 2, 36);
    expect(lens(valid(setLength(d, idAt(d, 2), 4)))).toEqual([4, 4, 4, 36]);
  });
  it('a member cannot leave its window or take a plain length', () => {
    const d = bar(4, 4, 4, 36);
    expect(setLength(d, idAt(d, 2), 8)).toBeNull();
    expect(setLength(d, idAt(d, 0), 6)).toBeNull();
    expect(setLength(d, idAt(d, 0), 12)).toBeNull();
  });
  it('lengthChoices of an eighth triplet member', () => {
    const d = bar(4, 4, 4, 36);
    const c = lengthChoices(d, idAt(d, 0));
    expect(c.map(x => x.notated)).toEqual([3, 6, 12, 24, 48]);
    expect(c.map(x => x.enabled)).toEqual([true, true, true, false, false]);
    expect(c.map(x => x.pressed)).toEqual([false, true, false, false, false]);
    expect(c.slice(0, 3).map(x => x.d)).toEqual([2, 4, 8]);
    const last = lengthChoices(d, idAt(d, 2));
    expect(last.map(x => x.enabled)).toEqual([true, true, false, false, false]);
  });
  it('no choice fills a whole window; every enabled choice gives a valid bar', () => {
    for (const d of [bar(4, 4, 4, 36), bar(2, 2, 2, 6, 36), bar(8, 8, 8, 24), bar(4, 2, 2, 4, 36)]) {
      for (const e of d.score[0].ev) {
        if (!inTriplet(d, e.id)) continue;
        for (const c of lengthChoices(d, e.id)) {
          if (!c.enabled) continue;
          const r = valid(setLength(d, e.id, c.d));
          expect(r.score[0].ev.some(x => isTripletLength(x.d))).toBe(true);   // a group stays a group
        }
      }
    }
  });
  it('lengthChoices of a plain event follow fits and the base length', () => {
    const d = bar(12, 12, 24);
    expect(lengthChoices(d, idAt(d, 2)).map(x => x.enabled)).toEqual([true, true, true, true, false]);
    expect(lengthChoices(d, idAt(d, 0)).map(x => [x.d, x.pressed]).slice(0, 3)).toEqual([[3, false], [6, false], [12, true]]);
  });
});

describe('a plain edit that reaches into a group', () => {
  it('a quarter lengthened to a half over [4,4,4] removes the group', () => {
    const d = bar(12, 4, 4, 4, 24);
    const r = valid(setLength(d, idAt(d, 0), 24));
    expect(lens(r)).toEqual([24, 24]);
  });
  it('to a dotted quarter: the remainder becomes plain rests', () => {
    const d = bar(12, 4, 4, 4, 24);
    expect(lens(valid(setLength(d, idAt(d, 0), 18)))).toEqual([18, -6, 24]);
  });
  it('an eighth lengthened to a quarter over [2,2,2] at 12 removes the group', () => {
    const d = bar(12, 6, 2, 2, 2, 6, 6, 12);
    // eighth at tick 12 is idAt 1 (plain 6); [2,2,2] follows at 18
    expect(lens(valid(setLength(d, idAt(d, 1), 12)))).toEqual([12, 12, 6, 6, 12]);
  });
  it('removed members lose their texts', () => {
    const d0 = bar(12, 4, 4, 4, 24); const m = idAt(d0, 2);
    const d = { ...d0, chords: { [m]: parseChord('C', 0) } };
    expect(valid(setLength(d, idAt(d, 0), 24)).chords).toEqual({});
  });
});

describe('other edits on a member', () => {
  it('pitch, rest and tie work and keep the group', () => {
    const d = mkDoc([{ ev: [[60, 4], [60, 4], [60, 4], [60, 36]] }]);
    const [a, b, c] = d.score[0].ev.map(e => e.id);
    expect(lens(valid(shiftPitch(d, b, 2)))).toEqual([4, 4, 4, 36]);
    expect(lens(valid(toggleRest(d, b)))).toEqual([4, -4, 4, 36]);
    expect(valid(toggleTie(d, a)).score[0].ev[0].tie).toBe(true);
    expect(valid(toggleTie(d, c)).score[0].ev[2].tie).toBe(true);
    expect(toggleDotted(d, a)).toBeNull();
  });
  it('a tie into the first member and out of the last are allowed', () => {
    const d = mkDoc([{ ev: [[60, 12], [60, 4], [60, 4], [60, 4], [60, 24]] }]);
    expect(valid(toggleTie(d, d.score[0].ev[0].id)).score[0].ev[0].tie).toBe(true);
  });
});

describe('bars next to a group', () => {
  it('add and remove bar keep every bar valid', () => {
    const d = mkDoc([{ ev: [[60, 4], [60, 4], [60, 4], [60, 36]] }, { ev: [[62, 48]] }]);
    const added = addBarAfter(d, 0)!; expectValidBars(added.doc.score, added.doc.timeSig); expect(added.doc.score.length).toBe(3);
    const removed = removeBar(d, 1)!; expectValidBars(removed.doc.score, removed.doc.timeSig);
    const gone = removeBar(d, 0)!; expectValidBars(gone.doc.score, gone.doc.timeSig); expect(gone.doc.score.length).toBe(1);
  });
});

describe('canMakeTriplet in a pickup bar (metric ticks)', () => {
  const pick = (...lengths: number[]) => mkDoc([{ ev: lengths.map((d, i): [number, number] => [60 + i, d]) }, { ev: [[60, 48]] }]);
  const can = (d: Doc, k: number) => canMakeTriplet(d, idAt(d, k));
  it('pickup of 12: a quarter at tick 0', () => { expect(can(pick(12), 0)).toBe(true); });
  it('pickup of 18 (metric offset 30)', () => {
    expect(can(pick(12, 6), 0)).toBe(true);     // metric 30
    expect(can(pick(6, 12), 1)).toBe(true);     // metric 36
    expect(can(pick(18), 0)).toBe(false);       // dotted quarter
  });
  it('pickup of 15 (metric offset 33)', () => {
    expect(can(pick(3, 12), 1)).toBe(true);     // quarter, metric 36
    expect(can(pick(6, 9), 0)).toBe(true);      // eighth, metric 33: a span of 6 starts on a multiple of 3
    expect(can(pick(12, 3), 0)).toBe(false);    // quarter, metric 33
  });
});

describe('an invalid bar is refused, never thrown on', () => {
  // [12,4,4,28]: two stray triplet-valued events outside any group
  const bad = (): Doc => mkDoc([{ ev: [[60, 12], [62, 4], [64, 4], [65, 28]] }]);
  it('setLength, toggleRest, toggleTie, pitch, dot, triplet and lengthChoices return null, false or nothing enabled', () => {
    const d = bad();
    for (const e of d.score[0].ev) {
      for (const len of [3, 6, 12, 24, 4, 2, 0, 5]) expect(() => setLength(d, e.id, len)).not.toThrow();
      for (const len of [3, 6, 12, 24, 4, 2, 0, 5]) expect(setLength(d, e.id, len)).toBeNull();
      expect(toggleRest(d, e.id)).toBeNull();
      expect(toggleTie(d, e.id)).toBeNull();
      expect(shiftPitch(d, e.id, 1)).toBeNull();
      expect(setLetter(d, e.id, 2, 'nearest')).toBeNull();
      expect(toggleDotted(d, e.id)).toBeNull();
      expect(toggleTriplet(d, e.id)).toBeNull();
      expect(canMakeTriplet(d, e.id)).toBe(false);
      expect(inTriplet(d, e.id)).toBe(false);
      expect(canTie(d, e.id)).toBe(false);
      expect(lengthChoices(d, e.id).some(c => c.enabled)).toBe(false);
    }
  });
});

describe('lengthChoices d values', () => {
  it('every entry of every group member names a plain or a triplet length', () => {
    for (const d of [bar(4, 4, 4, 36), bar(2, 2, 2, 6, 36), bar(8, 8, 8, 24), bar(4, 2, 2, 4, 36)]) {
      for (const e of d.score[0].ev) {
        for (const c of lengthChoices(d, e.id)) expect(isTripletLength(c.d) || DURATIONS.includes(c.d as never), `${c.notated} → ${c.d}`).toBe(true);
      }
    }
  });
});
