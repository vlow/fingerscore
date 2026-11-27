import { add, mul, norm, sub, v3, type Tube, type TubeSample, type Vec3 } from './project';

/**
 * What every instrument model of the key map is made of, and helpers to build one (prototype).
 *
 * Units are millimetres. Frame, as the player holds the instrument: x points forward, away from the player; y up; z to
 * the player's right. An upright instrument hangs down the y axis; a depth s below its reference point is y = -s.
 * Angles around a tube run from forward (0) towards the player's right (90); -90 is the left, 180 the back.
 *
 * Keys sit at their touch pieces, not at the pads they close. Key ids match the fingering chart: "h0", "h1", … are the
 * column of LAYOUT[kind] in order; every other id is a key of SATS[kind].
 */

export type Shape =
  | 'cup' | 'small' | 'hole' | 'double'
  | 'palm' | 'side' | 'table' | 'spatula' | 'lever' | 'front' | 'sliver';

/** Where a key sits: centre, outward normal, and the direction across the tube. */
export interface KeyFrame { c: Vec3; n: Vec3; across: Vec3 }

export interface ModelKey {
  id: string;
  name: string;
  finger: string;
  shape: Shape;
  /**
   * Size of the touch piece across the tube (w) and along it (h). A cup: w is the pearl, h the cup around it. A double
   * hole: w the larger hole, h the smaller one.
   */
  w: number;
  h: number;
  frame: KeyFrame;
  layer: string;
}

/** A circle around a tube, of which only the near half is drawn: a band, ring or joint. onDark: on a black part. */
export interface Edge { c: Vec3; n: Vec3; r: number; onDark?: boolean }
/** A pad, screw or other round fitting on a surface. */
export interface Pad { c: Vec3; n: Vec3; r: number }
/** A thin rod, wire or bent fitting, with the normal that decides from which side it shows. */
export interface Rod { tube: Tube; n: Vec3; title?: string }
/** An open end: a bell rim, seen into. */
export interface Rim { c: Vec3; n: Vec3; r: number }
/** A ring that is only an outline, such as a strap ring. */
export interface Ring { c: Vec3; n: Vec3; r: number; title: string }
/** A flat piece: a flute's lip plate (with its embouchure hole) or a recorder's window (an opening). */
export interface Plate { frame: KeyFrame; w: number; h: number; kind: 'lip' | 'window' }

/**
 * One part of the instrument that is drawn as a whole: its tubes, and everything that sits on them. Parts are drawn
 * far ones first, ordered by the depth of their anchor, so the nearer one covers the other where they overlap.
 */
export interface Layer {
  id: string;
  anchor: Vec3;
  tubes: Tube[];
  /** Black parts: mouthpieces and the like. */
  dark?: Tube[];
  edges?: Edge[];
  rods?: Rod[];
  pads?: Pad[];
  rings?: Ring[];
  plates?: Plate[];
  rims?: Rim[];
}

export interface ViewSpec { id: string; label: string; yaw: number; elev: number; roll?: number }

export interface InstrumentModel {
  /** Short name of what is modelled, for the drawing's label. */
  name: string;
  views: ViewSpec[];
  /** How far the camera stands, in mm. */
  distance: number;
  /** The whole outline, drawn once below the layers so the silhouette has no seams. */
  outline: Tube[];
  layers: Layer[];
  keys: ModelKey[];
}

// --- Building blocks -------------------------------------------------------------------------------------------------

export const RAD = Math.PI / 180;
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const UP = v3(0, 1, 0);

/** Samples of a tube along a curve, about every `step` mm. */
export function sweep(curve: (u: number) => Vec3, radius: (u: number) => number, length: number, step = 1.5): TubeSample[] {
  const n = Math.max(2, Math.ceil(length / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    const t = norm(sub(curve(Math.min(1, u + 1e-3)), curve(Math.max(0, u - 1e-3))));
    return { c: curve(u), t, r: radius(u) };
  });
}

export function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3) {
  return (u: number): Vec3 => {
    const k = 1 - u;
    return add(add(mul(p0, k * k * k), mul(p1, 3 * k * k * u)), add(mul(p2, 3 * k * u * u), mul(p3, u * u * u)));
  };
}

export const line = (a: Vec3, b: Vec3) => (u: number): Vec3 => add(a, mul(sub(b, a), u));

/** Outward normal at an angle around an upright tube. */
export const around = (angle: number): Vec3 => v3(Math.cos(angle * RAD), 0, Math.sin(angle * RAD));
/** Direction across an upright tube at an angle, turning with the angle. */
export const acrossAt = (angle: number): Vec3 => v3(-Math.sin(angle * RAD), 0, Math.cos(angle * RAD));

/** An upright tube from depth `from` to depth `to`, drawn by its cross-sections. */
export function upright(from: number, to: number, radius: (s: number) => number, step = 1.5): Tube {
  return { mode: 'disk', samples: sweep(u => v3(0, -lerp(from, to, u), 0), u => radius(lerp(from, to, u)), Math.abs(to - from), step) };
}

/** A tube drawn by spheres along a curve: for bends, rods and black parts. */
export function rounded(curve: (u: number) => Vec3, radius: (u: number) => number, length: number, step = 1.5): Tube {
  return { mode: 'ball', samples: sweep(curve, radius, length, step) };
}

/** A rod along a curve, `r` thick, seen from the side `n` faces. */
export function rod(points: (u: number) => Vec3, r: number, n: Vec3, title?: string): Rod {
  const a = points(0);
  const b = points(1);
  const length = Math.max(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 20);
  return { tube: rounded(points, () => r, length, 0.8), n, title };
}

/** A point on an upright tube of radius r at depth s, `lift` above its surface. */
export const onUpright = (s: number, angle: number, r: number, lift: number): Vec3 =>
  add(v3(0, -s, 0), mul(around(angle), r + lift));

/** A key's frame on an upright tube. */
export const uprightFrame = (s: number, angle: number, r: number, lift: number): KeyFrame =>
  ({ c: onUpright(s, angle, r, lift), n: around(angle), across: acrossAt(angle) });

/** The near-half edges of a band around an upright tube, from depth `from` to depth `to`. */
export const bandEdges = (from: number, to: number, r: number): Edge[] =>
  [from, to].map(s => ({ c: v3(0, -s, 0), n: UP, r }));
