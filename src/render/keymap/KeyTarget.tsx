import type { ReactNode } from 'react';

export interface KeyEvents {
  /** The key under the pointer or focus, or null when it leaves. */
  onActive: (id: string | null) => void;
  /** A click: pin the key, or unpin it. */
  onPick: (id: string) => void;
}

/**
 * One key, in the chart or on the instrument, that names itself and reacts to the pointer. It is no control: the
 * chart's keys sit closer together than any target can be large, so the keyboard and screen readers reach every key
 * through the key lists beside the drawing instead (design 4.1), which do the same.
 */
export function KeyTarget(p: { id: string; label: string; events: KeyEvents; children: ReactNode }) {
  const { id, events } = p;
  return (
    <g data-key={id} style={{ cursor: 'pointer' }}
      onMouseEnter={() => events.onActive(id)} onMouseLeave={() => events.onActive(null)} onClick={() => events.onPick(id)}>
      <title>{p.label}</title>
      {p.children}
    </g>
  );
}
