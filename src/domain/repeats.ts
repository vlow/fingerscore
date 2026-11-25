import type { Doc } from './types';

/**
 * Bar indices in play order from bar `from` (a section starts there) up to the bar where the jump fires,
 * following repeats and endings.
 * A section starts at a bar with a start-repeat mark, at bar 0, or after a finished repeat.
 * Each end-repeat mark jumps back to its section start once; every jump starts the next pass.
 * A first-ending bar plays only on pass 1, a second-ending bar only on passes 1-2, so
 * `A | 1.(re) | 2.(re) | 3.` plays A 1. A 2. A 3. (ending 3 has no volta in the doc).
 * The jump (bar `jumpBar`, or -1 for none) fires at the end of its bar once that bar's repeat is played out;
 * `fired` says whether it did, and the order then ends with the jump bar.
 * `repeats` lists each repeat taken as the bar it ends at and the bar it returns to.
 * The order is capped at 4 x the bar count as a safety net.
 */
export function walkRepeats(doc: Doc, jumpBar: number, from = 0): { order: number[]; fired: boolean; repeats: { end: number; start: number }[] } {
  const bars = doc.score;
  const cap = 4 * bars.length;
  const order: number[] = [];
  const taken = new Set<number>();
  const repeats: { end: number; start: number }[] = [];
  let start = from;
  let pass = 1;
  let i = from;
  while (i < bars.length && order.length < cap) {
    const bar = bars[i];
    if ((bar.volta === '1' && pass > 1) || (bar.volta === '2' && pass > 2)) { i++; continue; }
    if (bar.rs && i !== start) { start = i; pass = 1; }
    order.push(i);
    if (bar.re && !taken.has(i)) {
      taken.add(i);
      repeats.push({ end: i, start });
      pass += 1;
      i = start;
      continue;
    }
    if (i === jumpBar) return { order, fired: true, repeats };
    const endsEndings = pass > 1 && bar.volta !== '' && (bars[i + 1]?.volta ?? '') === '';
    if (bar.re || endsEndings) { start = i + 1; pass = 1; }
    i++;
  }
  return { order, fired: false, repeats };
}
