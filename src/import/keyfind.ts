import { mod12 } from '../domain/keys';
import type { Mode } from '../domain/types';
import type { RawNote } from './types';

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]): number {
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

function histogram(notes: RawNote[]): number[] {
  const hist = new Array<number>(12).fill(0);
  for (const n of notes) hist[mod12(n.midi)] += n.dur;
  return hist;
}

/** Correlation of the duration histogram with the key on tonic t. */
function fit(hist: number[], t: number, mode: Mode): number {
  const rotated = hist.map((_, i) => hist[mod12(i + t)]); // rotated[i] = weight of the degree i above t
  return correlation(rotated, mode === 'major' ? MAJOR : MINOR);
}

/** Krumhansl–Schmuckler, weighted by note duration. Minor keys report the minor tonic. */
export function estimateKey(notes: RawNote[]): { tonicPc: number; mode: Mode } {
  const hist = histogram(notes);
  let best = { tonicPc: 0, mode: 'major' as Mode };
  let bestR = -Infinity;
  for (let t = 0; t < 12; t++) {
    for (const mode of ['major', 'minor'] as const) {
      const r = fit(hist, t, mode);
      if (r > bestR) { bestR = r; best = { tonicPc: t, mode }; }
    }
  }
  return best;
}

/** For a known signature without a mode: its major key or its relative minor, whichever fits the notes better (ties: major). */
export function majorOrRelativeMinor(notes: RawNote[], majorTonicPc: number): { tonicPc: number; mode: Mode } {
  const hist = histogram(notes);
  const minorTonicPc = mod12(majorTonicPc + 9);
  return fit(hist, minorTonicPc, 'minor') > fit(hist, majorTonicPc, 'major')
    ? { tonicPc: minorTonicPc, mode: 'minor' }
    : { tonicPc: majorTonicPc, mode: 'major' };
}
