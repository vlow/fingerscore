import { useCallback, useRef, useState } from 'react';
import type { Instrument } from '../../domain/instruments';
import type { ScaleChartSlot } from '../../render/ScaleStaff';
import AltFingeringPopover, { type PlacePopover } from '../../ui/AltFingeringPopover';
import AltPill, { PILL_HALF } from '../../ui/AltPill';

const GAP = 6;          // between the pill (or the line) and the popover
const MARGIN = 8;       // kept free at the viewport's edges

/**
 * Where a scale's popover goes, in document coordinates: below the pill, over whatever lies below (it is an overlay and
 * may run past the paper). Above the pill's line, clear of the staff and the note, only when the room below the pill in
 * the viewport is smaller than the popover and the room above the line is larger. Horizontally inside the viewport.
 */
export function placeBelowPill(pill: HTMLElement): PlacePopover {
  return ({ width, height }) => {
    const p = pill.getBoundingClientRect();
    const line = (pill.closest('[data-line-box]') ?? pill).getBoundingClientRect();
    const below = window.innerHeight - p.bottom - GAP;
    const above = line.top - GAP;
    const top = below < height && above > below ? line.top - GAP - height : p.bottom + GAP;
    const centred = p.left + p.width / 2 - width / 2;
    const left = Math.max(MARGIN, Math.min(window.innerWidth - MARGIN - width, centred));
    return { left: Math.round(left + window.scrollX), top: Math.round(top + window.scrollY) };
  };
}

/**
 * The pill under each chart with alternate fingerings and its popover, as on a sheet (design 4.3). onPick receives the
 * note index and the option index, or null when the player picked the automatic choice.
 */
export function useScaleAlternatives(
  kind: Instrument['kind'], chartStyle: 'compact' | 'full', onPick: (index: number, option: number | null) => void,
  onShowOnInstrument?: (index: number) => void,
) {
  const [openAlt, setOpenAlt] = useState<number | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const closeAlt = useCallback((focusAnchor: boolean) => {
    if (focusAnchor) anchorRef.current?.focus();
    setOpenAlt(null);
  }, []);

  const renderUnderChart: ScaleChartSlot = (note, at) => {
    const open = openAlt === note.index;
    return (
      <>
        <AltPill note={note.name} count={note.options.length} overridden={note.overridden} open={open} left={at.x - PILL_HALF} top={at.y}
          onClick={e => {
            if (open) { closeAlt(false); return; }
            anchorRef.current = e.currentTarget;
            setOpenAlt(note.index);
          }} />
        {open && anchorRef.current && (
          <AltFingeringPopover note={note} kind={kind} chartStyle={chartStyle} place={placeBelowPill(anchorRef.current)}
            anchor={anchorRef.current}
            onPick={k => { onPick(note.index, k === note.auto ? null : k); closeAlt(true); }}
            onShowOnInstrument={onShowOnInstrument && (() => { closeAlt(false); onShowOnInstrument(note.index); })}
            onClose={closeAlt} />
        )}
      </>
    );
  };

  return { closeAlt, renderUnderChart };
}
