import { useEffect, useRef } from 'react';
import type { DerivedEvent } from '../domain/derive';
import type { Instrument } from '../domain/instruments';
import { FingeringChart } from '../render/FingeringChart';
import s from './AltFingeringPopover.module.css';

/** Width of one option button plus the gap; the popover adds its padding. */
export const OPTION_PITCH = 84;
export const POPOVER_PAD = 24;
export const popoverWidth = (options: number) => options * OPTION_PITCH + POPOVER_PAD;

interface Props {
  ev: DerivedEvent; bar: number; kind: Instrument['kind']; chartStyle: 'compact' | 'full';
  left: number; top: number;
  anchor: HTMLElement | null;
  onPick(index: number): void;
  /** focusAnchor: move focus back to the pill that opened the popover. */
  onClose(focusAnchor: boolean): void;
}

const INTERACTIVE = 'a, button, input, select, textarea, [tabindex]';

/** Alternate fingerings for one note (SPEC §8.5), positioned in system coordinates. */
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
      onClose(!interactive);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose, anchor]);

  const { ev } = p;
  return (
    <div ref={ref} role="dialog" aria-label={`Alternate fingerings for ${ev.spelled.name}, bar ${p.bar}`} className={s.pop}
      data-print-hide="" style={{ left: p.left, top: p.top, width: popoverWidth(ev.options.length) }}>
      <div className={s.title}>
        <span>{ev.spelled.name} · bar {p.bar}</span> <span className={s.hint}>— pick a fingering</span>
      </div>
      <div className={s.options}>
        {ev.options.map((o, k) => (
          <button key={k} type="button" className={s.option} aria-pressed={k === ev.chosen} onClick={() => p.onPick(k)}>
            <svg className={s.chart} width={76} height={96} viewBox="0 0 76 96" aria-hidden="true">
              <FingeringChart kind={p.kind} option={o} style={p.chartStyle} x={40} y={4} />
            </svg>
            <span className={s.name}>{o.n}</span>
            {k === ev.auto && <span className={s.auto}>auto</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
