import type { Family } from '../domain/instruments';

/** How one instrument sounds. Plain data: a new instrument sound is a new preset. */
export interface Preset {
  /** Amplitude of harmonics 1..n; harmonic 1 is 1. */
  harmonics: number[];
  /** Breath noise through a bandpass: `attackLevel` on the attack, `level` while the note holds. */
  breath: { level: number; attackLevel: number; freq: number; q: number };
  /** Rate in Hz, depth in cents (0: none), delay and fade-in in seconds. */
  vibrato: { rate: number; depth: number; delay: number; fade: number };
  /** Lowpass cutoff: starts at `peak` and settles to `base` within `settle` seconds. */
  filter: { base: number; peak: number; settle: number };
  attack: number;
  release: number;
  /** Linear peak level of the note. */
  gain: number;
}

const NO_VIBRATO = { rate: 0, depth: 0, delay: 0, fade: 0 };

/** Amplitudes `f(n)` for harmonics 1..count. */
const series = (count: number, f: (n: number) => number) => Array.from({ length: count }, (_, i) => f(i + 1));

const SAXOPHONE: Preset = {
  harmonics: series(12, n => 1 / n),
  breath: { level: 0, attackLevel: 0.01, freq: 2500, q: 1 },
  vibrato: { rate: 5.5, depth: 5, delay: 0.3, fade: 0.3 },
  filter: { base: 2400, peak: 4000, settle: 0.12 },
  attack: 0.03,
  release: 0.08,
  gain: 0.2,
};

export const PRESETS: Record<Family, Preset> = {
  Saxophone: SAXOPHONE,
  Xaphoon: {
    ...SAXOPHONE,
    harmonics: series(12, n => 1 / n ** 1.3),
    breath: { ...SAXOPHONE.breath, level: 0, attackLevel: 0.01 },
    vibrato: { ...SAXOPHONE.vibrato, depth: 4 },
    filter: { ...SAXOPHONE.filter, base: 1600, peak: 2800 },
  },
  Clarinet: {
    ...SAXOPHONE,
    harmonics: series(11, n => (n % 2 === 1 ? 1 : 0.15) / n),
    breath: { ...SAXOPHONE.breath, level: 0, attackLevel: 0.01 },
    vibrato: NO_VIBRATO,
    filter: { ...SAXOPHONE.filter, base: 1800, peak: 3000 },
  },
  Flute: {
    ...SAXOPHONE,
    harmonics: [1, 0.25, 0.12, 0.04],
    breath: { level: 0, attackLevel: 0.01, freq: 3000, q: 0.7 },
    vibrato: { rate: 5, depth: 6, delay: 0.25, fade: 0.3 },
    filter: { ...SAXOPHONE.filter, base: 4000, peak: 6000 },
  },
  Recorder: {
    ...SAXOPHONE,
    harmonics: [1, 0.15, 0.08],
    breath: { level: 0, attackLevel: 0.01, freq: 3500, q: 2 },
    vibrato: NO_VIBRATO,
    filter: { base: 3500, peak: 5000, settle: 0.05 },
  },
};

/** The Tracks preview: neutral and soft, since chords add up. */
export const PREVIEW_PRESET: Preset = {
  ...SAXOPHONE,
  harmonics: [1, 0.3, 0.1],
  breath: { ...SAXOPHONE.breath, level: 0, attackLevel: 0.01 },
  vibrato: NO_VIBRATO,
  filter: { ...SAXOPHONE.filter, base: 3000, peak: 3500 },
  gain: 0.11,
};
