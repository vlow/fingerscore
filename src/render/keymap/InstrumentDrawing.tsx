import { useId, useMemo, type ReactNode } from 'react';
import { usePalette } from '../palette';
import styles from './InstrumentDrawing.module.css';
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

/** A view's camera, turned by `tilt` degrees in the picture on top of the view's own roll. */
function cameraOf(model: InstrumentModel, viewId: string, tilt = 0): Projection {
  const v = model.views.find(x => x.id === viewId) ?? model.views[0];
  return camera(v.yaw, v.elev, model.distance, (v.roll ?? 0) + tilt);
}

/** The canvas: one fixed size for every instrument, so each is drawn as large as it fits (in px at 1×). */
const CANVAS_H = 560;
const CANVAS_W = { one: 340, two: 640 } as const;
const TILT_STEP = 5;
/** A larger tilt is taken only when it draws the instrument at least this much larger: upright stays the default. */
const TILT_GAIN = 1.04;

interface Fit { tilt: number; scale: number; boxes: { x: number; y: number; w: number; h: number }[] }

/**
 * The tilt within the model's range that draws its views largest in cells of cellW × cellH, and that scale. Both views
 * share it, so the front and the back of an instrument are the same size.
 */
export function fitViews(model: InstrumentModel, viewIds: string[], cellW: number, cellH: number): Fit {
  const tubes = [...model.outline, ...model.layers.flatMap(l => l.dark ?? [])];
  const [from, to] = model.tilt;
  let best: Fit | null = null;
  // Upright first, then further out on either side, so a tie keeps the smaller tilt.
  const tilts = Array.from({ length: Math.floor((to - from) / TILT_STEP) + 1 }, (_, k) => from + k * TILT_STEP)
    .sort((a, b) => Math.abs(a) - Math.abs(b));
  for (const tilt of tilts) {
    const boxes = viewIds.map(id => {
      const [x0, y0, x1, y1] = tubeBounds(cameraOf(model, id, tilt), tubes);
      return { x: x0 - 6, y: y0 - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 };
    });
    const scale = Math.min(...boxes.map(b => Math.min(cellW / b.w, cellH / b.h)));
    if (best === null || scale > best.scale * TILT_GAIN) best = { tilt, scale, boxes };
  }
  return best!;
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
  /** Degrees the picture is turned, from the layout's fit. */
  tilt?: number;
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
  const cam = useMemo(() => cameraOf(p.model, p.viewId, p.tilt ?? 0), [p.model, p.viewId, p.tilt]);
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
 * An instrument from each of its fixed views, side by side on a canvas of one fixed size: every instrument is drawn
 * as large as it fits, turned within its tilt range where that makes it larger. Pressed keys fill; the shown key gets an
 * accent ring. `only` draws one view, on a narrower canvas.
 */
export function InstrumentDrawing(p: Omit<ViewProps, 'viewId' | 'tilt'> & { only?: string }) {
  const pal = usePalette();
  const views = p.model.views.filter(v => p.only === undefined || v.id === p.only);
  const width = views.length > 1 ? CANVAS_W.two : CANVAS_W.one;
  const cellW = (width - GAP * (views.length - 1)) / views.length;
  const cellH = CANVAS_H - LABEL_SPACE;
  const ids = views.map(v => v.id).join(' ');
  const fit = useMemo(() => fitViews(p.model, ids.split(' '), cellW, cellH), [p.model, ids, cellW, cellH]);
  return (
    <svg viewBox={`0 0 ${width} ${CANVAS_H}`} role="group" className={styles.canvas}
      aria-label={`${p.model.name}: ${views.map(v => v.label.toLowerCase()).join(' and ')}`}>
      {views.map((v, i) => {
        const box = fit.boxes[i];
        const left = i * (cellW + GAP);
        // Centre the view in its cell at the shared scale; the label sits under the cell.
        const transform = `translate(${(left + cellW / 2).toFixed(1)} ${(cellH / 2).toFixed(1)}) scale(${fit.scale.toFixed(4)}) `
          + `translate(${(-(box.x + box.w / 2)).toFixed(1)} ${(-(box.y + box.h / 2)).toFixed(1)})`;
        return (
          <g key={v.id} data-view={v.id}>
            <g transform={transform}>
              <ModelView {...p} viewId={v.id} tilt={fit.tilt} />
            </g>
            <text x={left + cellW / 2} y={CANVAS_H - 8} textAnchor="middle" fontSize={14} fontWeight={700}
              fill={pal.text} fontFamily="'Atkinson Hyperlegible', system-ui, sans-serif">{v.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
