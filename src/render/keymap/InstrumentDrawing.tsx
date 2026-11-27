import { useId, useMemo, type ReactNode } from 'react';
import { usePalette } from '../palette';
import { KeyTarget, type KeyEvents } from './KeyTarget';
import type { InstrumentModel, KeyFrame, Layer, ModelKey } from './model';
import {
  add, camera, diskPath, frontArcPath, mul, ovalPath, platePath, tubeBounds, tubePath, type Projection, type Tube,
} from './project';

const OUTLINE = 1.2;
const FILL = 'var(--c-raised)';
/** A part turned further away than this is hidden behind the tube. */
const MIN_FACING = 0.06;
const GAP = 24;
const LABEL_SPACE = 26;
/** About the width of one character of a view's label, at its 14 px bold. */
const LABEL_CHAR = 7.6;

function cameraOf(model: InstrumentModel, viewId: string): Projection {
  const v = model.views.find(x => x.id === viewId) ?? model.views[0];
  return camera(v.yaw, v.elev, model.distance, v.roll ?? 0);
}

/** Whether a key faces the viewer in this view of its model. */
export function keyShows(model: InstrumentModel, k: ModelKey, viewId: string): boolean {
  return cameraOf(model, viewId).facing(k.frame.n) > MIN_FACING;
}

/** The views of the model in which a key shows. */
export function viewsShowing(model: InstrumentModel, k: ModelKey): string[] {
  return model.views.filter(v => keyShows(model, k, v.id)).map(v => v.label);
}

/** The disks a round key is drawn with: centre and radius, larger first. */
function disksOf(k: ModelKey): { c: KeyFrame['c']; r: number }[] {
  const { c, across } = k.frame;
  if (k.shape === 'double') {
    return [{ c: add(c, mul(across, -k.h * 0.55)), r: k.w / 2 }, { c: add(c, mul(across, k.w * 0.6)), r: k.h / 2 }];
  }
  return [{ c, r: k.w / 2 }];
}

const isRound = (k: ModelKey) => k.shape === 'cup' || k.shape === 'small' || k.shape === 'hole' || k.shape === 'double';

/** The outline of a key's touch piece, grown by `grow`. A cup grows from its cup, not its pearl. */
function keyOutline(cam: Projection, k: ModelKey, grow: number): string {
  const { c, n, across } = k.frame;
  if (k.shape === 'cup') return diskPath(cam, add(c, mul(n, -2)), n, k.h / 2 + grow);
  if (isRound(k)) return disksOf(k).map(d => diskPath(cam, d.c, n, d.r + grow)).join('');
  if (k.shape === 'front') return ovalPath(cam, c, n, across, k.w + 2 * grow, k.h + 2 * grow);
  return platePath(cam, c, n, across, k.w + 2 * grow, k.h + 2 * grow);
}

/**
 * Tubes drawn as one outlined shape: every part stroked, then every part filled. The fills cover the strokes inside,
 * so only the outline of the whole shape is left, without seams where the parts meet.
 */
function Solid(p: { cam: Projection; tubes: Tube[]; fill?: string; ink?: string }) {
  const pal = usePalette();
  const d = p.tubes.map(t => tubePath(p.cam, t)).join('');
  return (
    <>
      <path d={d} fill="none" stroke={p.ink ?? pal.ink} strokeWidth={2 * OUTLINE} />
      <path d={d} fill={p.fill ?? FILL} />
    </>
  );
}

/** A key: white touch piece with an ink outline, filled when pressed, half filled when half pressed. */
function KeyFace(p: { cam: Projection; k: ModelKey; value: number; clip: string }) {
  const pal = usePalette();
  const { cam, k, value } = p;
  const { c, n, across } = k.frame;
  const stroke = { stroke: pal.ink, strokeWidth: 1, strokeLinejoin: 'round' as const };
  if (k.shape === 'double') {
    // The larger hole closes from half, the smaller one only when the note is fully closed, as in the chart.
    const [big, small] = disksOf(k);
    return (
      <>
        <path d={diskPath(cam, big.c, n, big.r)} fill={value >= 0.5 ? pal.ink : pal.paper} {...stroke} />
        <path d={diskPath(cam, small.c, n, small.r)} fill={value === 1 ? pal.ink : pal.paper} {...stroke} />
      </>
    );
  }
  const d = isRound(k) ? diskPath(cam, c, n, k.w / 2) : keyOutline(cam, k, 0);
  if (value !== 0.5) return <path d={d} fill={value === 1 ? pal.ink : pal.paper} {...stroke} />;
  // Half-hole: the half towards the bottom of the tube closed.
  return (
    <>
      <clipPath id={p.clip}><path d={platePath(cam, add(c, mul(across, -k.w / 4)), n, across, k.w / 2, k.w * 1.2)} /></clipPath>
      <path d={d} fill={pal.paper} {...stroke} />
      <path d={d} fill={pal.ink} clipPath={`url(#${p.clip})`} />
    </>
  );
}

