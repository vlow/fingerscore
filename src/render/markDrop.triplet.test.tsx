import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import { mkDoc } from '../test/helpers';
import { DROP_MARGIN, layoutSheet, MARK_DROP } from './layout';
import { sheetMarkDrop } from './markDrop';
import { tieSegments } from './SystemView';

// The boundary of the decision: a triplet mark whose box ends at 48 (the margin edge) is in the way, one at 49 is not.
// (A real mark in the row is in markDrop.test.tsx.)
const reach = vi.hoisted(() => ({ y1: 100 }));
vi.mock('./TupletMark', async importActual => {
  const actual = await importActual<typeof import('./TupletMark')>();
  return { ...actual, placeTuplet: (p: Parameters<typeof actual.placeTuplet>[0]) => ({ ...actual.placeTuplet(p), chosen: { ...actual.placeTuplet(p).chosen, y1: reach.y1 } }) };
});

const dropOf = () => {
  const doc = mkDoc([{ ev: [[60, 4], [62, 4], [60, 4], [60, 12], [60, 12], [60, 12]] }, { ev: [[60, 48]], jump: 'dc' }]);
  const d = derive(doc, DEFAULT_PREFS);
  const layout = layoutSheet(doc, d);
  expect(layout.tuplets[0]).toHaveLength(1);
  return sheetMarkDrop(doc, d, layout, doc.show, tieSegments(d, layout));
};

describe('a triplet mark in the way', () => {
  it('keeps the top row when its box reaches the lowered row plus margin, and lowers when it stays below', () => {
    reach.y1 = MARK_DROP + DROP_MARGIN;       // 48: touches the margin edge
    expect(dropOf()).toBe(0);
    reach.y1 = MARK_DROP + DROP_MARGIN + 1;
    expect(dropOf()).toBe(MARK_DROP);
  });
});
