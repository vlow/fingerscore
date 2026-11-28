import { LAYOUT, SATS, SHAPE, hasSatellites } from '../../domain/fingerings';
import type { Instrument } from '../../domain/instruments';
import { usePalette } from '../palette';
import { KeyTarget, type KeyEvents } from './KeyTarget';

type Kind = Instrument['kind'];
interface Spot { id: string; x: number; y: number; w: number; h: number }

/**
 * Every element of a full-style chart of this kind, in chart units: the column ("h0", "h1", …) and the satellite keys.
 * Positions follow FingeringChart: the sax's octave key is a pill, a recorder's double hole two circles side by side.
 */
function spots(kind: Kind): Spot[] {
  const column = LAYOUT[kind].map(([dx, dy, sz, dbl], i): Spot => {
    if (kind === 'sax' && i === 0) return { id: 'h0', x: dx, y: dy + 3, w: 8, h: 4 };
    if (dbl) return { id: `h${i}`, x: dx + 0.5, y: dy + 3.5, w: 13, h: 8 };
    return { id: `h${i}`, x: dx, y: dy + sz / 2, w: sz, h: sz };
  });
  if (!hasSatellites(kind)) return column;
  const table = SATS[kind as 'sax' | 'cl' | 'fl'];
  return [...column, ...Object.entries(table).map(([id, [x, y, cluster]]): Spot => {
    const [w, h] = SHAPE[cluster];
    return { id, x, y, w, h };
  })];
}

/**
 * Pointer areas over a full-style FingeringChart of this kind drawn at the same origin and scale, plus an accent ring
 * on the shown key. The chart itself stays untouched.
 */
export function ChartTargets(p: { kind: Kind; names: Record<string, string>; shown: string | null; events: KeyEvents }) {
  const pal = usePalette();
  return (
    <g data-chart-keys="">
      {spots(p.kind).map(s => (
        <KeyTarget key={s.id} id={s.id} label={p.names[s.id] ?? s.id} events={p.events}>
          {p.shown === s.id && (
            <rect x={s.x - s.w / 2 - 1.4} y={s.y - s.h / 2 - 1.4} width={s.w + 2.8} height={s.h + 2.8}
              rx={Math.min(s.w, s.h) / 2 + 1.4} fill="none" stroke={pal.chord} strokeWidth={0.9} />
          )}
          <rect x={s.x - s.w / 2 - 1} y={s.y - s.h / 2 - 1} width={s.w + 2} height={s.h + 2} fill="transparent" />
        </KeyTarget>
      ))}
    </g>
  );
}

/** Every chart id of this kind, for checks. */
export const chartIds = (kind: Kind): string[] => spots(kind).map(s => s.id);
