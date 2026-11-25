import type { Derived } from '../domain/derive';
import type { Doc } from '../domain/types';
import type { BarsLayout } from './layout';
import { DOT, dotY, isDotted } from './NoteView';
import { systemPlacement } from './placed';
import { tieArc, tieSegments } from './SystemView';
import { beamGeometry, beamInk, eventInk, placeTuplet } from './TupletMark';

/**
 * The highest y (smallest number) of anything the notes of the sheet draw, in the staff frame (the top staff line at
 * `SHEET.staffTop`): heads, accidentals, ledger lines, stems, flags, beams, dots, tie arcs and triplet marks, in every
 * system. Infinity for a sheet without notes. Each extent comes from the function that places that element, so the
 * measure is the renderer's own geometry. The stack's headroom is made from it.
 */
export function sheetInkTop(doc: Doc, derived: Derived, layout: BarsLayout): number {
  const ties = tieSegments(derived, layout);
  let top = Infinity;
  for (const system of layout.systems) {
    const { placed, byId, groups, beamOf } = systemPlacement(derived, system, layout.beams);
    const geoOf = (id: string) => {
      const g = beamOf.get(id);
      return g && beamGeometry(g.ids.map(i => byId.get(i)!));
    };
    for (const n of placed) {
      top = Math.min(top, ...eventInk(n, geoOf(n.ev.id)).map(b => b.y1));
      if (!n.ev.rest && isDotted(n.ev)) top = Math.min(top, dotY(n.ev, n.y) - DOT.r);
    }
    for (const g of groups) {
      const notes = g.ids.map(i => byId.get(i)!);
      top = Math.min(top, beamInk(notes, beamGeometry(notes)).y1);
    }
    for (const t of ties[system.index] ?? []) top = Math.min(top, tieArc(t).top);
    for (const bar of system.bars) {
      const marks = layout.tuplets[bar.bar] ?? [];
      const barIds = bar.events.map(e => e.id);
      for (const m of marks) {
        const volta = doc.score[m.bar].volta !== '';
        top = Math.min(top, placeTuplet({ mark: m, byId, beamOf, marks, barIds, volta }).chosen.y1);
      }
    }
  }
  return top;
}
