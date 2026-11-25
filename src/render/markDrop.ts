import type { Derived } from '../domain/derive';
import type { Doc } from '../domain/types';
import { drawsBands, DROP_MARGIN, MARK_DROP, type SheetLayout } from './layout';
import { DOT, dotY, isDotted } from './NoteView';
import { systemPlacement } from './placed';
import { tieArc, type tieSegments } from './SystemView';
import { beamGeometry, beamInk, eventInk, placeTuplet } from './TupletMark';

/**
 * MARK_DROP when the lowered row is free, else 0. The row is free when the sheet draws no chord symbol and no lyric
 * (the renderer's own test) and nothing the notes draw reaches into the row plus a margin: heads, accidentals, ledger
 * lines, stems, flags, beams, dots, tie arcs and triplet marks. Each extent comes from the function that places that
 * element. One element in the way anywhere keeps the top row for the whole sheet. Not called for a sheet without marks.
 */
export function sheetMarkDrop(doc: Doc, derived: Derived, layout: SheetLayout, show: Doc['show'], ties: ReturnType<typeof tieSegments>): number {
  if (drawsBands(derived.events, show)) return 0;
  // In the system's own coordinates (without the row): the lowered row and its margin end at this y.
  const limit = MARK_DROP + DROP_MARGIN;
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
  return top > limit ? MARK_DROP : 0;
}
