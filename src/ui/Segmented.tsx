import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import s from './Segmented.module.css';

export interface SegmentedOption<T extends string | number> {
  value: T;
  /** Visible content of the option. */
  content: ReactNode;
  /** Accessible name when the content alone does not say it. */
  name?: string;
}

/**
 * A choice of one among a few options, after the prototype's bordered buttons (Scales.dc.html). A radio group:
 * one tab stop on the chosen option, arrow keys move the choice and the focus.
 * size: 'wide' fills an even grid (44px), 'small' sits inline (36px), 'chip' is a two-line key chip (52px).
 */
export function Segmented<T extends string | number>(p: {
  label: string; value: T; options: SegmentedOption<T>[]; onChange(v: T): void; size?: 'wide' | 'small' | 'chip';
}): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const size = p.size ?? 'wide';
  const at = p.options.findIndex(o => o.value === p.value);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const n = p.options.length;
    const k = (Math.max(at, 0) + step + n) % n;
    p.onChange(p.options[k].value);
    refs.current[k]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={p.label} className={`${s.group} ${s[size]}`}
      style={size === 'wide' ? { gridTemplateColumns: `repeat(${p.options.length}, minmax(0, 1fr))` } : undefined} onKeyDown={onKey}>
      {p.options.map((o, k) => {
        const on = k === at || (at < 0 && k === 0);
        return (
          <button key={String(o.value)} ref={el => { refs.current[k] = el; }} type="button" role="radio" className={s.option}
            aria-checked={k === at} aria-label={o.name} tabIndex={on ? 0 : -1} onClick={() => p.onChange(o.value)}>
            {o.content}
          </button>
        );
      })}
    </div>
  );
}
