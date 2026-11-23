import { useCallback, useRef, useState } from 'react';
import type { Instrument } from '../../domain/instruments';
import { SHEET } from '../../render/layout';
import type { ScaleChartSlot } from '../../render/ScaleStaff';
import AltFingeringPopover, { popoverWidth } from '../../ui/AltFingeringPopover';
import s from '../Scales.module.css';

/** Height the popover needs above a chart when it opens upwards (a row of mini charts with names). */
const POPOVER_H = 148;

/**
 * The pill under each chart with alternate fingerings and its popover, as on a sheet (design 4.3). onPick receives the
 * note index and the option index, or null when the player picked the automatic choice.
 */
export function useScaleAlternatives(kind: Instrument['kind'], chartStyle: 'compact' | 'full', onPick: (index: number, option: number | null) => void) {
  const [openAlt, setOpenAlt] = useState<number | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const closeAlt = useCallback((focusAnchor: boolean) => {
    if (focusAnchor) anchorRef.current?.focus();
    setOpenAlt(null);
  }, []);

  const renderUnderChart: ScaleChartSlot = (note, at) => {
    const open = openAlt === note.index;
    const width = popoverWidth(note.options.length);
    const tone = open ? s.pillOpen : note.overridden ? s.pillChanged : '';
    // Below the pill; on the last line, above the chart when below would leave the paper.
    const below = at.y + 22;
    const top = at.lastLine && below + POPOVER_H > at.height ? at.chartTop - POPOVER_H : below;
    return (
      <>
        <button type="button" className={`${s.pill} ${tone}`} data-print-hide="" style={{ left: at.x - 13, top: at.y }}
          {...(note.overridden ? { 'data-overridden': 'true' } : {})}
          aria-haspopup="dialog" aria-expanded={open} aria-label={`⇅ ${note.options.length} alternate fingerings for ${note.name}`}
          onClick={e => {
            if (open) { closeAlt(false); return; }
            anchorRef.current = e.currentTarget;
            setOpenAlt(note.index);
          }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
          </svg>
          {note.options.length}
        </button>
        {open && (
          <AltFingeringPopover note={note} kind={kind} chartStyle={chartStyle}
            left={Math.round(Math.max(0, Math.min(SHEET.systemWidth - width, at.x - width / 2)))} top={top}
            anchor={anchorRef.current}
            onPick={k => { onPick(note.index, k === note.auto ? null : k); closeAlt(true); }}
            onClose={closeAlt} />
        )}
      </>
    );
  };

  return { closeAlt, renderUnderChart };
}
