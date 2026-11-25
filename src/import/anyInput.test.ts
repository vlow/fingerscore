import { describe, expect, it } from 'vitest';
import { barCap } from '../domain/time';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { TimeSig } from '../domain/types';
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

const METERS: TimeSig[] = [[4, 4], [3, 4], [6, 8], [2, 2], [2, 4]];

/**
 * Arbitrary note lists: chords and repeated onsets, zero and negative durations, notes on exact thirds, fifths and
 * sevenths with and without small offsets, notes far across bar lines, pickups of any length.
 */
function anyNotes(rnd: () => number): { notes: RawNote[]; timeSig: TimeSig; pickup: number } {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const timeSig = pick(METERS);
  const horizon = pick([3, 6, 12, 40]);
  const count = 1 + Math.floor(rnd() * 20);
  const notes: RawNote[] = [];
  for (let k = 0; k < count; k++) {
    const prev = notes.length > 0 ? notes[notes.length - 1] : undefined;
    let start: number;
    let dur: number;
    const kind = rnd();
    if (kind < 0.4) {
      // a tuplet position, exact or a little off
      const g = pick([3, 4, 5, 6, 7, 12]);
      const off = pick([0, 0, 0, 0.004, -0.004, 0.006, -0.006, 0.012, 0.03]);
      start = Math.max(0, Math.floor(rnd() * horizon * g) / g + off);
      dur = (1 + Math.floor(rnd() * g)) / g + pick([0, 0, 0.004, -0.006, 0.02]);
    } else if (kind < 0.7) {
      // any whole tick, often off the sixteenth grid
      start = Math.floor(rnd() * horizon * 12) / 12;
      dur = (1 + Math.floor(rnd() * 24)) / 12;
    } else {
      start = prev && rnd() < 0.2 ? prev.start : rnd() * horizon;   // same onset as the last note: a chord
      const d = rnd();
      dur = d < 0.1 ? 0 : d < 0.15 ? -rnd() : d < 0.3 ? 0.01 : d < 0.4 ? rnd() * 12 : rnd() * 2;
    }
    notes.push({ start, dur, midi: 50 + Math.floor(rnd() * 24) });
  }
  const pickup = rnd() < 0.7 ? 0 : rnd() * (barCap(timeSig) / 12) * 1.2;
  return { notes, timeSig, pickup };
}

function build(notes: RawNote[], timeSig: TimeSig, pickup: number) {
  const song: ParsedSong = {
    file: 'any.mid', format: 'MIDI', title: '', timeSig, tempo: 100, key: null, pickup, marks: [], dropped: [],
    tracks: [{ id: 't', name: 'M', instrument: '', channel: 0, percussion: false, notes, lyrics: [], chords: [] }],
  };
  return buildDoc(song, { trackId: 't', keep: 'top', lyricsFrom: null, chordsFrom: null, instId: 'fl', prefs: DEFAULT_PREFS });
}

describe('import of arbitrary note lists', () => {
  it('2,000 random note lists: nothing throws, every bar is valid', () => {
    const rnd = random(20261124);
    for (let i = 0; i < 2000; i++) {
      const { notes, timeSig, pickup } = anyNotes(rnd);
      const input = JSON.stringify({ notes, timeSig, pickup });
      let doc: ReturnType<typeof build> | null = null;
      expect(() => { doc = build(notes, timeSig, pickup); }, input).not.toThrow();
      expectValidBars(doc!.score, timeSig);
    }
  });
});
