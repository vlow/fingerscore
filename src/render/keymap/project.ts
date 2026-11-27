/** A little 3D for the key map: vectors, a fixed camera, and tubes, disks and plates drawn as SVG paths. */

export interface Vec3 { x: number; y: number; z: number }

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm = (a: Vec3): Vec3 => mul(a, 1 / Math.hypot(a.x, a.y, a.z));

export interface ScreenPoint { x: number; y: number; depth: number }

export interface Projection {
  /** Screen point (y down) and depth (larger = nearer the viewer). */
  point(p: Vec3): ScreenPoint;
  /** Screen vector of a short step from point c in direction v, per unit of length. */
  dirAt(c: Vec3, v: Vec3): [number, number];
  /** How much larger than at the origin a length at point c appears: nearer is larger. */
  scaleAt(c: Vec3): number;
  /** How much a surface with this outward normal faces the viewer: 1 head-on, 0 edge-on, below 0 turned away. */
  facing(n: Vec3): number;
}

const RAD = Math.PI / 180;
const STEP = 0.5;

/**
 * Perspective camera on a circle around the y axis (up), `distance` from the origin. yaw 0 stands on +z and looks
 * towards -z; yaw 90 stands on +x. elev raises the camera to look down by that many degrees. Lengths at the origin keep
 * their size; nearer ones grow and farther ones shrink, which is what shows a part turning away from the viewer.
 * roll turns the picture clockwise by that many degrees: -90 lays an upright model on its side, head to the left.
 */
export function camera(yawDeg: number, elevDeg: number, distance: number, rollDeg = 0): Projection {
  const sy = Math.sin(yawDeg * RAD);
  const cy = Math.cos(yawDeg * RAD);
  const se = Math.sin(elevDeg * RAD);
  const ce = Math.cos(elevDeg * RAD);
  const right = v3(cy, 0, -sy);
  const up = v3(-sy * se, ce, -cy * se);
  const view = v3(sy * ce, se, cy * ce);
  const sr = Math.sin(rollDeg * RAD);
  const cr = Math.cos(rollDeg * RAD);
  const scaleAt = (p: Vec3) => distance / (distance - dot(p, view));
  const point = (p: Vec3): ScreenPoint => {
    const k = scaleAt(p);
    const x = dot(p, right) * k;
    const y = -dot(p, up) * k;
    return { x: x * cr - y * sr, y: x * sr + y * cr, depth: dot(p, view) };
  };
  return {
    point,
    dirAt: (c, v) => {
      const a = point(c);
      const b = point(add(c, mul(v, STEP)));
      return [(b.x - a.x) / STEP, (b.y - a.y) / STEP];
    },
    scaleAt,
    facing: n => dot(n, view),
  };
}

const f1 = (n: number) => n.toFixed(1);
/** Half the thinnest an ellipse gets, so neighbouring cross-sections of a tube overlap without gaps. */
const MIN_MINOR = 0.6;

/** SVG path of an ellipse, clockwise on screen, so that many of them fill as one shape. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number, angle: number): string {
  const dx = rx * Math.cos(angle);
  const dy = rx * Math.sin(angle);
  const arc = `A${f1(rx)} ${f1(ry)} ${f1(angle / RAD)} 0 1`;
  return `M${f1(cx + dx)} ${f1(cy + dy)}${arc} ${f1(cx - dx)} ${f1(cy - dy)}${arc} ${f1(cx + dx)} ${f1(cy + dy)}Z`;
}

/** The screen ellipse of a flat disk: centre c, normal n, radius r. */
export function diskPath(cam: Projection, c: Vec3, n: Vec3, r: number): string {
  const helper = Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  const u1 = norm(cross(n, helper));
  const u2 = cross(n, u1);
  const [ax, ay] = cam.dirAt(c, u1);
  const [bx, by] = cam.dirAt(c, u2);
  // Principal axes of the ellipse spanned by the conjugate radii (ax, ay) and (bx, by).
  const a = ax * ax + bx * bx;
  const b = ax * ay + bx * by;
  const d = ay * ay + by * by;
  const mid = (a + d) / 2;
  const spread = Math.hypot((a - d) / 2, b);
  const p = cam.point(c);
  const major = Math.sqrt(mid + spread) * r;
  const minor = Math.max(Math.sqrt(Math.max(mid - spread, 0)) * r, MIN_MINOR);
  return ellipsePath(p.x, p.y, major, minor, Math.atan2(2 * b, a - d) / 2);
}