interface ViewProps {
  model: InstrumentModel;
  viewId: string;
  pressed: ReadonlyMap<string, number>;
  shown: string | null;
  events: KeyEvents;
}

/** One thing on the instrument's surface, drawn in depth order with the others of its layer. */
interface Part { depth: number; node: ReactNode }

function ModelView(p: ViewProps) {
  const pal = usePalette();
  // React's ids hold colons, which a url(#…) reference cannot take.
  const uid = useId().replace(/:/g, '');
  const cam = useMemo(() => cameraOf(p.model, p.viewId), [p.model, p.viewId]);
  const faces = (n: KeyFrame['n']) => cam.facing(n) > MIN_FACING;
  const fitting = pal.muted;

  const layerNode = (layer: Layer): ReactNode => {
    const parts: Part[] = [];
    const push = (c: KeyFrame['c'], node: ReactNode, bias = 0) => parts.push({ depth: cam.point(c).depth + bias, node });
    (layer.rods ?? []).filter(r => faces(r.n)).forEach((r, i) => {
      const mid = r.tube.samples[Math.floor(r.tube.samples.length / 2)].c;
      push(mid, <g key={`rod${i}`}>{r.title && <title>{r.title}</title>}<Solid cam={cam} tubes={[r.tube]} ink={fitting} /></g>, -5);
    });
    (layer.pads ?? []).filter(d => faces(d.n)).forEach((d, i) => push(d.c, (
      <g key={`pad${i}`}>
        <path d={diskPath(cam, d.c, d.n, d.r)} fill={FILL} stroke={fitting} strokeWidth={1} />
        <path d={diskPath(cam, d.c, d.n, d.r * 0.6)} fill="none" stroke={pal.ghostKey} strokeWidth={1} />
      </g>
    )));
    (layer.rings ?? []).filter(r => faces(r.n)).forEach((r, i) => push(r.c, (
      <path key={`ring${i}`} d={diskPath(cam, r.c, r.n, r.r)} fill="none" stroke={fitting} strokeWidth={2}><title>{r.title}</title></path>
    )));
    (layer.plates ?? []).filter(pl => faces(pl.frame.n)).forEach((pl, i) => {
      const { c, n, across } = pl.frame;
      push(c, pl.kind === 'lip' ? (
        <g key={`plate${i}`}>
          <path d={ovalPath(cam, c, n, across, pl.w, pl.h)} fill={FILL} stroke={pal.ink} strokeWidth={OUTLINE} />
          <path d={ovalPath(cam, add(c, mul(n, 0.5)), n, across, pl.w * 0.42, pl.h * 0.55)} fill={pal.ghostKey} stroke={fitting} strokeWidth={1}>
            <title>Embouchure hole</title>
          </path>
        </g>
      ) : (
        <path key={`plate${i}`} d={platePath(cam, c, n, across, pl.w, pl.h)} fill={pal.ghostKey} stroke={fitting} strokeWidth={1}>
          <title>Window</title>
        </path>
      ));
    });
    for (const k of p.model.keys.filter(x => x.layer === layer.id && faces(x.frame.n))) {
      const value = p.pressed.get(k.id) ?? 0;
      push(k.frame.c, (
        <KeyTarget key={k.id} id={k.id} label={`${k.name} (${k.finger})`} events={p.events}>
          {p.shown === k.id && <path d={keyOutline(cam, k, 4)} fill={pal.selection} stroke={pal.chord} strokeWidth={3} />}
          {k.shape === 'cup' && <path d={keyOutline(cam, k, 0)} fill={FILL} stroke={pal.ink} strokeWidth={OUTLINE} />}
          <KeyFace cam={cam} k={k} value={value} clip={`${uid}-${p.viewId}-${k.id}`} />
        </KeyTarget>
      ));
    }
    return (
      <g key={layer.id} data-part={layer.id}>
        <Solid cam={cam} tubes={layer.tubes} />
        {(layer.edges ?? []).filter(e => !e.onDark).map((e, i) => (
          <path key={`e${i}`} d={frontArcPath(cam, e.c, e.n, e.r)} fill="none" stroke={pal.ink} strokeWidth={OUTLINE} />
        ))}
        {(layer.dark ?? []).map((t, i) => <path key={`d${i}`} d={tubePath(cam, t)} fill={pal.ink} />)}
        {(layer.edges ?? []).filter(e => e.onDark).map((e, i) => (
          <path key={`de${i}`} d={frontArcPath(cam, e.c, e.n, e.r)} fill="none" stroke={pal.paper} strokeWidth={2} />
        ))}
        {parts.sort((a, b) => a.depth - b.depth).map(x => x.node)}
        {(layer.rims ?? []).filter(r => cam.facing(r.n) > 0).map((r, i) => (
          <g key={`rim${i}`}>
            <path d={diskPath(cam, r.c, r.n, r.r + 1.5)} fill={FILL} stroke={pal.ink} strokeWidth={OUTLINE} />
            <path d={diskPath(cam, r.c, r.n, r.r * 0.95 - 1.5)} fill={pal.paper} stroke={pal.ink} strokeWidth={0.8} />
            <path d={diskPath(cam, add(r.c, mul(r.n, -r.r * 0.5)), r.n, r.r * 0.63)} fill={pal.ghostKey} opacity={0.5} />
          </g>
        ))}
      </g>
    );
  };

  // The whole instrument once, for a clean outline; then its layers, far ones first.
  const layers = [...p.model.layers].sort((a, b) => cam.point(a.anchor).depth - cam.point(b.anchor).depth);
  return (
    <>
      <Solid cam={cam} tubes={p.model.outline} />
      {layers.map(layerNode)}
    </>
  );
}

