import { useCallback, useEffect, useRef, useState } from 'react';
import type { DerivedEvent } from '../../domain/derive';
import type { Instrument } from '../../domain/instruments';
import type { Doc } from '../../domain/types';
import { SHEET } from '../../render/layout';
import { useApp } from '../../state/store';
import { popoverWidth } from '../../ui/popoverSize';
import { useAltPopoverLoad } from './useAltPopoverLoad';
import { hasPill } from '../../render/pillSpread';
import AltPill, { PILL_HALF } from '../../ui/AltPill';

/** The pill under a chart with alternate fingerings, and its popover. */
export function useAltFingering(doc: Doc, firstBar: number, kind: Instrument['kind']) {
  const setFingering = useApp(st => st.setFingering);

  // Alternate fingerings: one popover at a time, anchored to its pill.
  const [openAlt, setOpenAlt] = useState<string | null>(null);
  // The popover's code loads at the first click on a pill; the popover opens for the pill clicked once it has arrived.
  const pending = useRef<string | null>(null);
  const { value: Popover, failed, request } = useAltPopoverLoad(() => setOpenAlt(pending.current));
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const closeAlt = useCallback((focusAnchor: boolean) => {
    if (focusAnchor) anchorRef.current?.focus();
    setOpenAlt(null);
  }, []);
  useEffect(() => setOpenAlt(null), [doc.shift, doc.inst]);

  const renderUnderChart = (ev: DerivedEvent, x: number, y: number, _system: number, lastSystem: boolean, pillX: number) => {
    if (!hasPill(ev)) return null;
    const open = openAlt === ev.id;
    const width = popoverWidth(ev.options.length);
    return (
      <>
        <AltPill note={ev.spelled.name} count={ev.options.length} overridden={ev.overridden} open={open} left={pillX - PILL_HALF} top={y}
          onClick={e => {
            if (open) { closeAlt(false); return; }
            anchorRef.current = e.currentTarget;
            pending.current = ev.id;
            request();
          }} />
        {open && Popover && (
          <Popover note={{ name: ev.spelled.name, options: ev.options, chosen: ev.chosen, auto: ev.auto }} bar={ev.bar + firstBar} kind={kind} chartStyle={doc.chartStyle}
            left={Math.round(Math.max(0, Math.min(SHEET.systemWidth - width, x - width / 2)))}
            top={lastSystem ? y - SHEET.altButtonDy - 148 : y - SHEET.altButtonDy + 112}
            anchor={anchorRef.current}
            onPick={k => { setFingering(ev.id, k === ev.auto ? null : k); closeAlt(true); }}
            onClose={closeAlt} />
        )}
      </>
    );
  };

  return { openAlt, closeAlt, renderUnderChart, altLoadFailed: failed };
}
