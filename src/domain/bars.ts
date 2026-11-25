import { barCap } from './time';
import type { Doc } from './types';

/** The number printed on the sheet for a bar index: bars count from 1 at the first full bar, a pickup bar is bar 0. */
export function barLabelOf(doc: Doc, bar: number): number {
  const firstNumber = doc.score.length > 0 && doc.score[0].cap < barCap(doc.timeSig) ? 0 : 1;
  return bar + firstNumber;
}