/**
 * An instrument from each of its fixed views: side by side for an upright instrument, one above the other for one
 * that lies on its side, such as the flute. Pressed keys fill; the shown key gets an accent ring. `only` draws one view.
 */
export function InstrumentDrawing(p: Omit<ViewProps, 'viewId'> & { only?: string }) {
  const pal = usePalette();
  const views = p.model.views.filter(v => p.only === undefined || v.id === p.only);
  const boxes = useMemo(() => views.map(v => {
    const [x0, y0, x1, y1] = tubeBounds(cameraOf(p.model, v.id), [...p.model.outline, ...p.model.layers.flatMap(l => l.dark ?? [])]);
    return { x: x0 - 10, y: y0 - 10, w: x1 - x0 + 20, h: y1 - y0 + 20, label: v.label.length * LABEL_CHAR + 2 * GAP };
  }), [p.model, p.only]); // `views` follows from these two
  const stacked = boxes.every(b => b.w > b.h);
  // A slim instrument's cell is as wide as its label at least, so the labels never run into each other.
  const cellWidth = (b: (typeof boxes)[number]) => Math.max(b.w, b.label);
  const cellW = Math.max(...boxes.map(cellWidth));
  const cellH = Math.max(...boxes.map(b => b.h)) + LABEL_SPACE;
  const width = stacked ? cellW : boxes.reduce((sum, b) => sum + cellWidth(b), 0) + GAP * (boxes.length - 1);
  const height = stacked ? cellH * boxes.length + GAP * (boxes.length - 1) : cellH;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`} role="group"
      aria-label={`${p.model.name}: ${views.map(v => v.label.toLowerCase()).join(' and ')}`}
      style={{ width: '100%', height: 'auto' }}>
      {views.map((v, i) => {
        const box = boxes[i];
        // The cell's top-left corner, and the drawing centred in it above its label.
        const cx = stacked ? 0 : offset;
        const cy = stacked ? offset : 0;
        const w = stacked ? cellW : cellWidth(box);
        offset += (stacked ? cellH : w) + GAP;
        const dx = cx + (w - box.w) / 2 - box.x;
        const dy = cy + (cellH - LABEL_SPACE - box.h) / 2 - box.y;
        return (
          <g key={v.id} data-view={v.id}>
            <g transform={`translate(${dx.toFixed(1)} ${dy.toFixed(1)})`}>
              <ModelView {...p} viewId={v.id} />
            </g>
            <text x={cx + w / 2} y={cy + cellH - 8} textAnchor="middle" fontSize={14} fontWeight={700}
              fill={pal.text} fontFamily="'Atkinson Hyperlegible', system-ui, sans-serif">{v.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
