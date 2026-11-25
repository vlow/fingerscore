import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import { mkDoc, type EvSpec } from '../test/helpers';
import { layoutSheet } from './sheetLayout';
import { Paper } from './Paper';

/** `bars` bars of 4/4, each 24 triplet sixteenths: eight groups of three. */
function tripletSixteenths(bars: number) {
  const ev: EvSpec[] = Array.from({ length: 24 }, (_, i) => [60 + (i % 7), 2]);
  return mkDoc(Array.from({ length: bars }, () => ({ ev })));
}

/** Milliseconds for layoutSheet and static markup of the whole Paper; the best of `runs`. */
function drawTime(bars: number, runs = 2): number {
  const doc = tripletSixteenths(bars);
  const derived = derive(doc, DEFAULT_PREFS);
  let best = Infinity;
  for (let k = 0; k < runs; k++) {
    const t0 = performance.now();
    const layout = layoutSheet(doc, derived);
    renderToStaticMarkup(
      <Paper doc={doc} derived={derived} layout={layout} playingId={null}
        selectedId={null} onSelect={() => {}} onTitle={() => {}} onSubtitle={() => {}} />,
    );
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe('drawing time', () => {
  it('300 bars of triplet sixteenths take less than twice the time of 150 bars, plus 250 ms', () => {
    drawTime(20, 1);   // warm up
    const t150 = drawTime(150);
    const t300 = drawTime(300);
    expect(t300, `150 bars ${t150.toFixed(0)} ms, 300 bars ${t300.toFixed(0)} ms`).toBeLessThan(2 * t150 + 250);
  }, 60000);
});
