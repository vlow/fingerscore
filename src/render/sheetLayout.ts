import type { Derived } from '../domain/derive';
import type { Doc } from '../domain/types';
import { sheetInkTop } from './ink';
import { bandsUsed, layoutSystems, stackOf, type SheetLayout } from './layout';

/** Bands that the editing mode draws although their Show switch is off or the sheet has no content for them (display only, not printed). */
export interface BandForce { lyrics?: boolean; chords?: boolean }

/**
 * The layout of a sheet. The stack of bands above the staff is decided once for the whole sheet (design 5.10): the bands
 * the sheet uses, and the headroom for the highest thing its notes draw. `force` names the bands the editing mode
 * stacks as well; the PDF, print and play mode do not pass it.
 */
export function layoutSheet(doc: Doc, d: Derived, force: BandForce = {}): SheetLayout {
  const base = layoutSystems(doc, d);
  const stack = stackOf(bandsUsed(doc, d.events, force), sheetInkTop(doc, d, base), base.systems.some(s => s.barNumber !== null));
  const systems = base.systems.map(s => ({ ...s, y: s.index * stack.systemHeight, height: stack.systemHeight, stack }));
  return { ...base, systems, height: systems.length * stack.systemHeight, systemHeight: stack.systemHeight, stack };
}
