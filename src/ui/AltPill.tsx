import type { MouseEvent } from 'react';
import { PILL_WIDTH } from '../render/pillSpread';
import s from './AltPill.module.css';

/**
 * The pill under a chart with alternate fingerings (SPEC §8.5), on a sheet and on the Scales page: "⇅ {count}", teal when
 * the player changed that note, dark while its popover is open. Positioned absolutely at left/top (the pill's top-left)
 * in the coordinates of the system or scale line. onClick gets the event, so the caller can keep the pill for focus return.
 */
export default function AltPill(p: {
  note: string; count: number; overridden: boolean; open: boolean; left: number; top: number;
  onClick(e: MouseEvent<HTMLButtonElement>): void;
}) {
  const tone = p.open ? s.open : p.overridden ? s.changed : '';
  return (
    <button type="button" className={`${s.pill} ${tone}`} data-print-hide="" style={{ left: p.left, top: p.top }}
      {...(p.overridden ? { 'data-overridden': 'true' } : {})}
      aria-haspopup="dialog" aria-expanded={p.open} aria-label={`⇅ ${p.count} alternate fingerings for ${p.note}`} onClick={p.onClick}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
      </svg>
      {p.count}
    </button>
  );
}

/** Half the pill's width: callers centre it under a chart with left = x - PILL_HALF. */
export const PILL_HALF = PILL_WIDTH / 2;