/**
 * The near half of a circle around a tube: centre c, tube axis n, radius r. A ring or band edge drawn whole would show
 * its far half through the tube, as if the instrument were glass; the tube hides that half.
 */
export function frontArcPath(cam: Projection, c: Vec3, n: Vec3, r: number): string {
  const helper = Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  const u1 = norm(cross(n, helper));
  const u2 = cross(n, u1);
  const SAMPLES = 72;
  const ring = Array.from({ length: SAMPLES }, (_, i) => {
    const t = (2 * Math.PI * i) / SAMPLES;
    const out = add(mul(u1, Math.cos(t)), mul(u2, Math.sin(t)));
    return { p: cam.point(add(c, mul(out, r))), near: cam.facing(out) >= 0 };
  });
  // Start right after a far sample, so the near run is one unbroken stretch.
  const start = ring.findIndex((s, i) => !s.near && ring[(i + 1) % SAMPLES].near);
  if (start < 0) return '';
  const run: ScreenPoint[] = [];
  for (let k = 1; k <= SAMPLES; k++) {
    const s = ring[(start + k) % SAMPLES];
    if (!s.near) break;
    run.push(s.p);
  }
  return `M${run.map(q => `${f1(q.x)} ${f1(q.y)}`).join('L')}`;
}

/** An oval lying on a surface: centre c, normal n, width w along `across`, height h along n × across. */
export function ovalPath(cam: Projection, c: Vec3, n: Vec3, across: Vec3, w: number, h: number): string {
  const along = cross(n, across);
  const SAMPLES = 36;
  const pts = Array.from({ length: SAMPLES }, (_, i) => {
    const t = (2 * Math.PI * i) / SAMPLES;
    return cam.point(add(c, add(mul(across, (Math.cos(t) * w) / 2), mul(along, (Math.sin(t) * h) / 2))));
  });
  return `M${pts.map(q => `${f1(q.x)} ${f1(q.y)}`).join('L')}Z`;
}

/** A rectangle lying on a surface: centre c, normal n, width w along `across`, height h along n × across. */
export function platePath(cam: Projection, c: Vec3, n: Vec3, across: Vec3, w: number, h: number): string {
  const along = cross(n, across);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
    cam.point(add(c, add(mul(across, (i * w) / 2), mul(along, (j * h) / 2)))));
  return `M${corners.map(q => `${f1(q.x)} ${f1(q.y)}`).join('L')}Z`;
}

/** A point of a tube's centre line: centre, unit tangent, radius. */
export interface TubeSample { c: Vec3; t: Vec3; r: number }

/**
 * A tube as a row of shapes whose union is its outline. "disk": its cross-sections, which keep an open end flat (a bell
 * rim) but thin out where the tube runs across the line of sight, so only for tubes that stay upright. "ball": spheres,
 * round from every side, for bends and rods; their ends are domes.
 */
export interface Tube { mode: 'disk' | 'ball'; samples: readonly TubeSample[] }

export function tubePath(cam: Projection, tube: Tube, grow = 0): string {
  return tube.samples.map(s => {
    if (tube.mode === 'disk') return diskPath(cam, s.c, s.t, s.r + grow);
    const p = cam.point(s.c);
    const r = (s.r + grow) * cam.scaleAt(s.c);
    return ellipsePath(p.x, p.y, r, r, 0);
  }).join('');
}

/** Screen bounds of tubes: [minX, minY, maxX, maxY]. */
export function tubeBounds(cam: Projection, tubes: readonly Tube[]): [number, number, number, number] {
  let b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const t of tubes) {
    for (const s of t.samples) {
      const p = cam.point(s.c);
      const r = s.r * cam.scaleAt(s.c);
      b = [Math.min(b[0], p.x - r), Math.min(b[1], p.y - r), Math.max(b[2], p.x + r), Math.max(b[3], p.y + r)];
    }
  }
  return b;
}
