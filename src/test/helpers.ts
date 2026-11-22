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
    ev: b.ev.map(([m, d, o]): Ev => ({ id: `t${++n}`, m, d, r: m === 0, tie: o?.tie ?? false, l: '', c: '' })),
  }));
  return {
    score, timeSig, originalTonicPc: 0, originalMode: 'major', tempo: 100, inst: 'xc', shift: 0,
    fingering: {}, chords: {}, title: '', subtitle: '', chartStyle: 'compact', recorderSystem: 'baroque',
    show: { fingerings: true, chords: true, lyrics: true, raiseExtensions: true },
    source: { file: '', format: 'sample', track: '', trackCount: 1, simplified: false },
  };
}
