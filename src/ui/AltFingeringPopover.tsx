import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FingeringOption } from '../domain/fingerings';
import type { Instrument } from '../domain/instruments';
import { FingeringChart } from '../render/FingeringChart';
import s from './AltFingeringPopover.module.css';
import { POPOVER_HEIGHT, popoverWidth } from './popoverSize';

export { OPTION_PITCH, POPOVER_HEIGHT, POPOVER_PAD, popoverWidth } from './popoverSize';


/** Places a popover of the given size in document coordinates (left and top of its box). */
export type PlacePopover = (size: { width: number; height: number }) => { left: number; top: number };

/** The note whose fingerings are offered: its name, options, current choice and the app's own pick. */
export interface PopoverNote { name: string; options: FingeringOption[]; chosen: number | null | undefined; auto: number | null | undefined }

interface Props {
  /** bar: shown in the title on a sheet; a scale has none. */
  note: PopoverNote; bar?: number; kind: Instrument['kind']; chartStyle: 'compact' | 'full';
  /**
   * Either left/top in the coordinates of the positioned system or line it sits in (the sheet), or place: the popover
   * is rendered into the document body, outside any clipping scroll box, where place puts it (the Scales page).
   */
  left?: number; top?: number; place?: PlacePopover;
  anchor: HTMLElement | null;
  onPick(index: number): void;
  /** focusAnchor: move focus back to the pill that opened the popover. */
  onClose(focusAnchor: boolean): void;
}

const INTERACTIVE = 'a, button, input, select, textarea, [tabindex]';

/** Alternate fingerings for one note (SPEC §8.5). */
export default function AltFingeringPopover(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose, anchor, place } = p;
  const width = popoverWidth(p.note.options.length);

  // Placed popovers start from the estimated height and move once their real height is known, before the first paint.
  const [placed, setPlaced] = useState(() => place?.({ width, height: POPOVER_HEIGHT }) ?? null);
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    if (!place || height === 0 || height === POPOVER_HEIGHT) return;
    setPlaced(place({ width, height }));
  }, []);   // measured once, when the popover opens

  // Layout effects, not passive ones: they run in the commit, before the popover can be painted, so from the moment it is
  // seen the focus is in it and Escape and an outside click close it. A passive effect runs a moment later (on a slow
  // machine tens of milliseconds), and a key pressed in between would reach nothing.
  // `closing` is set when the popover has asked to be closed: an effect that runs again after that (React's development
  // mode runs every effect twice, the second time late) must not take the focus back from the pill.
  const closing = useRef(false);
  useLayoutEffect(() => {
    if (closing.current) return;
    ref.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, []);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closing.current = true; onClose(true); }
    };
    const onDown = (e: PointerEvent | MouseEvent) => {
      const t = e.target as Node | null;
      if (!t || ref.current?.contains(t) || anchor?.contains(t)) return;
      const interactive = t instanceof Element && t.closest(INTERACTIVE) !== null;
      // A click on plain content returns the focus to the pill; keep the browser from moving it to the body after.
      if (!interactive) e.preventDefault();
      closing.current = true;
      onClose(!interactive);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose, anchor]);

  const { note } = p;
  const where = p.bar === undefined ? '' : `, bar ${p.bar}`;
  const box = (
    <div ref={ref} role="dialog" aria-label={`Alternate fingerings for ${note.name}${where}`} className={s.pop}
      data-print-hide="" style={{ left: placed?.left ?? p.left, top: placed?.top ?? p.top, width }}>
      <div className={s.title}>
        <span>{note.name}{p.bar === undefined ? '' : ` · bar ${p.bar}`}</span> <span className={s.hint}>— pick a fingering</span>
      </div>
      <div className={s.options}>
        {note.options.map((o, k) => (
          <button key={k} type="button" className={s.option} aria-pressed={k === note.chosen} onClick={() => p.onPick(k)}>
            <svg className={s.chart} width={76} height={96} viewBox="0 0 76 96" aria-hidden="true">
              <FingeringChart kind={p.kind} option={o} style={p.chartStyle} x={40} y={4} />
            </svg>
            <span className={s.name}>{o.n}</span>
            {k === note.auto && <span className={s.auto}>auto</span>}
          </button>
        ))}
      </div>
    </div>
  );
  return placed ? createPortal(box, document.body) : box;
}
