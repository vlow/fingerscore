import { describe, expect, it } from 'vitest';
import { barCap, PLAIN_LENGTHS } from '../domain/time';
import { canStartGroup, MEMBER_LENGTHS, tripletGroups, type Span } from '../domain/triplets';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Bar, TimeSig } from '../domain/types';
import { expectValidBars } from '../test/validBars';
import { buildDoc } from './buildDoc';
import type { ParsedSong } from './types';

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

/** A random valid list of lengths for one full bar: plain lengths and whole triplet groups. */
function randomBar(rnd: () => number, cap: number): number[] {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const out: number[] = [];
  let pos = 0;
  while (pos < cap) {
    const spans = ([6, 12, 24] as Span[]).filter(s => pos + s <= cap && canStartGroup(pos, s));
    if (spans.length > 0 && rnd() < 0.5) {
      const span = pick(spans);
      let left = span;
      while (left > 0) {
        const m = pick(MEMBER_LENGTHS[span].filter(d => d <= left));
        out.push(m);
        left -= m;
      }
      pos += span;
    } else {
      const d = pick(PLAIN_LENGTHS.filter(x => x <= cap - pos && x <= 12));
      out.push(d);
      pos += d;
    }
  }
  return out;
}

/** Onset and end in ticks of every sounding note, tied events joined. */
function timing(bar: Bar): [number, number][] {
  const out: [number, number][] = [];
  let t = 0;
  let tiedIn = false;
  for (const e of bar.ev) {
    if (tiedIn) out[out.length - 1][1] = t + e.d;
    else out.push([t, t + e.d]);
    tiedIn = e.tie;
    t += e.d;
  }
  return out;
}

/** The differing middle of two length lists, e.g. "[8,4,4,8] → [8,4t,4,4,4]". */
function difference(a: number[], b: Bar['ev']): string {
  const bs = b.map(e => `${e.d}${e.tie ? 't' : ''}`);
  const as = a.map(String);
  let i = 0;
  while (i < as.length && i < bs.length && as[i] === bs[i]) i += 1;
  let j = 0;
  while (j < as.length - i && j < bs.length - i && as[as.length - 1 - j] === bs[bs.length - 1 - j]) j += 1;
  return `[${as.slice(i, as.length - j).join(',')}] → [${bs.slice(i, bs.length - j).join(',')}]`;
}

function referenceRun(count: number, seed: number) {
  const rnd = random(seed);
  const meters: TimeSig[] = [[4, 4], [3, 4], [6, 8], [2, 4]];
  const diffs = new Map<string, number>();
  const cases: { ts: TimeSig; lengths: number[]; bar: Bar }[] = [];
  while (cases.length < count) {
    const ts = meters[Math.floor(rnd() * meters.length)];
    const cap = barCap(ts);
    const lengths = randomBar(rnd, cap);
    const input: Bar = { cap, rs: false, re: false, volta: '', ev: lengths.map((d, i) => ({ id: `i${i}`, m: 60 + i, d, r: false, tie: false, l: '' })) };
    const groups = tripletGroups(input, cap);
    if (!groups) continue;
    // Import holds no triplet eighths in a quarter-triplet group (design 4.2); such a bar comes back cut otherwise.
    const eighthsInQuarterTriplet = groups.some(g => g.span === 24 && g.ids.some(id => input.ev.find(e => e.id === id)?.d === 4));
    let t = 0;
    const notes = lengths.map((d, i) => { const q = { start: t / 12, dur: d / 12, midi: 60 + i }; t += d; return q; });
    const song: ParsedSong = {
      file: 'r.mid', format: 'MIDI', title: '', timeSig: ts, tempo: 100, key: null, pickup: 0, marks: [], dropped: [],
      tracks: [{ id: 't', name: 'M', instrument: '', channel: 0, percussion: false, notes, lyrics: [], chords: [] }],
    };
    const doc = buildDoc(song, { trackId: 't', keep: 'top', lyricsFrom: null, chordsFrom: null, instId: 'fl', prefs: DEFAULT_PREFS });
    const bar = doc.score[0];
    expect(doc.score).toHaveLength(1);
    expect(doc.source.simplified).toBe(false);
    expectValidBars(doc.score, ts);
    expect(timing(bar)).toEqual(timing(input));
    if (!eighthsInQuarterTriplet) expect(bar.ev.map(e => e.d)).toEqual(lengths);
    else if (bar.ev.map(e => e.d).join() !== lengths.join()) {
      const key = difference(lengths, bar.ev);
      diffs.set(key, (diffs.get(key) ?? 0) + 1);
    }
    cases.push({ ts, lengths, bar });
  }
  return { diffs };
}

describe('reference: random valid bars come back with the same timing', () => {
  it('400 bars: the same lengths unless a quarter-triplet group holds triplet eighths', () => {
    // Such a group comes back re-cut with equal timing, e.g. [16,4,4] → [12 tie,4,4,4] or [4,16,4] → [4,8 tie,8,4].
    const { diffs } = referenceRun(400, 20261124);
    expect([...diffs.values()].reduce((a, b) => a + b, 0)).toBeLessThan(400);
  });
});
