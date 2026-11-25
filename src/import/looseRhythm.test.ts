import { describe, expect, it } from 'vitest';
import { isTripletLength } from '../domain/time';
import { DEFAULT_PREFS } from '../domain/transpose';
import { instrumented } from '../test/timing';
import { expectValidBars } from '../test/validBars';
import { buildDoc } from './buildDoc';
import type { ParsedSong, RawNote } from './types';

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal samples with standard deviation `sd` (Box–Muller). */
const gauss = (rnd: () => number, sd: number) => () => sd * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

/** `bars` bars of 4/4 in eighths and sixteenths (or sixteenths only), every start and end jittered. */
function looseNotes(bars: number, sd: number, seed: number, sixteenthsOnly = false): RawNote[] {
  const rnd = random(seed);
  const jitter = gauss(rnd, sd);
  const out: RawNote[] = [];
  let t = 0;
  let pitch = 0;
  while (t < bars * 4) {
    const d = sixteenthsOnly || rnd() < 0.5 ? 0.25 : 0.5;
    const start = Math.max(0, t + jitter());
    const end = Math.max(start + 0.01, t + d + jitter());
    out.push({ start, dur: end - start, midi: 60 + (pitch++ % 12) });
    t += d;
  }
  return out;
}

function buildLoose(notes: RawNote[]) {
  const song: ParsedSong = {
    file: 'loose.mid', format: 'MIDI', title: '', timeSig: [4, 4], tempo: 100, key: null, pickup: 0, marks: [], dropped: [],
    tracks: [{ id: 't', name: 'M', instrument: '', channel: 0, percussion: false, notes, lyrics: [], chords: [] }],
  };
  return buildDoc(song, { trackId: 't', keep: 'top', lyricsFrom: null, chordsFrom: null, instId: 'fl', prefs: DEFAULT_PREFS });
}

describe('loosely played plain rhythm', () => {
  it('500 bars of eighths and sixteenths with jitter of sd 0.05 quarter hold no triplet length', () => {
    const doc = buildLoose(looseNotes(500, 0.05, 7));
    expectValidBars(doc.score, doc.timeSig);
    const withTriplet = doc.score.filter(b => b.ev.some(e => isTripletLength(e.d)));
    expect(withTriplet.map(b => b.ev.map(e => e.d))).toEqual([]);
  });
  it('1,990 bars of jittered sixteenths build in under 600 ms', () => {
    const notes = looseNotes(1990, 0.05, 11, true);
    const t0 = performance.now();
    const doc = buildLoose(notes);
    const ms = performance.now() - t0;
    expect(doc.score.length).toBeGreaterThanOrEqual(1990);
    if (!instrumented) expect(ms).toBeLessThan(600);
  });
});
