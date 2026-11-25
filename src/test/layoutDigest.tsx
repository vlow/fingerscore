import { createHash } from 'node:crypto';
import { render } from '@testing-library/react';
import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { layoutSheet } from '../render/sheetLayout';
import { Paper } from '../render/Paper';

/** Every number of the layout, rounded to 1e-6 so float noise cannot hide a change. */
export function layoutNumbers(doc: Doc) {
  const L = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    height: L.height,
    systems: L.systems.map(s => ({
      y: s.y, headerWidth: s.headerWidth, showTimeSig: s.showTimeSig, barNumber: s.barNumber,
      bars: s.bars.map(b => ({ bar: b.bar, x: r(b.x), width: r(b.width), events: b.events.map(e => [e.id, r(e.x), r(e.y)]) })),
    })),
    beams: L.beams, tuplets: L.tuplets,
  };
}

/** The drawn sheet's systems, as a digest of their markup (the digest changes if any attribute of any element does). */
export function layoutMarkup(doc: Doc) {
  const d = derive(doc, DEFAULT_PREFS);
  const { container } = render(<Paper doc={doc} derived={d} layout={layoutSheet(doc, d)} playingId={null} selectedId={null} />);
  const systems = Array.from(container.querySelectorAll('[data-testid="system"]'));
  const holders = systems.map(s => s.parentElement!);
  return {
    systems: systems.length,
    boxes: systems.map(s => [s.getAttribute('width'), s.getAttribute('height'), s.getAttribute('viewBox')]),
    digest: createHash('sha256').update(holders.map(h => h.outerHTML).join('\n')).digest('hex'),
  };
}
