import { ORDER, inst, type Instrument } from '../../domain/instruments';
import { chartIds } from './ChartTargets';
import { fitViews, keyShows } from './InstrumentDrawing';
import type { InstrumentModel, ModelKey } from './model';
import { MODELS, modelFor } from './models';
import { add, camera, cross, mul, norm, v3, type Projection, type Vec3 } from './project';

/** Each distinct model with the chart family it must match, from the instruments that use it. */
const CASES = [...new Map(ORDER.flatMap(id => {
  const kind = inst(id).kind;
  return (['straight', 'curved'] as const).map(shape => {
    const model = modelFor(id, kind, shape);
    return [model, [model.name, kind, model] as [string, Instrument['kind'], InstrumentModel]] as const;
  });
})).values()];

/** Whether screen point p lies inside the projected disk (centre c, normal n, radius r). */
function inDisk(cam: Projection, p: { x: number; y: number }, c: Vec3, n: Vec3, r: number): boolean {
  const u1 = norm(cross(n, Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0)));
  const u2 = cross(n, u1);
  const o = cam.point(c);
  const [ax, ay] = cam.dirAt(c, u1);
  const [bx, by] = cam.dirAt(c, u2);
  const det = ax * by - bx * ay;
  if (Math.abs(det) < 1e-9) return false;
  const dx = (p.x - o.x) / r;
  const dy = (p.y - o.y) / r;
  const s1 = (dx * by - bx * dy) / det;
  const s2 = (ax * dy - dx * ay) / det;
  return s1 * s1 + s2 * s2 <= 1;
}

/** Share of a key's touch piece that another layer, nearer the viewer, covers. */
function coveredShare(model: InstrumentModel, k: ModelKey, cam: Projection): number {
  const others = model.layers.filter(l => l.id !== k.layer);
  const { c, n, across } = k.frame;
  const along = cross(n, across);
  const r = Math.max(k.w, k.h) / 2;
  let all = 0;
  let hit = 0;
  for (let i = -6; i <= 6; i++) {
    for (let j = -6; j <= 6; j++) {
      const a = (i / 6) * r;
      const b = (j / 6) * r;
      if (a * a + b * b > r * r) continue;
      all++;
      const q = add(c, add(mul(across, a), mul(along, b)));
      const p = cam.point(q);
      const covered = others.some(l => [...l.tubes, ...(l.rims ?? []).map(rim => ({ mode: 'disk' as const, samples: [{ c: rim.c, t: rim.n, r: rim.r }] }))]
        .some(t => t.samples.some(s => {
          if (cam.point(s.c).depth <= p.depth) return false;
          if (t.mode === 'disk') return inDisk(cam, p, s.c, s.t, s.r);
          const o = cam.point(s.c);
          return Math.hypot(p.x - o.x, p.y - o.y) <= s.r * cam.scaleAt(s.c);
        })));
      if (covered) hit++;
    }
  }
  return hit / all;
}

it('gives every family a model, and the soprano sax a straight and a curved one', () => {
  expect(new Set(CASES.map(([, kind]) => kind))).toEqual(new Set(Object.keys(MODELS)));
  expect(modelFor('ssax', 'sax').name).toBe('Soprano saxophone');
  expect(modelFor('ssax', 'sax', 'curved').name).toBe('Curved soprano saxophone');
  expect(modelFor('asax', 'sax', 'straight')).toBe(MODELS.sax);
});

describe.each(CASES)('key map model: %s', (_name, kind, model) => {

  it('has exactly the keys of the fingering chart', () => {
    const ids = model.keys.map(k => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...chartIds(kind)].sort());
  });

  it('shows every key in at least one view', () => {
    const hidden = model.keys.filter(k => !model.views.some(v => keyShows(model, k, v.id))).map(k => k.id);
    expect(hidden).toEqual([]);
  });

  it('hides no shown key behind another part of the instrument', () => {
    const covered: string[] = [];
    for (const v of model.views) {
      const cam = camera(v.yaw, v.elev, model.distance, v.roll ?? 0);
      for (const k of model.keys.filter(x => keyShows(model, x, v.id))) {
        const share = coveredShare(model, k, cam);
        if (share > 0) covered.push(`${v.id}/${k.id}: ${Math.round(share * 100)}%`);
      }
    }
    expect(covered).toEqual([]);
  });
});

describe('canvas fit', () => {
  // The page's canvas: two views of 308 × 534 units each (640 × 560, a 24-unit gap and a label line).
  const cellW = (640 - 24) / 2;
  const cellH = 560 - 26;

  it.each(CASES)('%s: a tilt within its range, and both views fit their cells at one scale', (_name, _kind, model) => {
    const fit = fitViews(model, model.views.map(v => v.id), cellW, cellH);
    expect(fit.tilt).toBeGreaterThanOrEqual(model.tilt[0]);
    expect(fit.tilt).toBeLessThanOrEqual(model.tilt[1]);
    for (const b of fit.boxes) {
      expect(b.w * fit.scale).toBeLessThanOrEqual(cellW + 0.01);
      expect(b.h * fit.scale).toBeLessThanOrEqual(cellH + 0.01);
    }
  });

  it('lays the flute diagonally and keeps the alto saxophone upright', () => {
    expect(fitViews(MODELS.fl, ['top', 'bottom'], cellW, cellH).tilt).toBeGreaterThan(0);
    expect(fitViews(MODELS.sax, ['right', 'left'], cellW, cellH).tilt).toBe(0);
  });
});
