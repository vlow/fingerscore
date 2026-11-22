import type { Bar, Doc, Ev, TimeSig } from '../domain/types';

/** Compact event: [midi, duration in ticks, options]. midi 0 = rest. */
export type EvSpec = [m: number, d: number, opts?: { tie?: boolean }];
export interface BarSpec { ev: EvSpec[]; rs?: boolean; re?: boolean; volta?: Bar['volta'] }

/** Small hand-built document for tests. Bar cap = sum of event durations. */
export function mkDoc(bars: BarSpec[], timeSig: TimeSig = [4, 4]): Doc {
  let n = 0;
  const score: Bar[] = bars.map(b => ({
    cap: b.ev.reduce((s, e) => s + e[1], 0),
    rs: b.rs ?? false,
    re: b.re ?? false,
    volta: b.volta ?? '',
    ev: b.ev.map(([m, d, o]): Ev => ({ id: `t${++n}`, m, d, r: m === 0, tie: o?.tie ?? false, l: '' })),
  }));
  return {
    score, timeSig, originalTonicPc: 0, originalMode: 'major', tempo: 100, inst: 'xc', shift: 0,
    fingering: {}, chords: {}, imported: { lyrics: {}, chords: {} }, title: '', subtitle: '', chartStyle: 'compact', recorderSystem: 'baroque',
    show: { fingerings: true, chords: true, lyrics: true, raiseExtensions: true },
    source: { file: '', format: 'sample', track: '', trackCount: 1, simplified: false },
  };
}

/** Playable on every test instrument's default shift (G4 on the C xaphoon). */
const PLAYABLE = 67;

function barOf(cap: number, durations: number[]): BarSpec {
  const sum = durations.reduce((s, d) => s + d, 0);
  if (sum !== cap) throw new Error(`Bar durations sum to ${sum}, expected ${cap}`);
  return { ev: durations.map((d): EvSpec => [PLAYABLE, d]) };
}

/** A full 4/4 bar of sixteen sixteenth notes. */
export function sixteenthBar(): BarSpec {
  return barOf(48, Array<number>(16).fill(3));
}

/** A full 6/8 bar of notes with the given durations (ticks). */
export function bar68of(...durations: number[]): BarSpec {
  return barOf(36, durations);
}

/** A full 4/4 bar of notes with the given durations (ticks). */
export function bar44of(...durations: number[]): BarSpec {
  return barOf(48, durations);
}
