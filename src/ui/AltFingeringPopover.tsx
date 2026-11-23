import { useEffect, useRef } from 'react';
import type { FingeringOption } from '../domain/fingerings';
import type { Instrument } from '../domain/instruments';
import { FingeringChart } from '../render/FingeringChart';
import s from './AltFingeringPopover.module.css';

/** Width of one option button plus the gap; the popover adds its padding. */
export const OPTION_PITCH = 84;
export const POPOVER_PAD = 24;
export const popoverWidth = (options: number) => options * OPTION_PITCH + POPOVER_PAD;

/** The note whose fingerings are offered: its name, options, current choice and the app's own pick. */
export interface PopoverNote { name: string; options: FingeringOption[]; chosen: number | null | undefined; auto: number | null | undefined }

interface Props {
  /** bar: shown in the title on a sheet; a scale has none. */
  note: PopoverNote; bar?: number; kind: Instrument['kind']; chartStyle: 'compact' | 'full';
  left: number; top: number;
  anchor: HTMLElement | null;
  onPick(index: number): void;
  /** focusAnchor: move focus back to the pill that opened the popover. */
  onClose(focusAnchor: boolean): void;
}

const INTERACTIVE = 'a, button, input, select, textarea, [tabindex]';

/** Alternate fingerings for one note (SPEC §8.5), positioned in the coordinates of the system or scale line. */
export default function AltFingeringPopover(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose, anchor } = p;

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(true); }
    };
    const onDown = (e: PointerEvent | MouseEvent) => {
      const t = e.target as Node | null;
      if (!t || ref.current?.contains(t) || anchor?.contains(t)) return;
      const interactive = t instanceof Element && t.closest(INTERACTIVE) !== null;
      // A click on plain content returns the focus to the pill; keep the browser from moving it to the body after.
      if (!interactive) e.preventDefault();
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
  return (
    <div ref={ref} role="dialog" aria-label={`Alternate fingerings for ${note.name}${where}`} className={s.pop}
      data-print-hide="" style={{ left: p.left, top: p.top, width: popoverWidth(note.options.length) }}>
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
}
