import { useCallback, useEffect, useRef, useState } from 'react';
import type { DerivedEvent } from '../../domain/derive';
import type { Instrument } from '../../domain/instruments';
import type { Doc } from '../../domain/types';
import { SHEET } from '../../render/layout';
import { useApp } from '../../state/store';
import AltFingeringPopover, { popoverWidth } from '../../ui/AltFingeringPopover';
import s from '../SheetPage.module.css';

/** The pill under a chart with alternate fingerings, and its popover. */
export function useAltFingering(doc: Doc, firstBar: number, kind: Instrument['kind']) {
  const setFingering = useApp(st => st.setFingering);

  // Alternate fingerings: one popover at a time, anchored to its pill.
  const [openAlt, setOpenAlt] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const closeAlt = useCallback((focusAnchor: boolean) => {
    if (focusAnchor) anchorRef.current?.focus();
    setOpenAlt(null);
  }, []);
  useEffect(() => setOpenAlt(null), [doc.shift, doc.inst]);

  const renderUnderChart = (ev: DerivedEvent, x: number, y: number, _system: number, lastSystem: boolean) => {
    if (ev.options.length < 2) return null;
    const open = openAlt === ev.id;
    const width = popoverWidth(ev.options.length);
    const tone = open ? s.pillOpen : ev.overridden ? s.pillChanged : '';
    return (
      <>
        <button type="button" className={`${s.pill} ${tone}`} data-print-hide="" style={{ left: x - 13, top: y }}
          aria-haspopup="dialog" aria-expanded={open} aria-label={`⇅ ${ev.options.length} alternate fingerings for ${ev.spelled.name}`}
          onClick={e => {
            if (open) { closeAlt(false); return; }
            anchorRef.current = e.currentTarget;
            setOpenAlt(ev.id);
          }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
          </svg>
          {ev.options.length}
        </button>
        {open && (
          <AltFingeringPopover note={{ name: ev.spelled.name, options: ev.options, chosen: ev.chosen, auto: ev.auto }} bar={ev.bar + firstBar} kind={kind} chartStyle={doc.chartStyle}
            left={Math.round(Math.max(0, Math.min(SHEET.systemWidth - width, x - width / 2)))}
            top={lastSystem ? SHEET.chartY - 148 : SHEET.chartY + 112}
            anchor={anchorRef.current}
            onPick={k => { setFingering(ev.id, k === ev.auto ? null : k); closeAlt(true); }}
            onClose={closeAlt} />
        )}
      </>
    );
  };

  return { openAlt, closeAlt, renderUnderChart };
}
