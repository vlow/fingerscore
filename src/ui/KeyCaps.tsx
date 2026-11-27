import { Fragment } from 'react';
import { keyName, type Hint, type Part } from './shortcuts';
import s from './KeyCaps.module.css';

type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, string> = { sm: s.sm, md: s.md, lg: s.lg };

/** React keys from the items' own text; a repeated text gets its count (the "or" between three combinations). */
function keyed<T>(items: T[], text: (t: T) => string): { item: T; key: string }[] {
  const seen = new Map<string, number>();
  return items.map(item => {
    const t = text(item);
    const n = (seen.get(t) ?? 0) + 1;
    seen.set(t, n);
    return { item, key: `${t}#${n}` };
  });
}

/** One key cap. */
export function Kbd({ k, size = 'md', apple }: { k: string; size?: Size; apple: boolean }): JSX.Element {
  return <kbd className={`${s.kbd} ${SIZE[size]}`}>{keyName(k, apple)}</kbd>;
}

/** The keys of a shortcut row: caps, "+" between keys pressed together off Apple, and the words between combinations. */
export function KeyCaps({ parts, apple, size = 'md' }: { parts: Part[]; apple: boolean; size?: Size }): JSX.Element {
  return (
    <span className={s.caps}>
      {keyed(parts, p => (typeof p === 'string' ? p : p.keys.join('+'))).map(({ item: p, key }) => {
        if (typeof p === 'string') return <span key={key} className={s.sep}>{p}</span>;
        const combo = (
          <kbd className={s.combo}>
            {p.keys.map((x, j) => (
              <Fragment key={x}>
                {j > 0 && !apple && <span className={s.plus}>+</span>}
                <Kbd k={x} size={size} apple={apple} />
              </Fragment>
            ))}
          </kbd>
        );
        if (p.cap === undefined) return <Fragment key={key}>{combo}</Fragment>;
        return <span key={key} className={s.withCap}>{combo}<span className={s.cap}>{p.cap}</span></span>;
      })}
    </span>
  );
}

/** The hint line under the mode switch: small key caps and words. */
export function KeyHints({ hints, apple }: { hints: Hint[]; apple: boolean }): JSX.Element {
  return (
    <span className={s.hints}>
      {keyed(hints, h => ('key' in h ? `k:${h.key}` : h.text)).map(({ item: h, key }) =>
        'key' in h ? <Kbd key={key} k={h.key} size="sm" apple={apple} /> : <span key={key}>{h.text}</span>)}
    </span>
  );
}
