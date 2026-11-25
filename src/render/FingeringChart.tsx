import { LAYOUT, SATS, SHAPE, type FingeringOption } from '../domain/fingerings';
import type { Instrument } from '../domain/instruments';
import { usePalette, type Palette } from './palette';


type HoleState = 'closed' | 'open' | 'half';
const stateOf = (v: number): HoleState => (v === 1 ? 'closed' : v === 0.5 ? 'half' : 'open');

function Disc(p: { cx: number; cy: number; d: number; state: HoleState }) {
  const pal = usePalette();
  const r = p.d / 2 - 0.65; // 1.3px stroke sits inside the nominal size
  return (
    <>
      <circle cx={p.cx} cy={p.cy} r={r} fill={p.state === 'closed' ? pal.ink : pal.paper} stroke={pal.ink} strokeWidth={1.3} />
      {p.state === 'half' && <path d={`M${p.cx} ${p.cy - r}A${r} ${r} 0 0 0 ${p.cx} ${p.cy + r}Z`} fill={pal.ink} />}
    </>
  );
}

type Kind = Instrument['kind'];

function Holes(p: { kind: Kind; option: FingeringOption; full: boolean }) {
  const pal = usePalette();
  return (
    <>
      {LAYOUT[p.kind].map((h, i) => {
        const [dx, dy, sz, dbl] = h;
        const v = p.option.h[i] ?? 0;
        if (i === 0 && p.kind === 'sax' && p.full) {
          // octave key as a pill in the full key map
          return (
            <rect key={i} data-hole={stateOf(v)} x={dx - 4} y={dy + 1} width={8} height={4} rx={2}
              fill={v === 1 ? pal.ink : pal.paper} stroke={pal.ink} strokeWidth={1.3} />
          );
        }
        if (dbl) {
          // double hole: big + small circle; the big one fills from half, the small one only when closed
          return (
            <g key={i} data-hole={stateOf(v)} data-double="">
              <Disc cx={dx - 5.5 + 3.5} cy={dy + 3.5} d={7} state={v >= 0.5 ? 'closed' : 'open'} />
              <Disc cx={dx + 2 + 2.25} cy={dy + 1.5 + 2.25} d={4.5} state={v === 1 ? 'closed' : 'open'} />
            </g>
          );
        }
        return (
          <g key={i} data-hole={stateOf(v)}>
            <Disc cx={dx} cy={dy + sz / 2} d={sz} state={stateOf(v)} />
          </g>
        );
      })}
    </>
  );
}

function Satellites(p: { kind: Kind; option: FingeringOption; full: boolean }) {
  const pal = usePalette();
  const table = p.kind === 'sax' || p.kind === 'cl' || p.kind === 'fl' ? SATS[p.kind] : undefined;
  if (!table) return null;
  const pressed = new Set(p.option.x);
  const clusters = new Set(p.option.x.map(id => table[id]?.[2]));
  return (
    <>
      {Object.entries(table).map(([id, [dx, dy, cluster]]) => {
        const on = pressed.has(id);
        if (!p.full && !clusters.has(cluster)) return null;
        const [w, h] = p.full ? SHAPE[cluster] : [5, 5];
        const common = { fill: on ? pal.ink : 'none', stroke: on ? pal.ink : pal.ghostKey, strokeWidth: on ? 0 : 1 };
        const attr = { 'data-sat': on ? 'pressed' : 'ghost', 'data-key': id };
        if (!p.full || (w === h && cluster !== 'table')) {
          return <ellipse key={id} {...attr} cx={dx} cy={dy} rx={w / 2} ry={h / 2} {...common} />;
        }
        const rx = cluster === 'table' ? 0.8 : Math.min(w, h) / 2;
        return <rect key={id} {...attr} x={dx - w / 2} y={dy - h / 2} width={w} height={h} rx={rx} {...common} />;
      })}
    </>
  );
}

/** x = column centre, y = chart top. */
export function FingeringChart(p: {
  kind: Kind; option: FingeringOption; style: 'compact' | 'full'; x: number; y: number; scale?: number;
}): JSX.Element {
  const full = p.style === 'full';
  const s = p.scale ?? 1;
  return (
    <g transform={`translate(${p.x}, ${p.y})${s === 1 ? '' : ` scale(${s})`}`}>
      <Holes kind={p.kind} option={p.option} full={full} />
      <Satellites kind={p.kind} option={p.option} full={full} />
    </g>
  );
}

const missing = (pal: Palette) => ({
  bad: { label: '!', color: pal.error, bg: pal.errorBg, border: pal.error, name: 'Unplayable note' },
  ext: { label: 'ext', color: pal.warning, bg: pal.warningBg, border: pal.warning, name: 'Extended note, no fingering data' },
  alt: { label: 'alt', color: pal.muted, bg: pal.badgeBg, border: pal.ghostKey, name: 'Altissimo note, no fingering data' },
});

/** Dashed placeholder where a chart is missing. x = column centre, y = chart top. */
export function MissingChart(p: { type: 'bad' | 'ext' | 'alt'; x: number; y: number }): JSX.Element {
  const m = missing(usePalette())[p.type];
  return (
    <g data-missing={p.type}>
      <title>{m.name}</title>
      <rect x={p.x - 13} y={p.y} width={26} height={84} rx={6} fill={m.bg} stroke={m.border} strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={p.x} y={p.y + 43} textAnchor="middle" fontSize={11} fontWeight={700} fill={m.color}
        fontFamily="'Atkinson Hyperlegible', system-ui, sans-serif">{m.label}</text>
    </g>
  );
}
