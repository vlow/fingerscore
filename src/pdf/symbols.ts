// Symbols the text font lacks, drawn as outlines at the size and position of the text around them.
import glyphs from '../data/glyphs.json';
import type { Weight } from './fontMetrics';

// ---------------------------------------------------------------------------------------------------------------
// Symbols as outlines.

/** Space on each side of a symbol's ink, in em of the text around it. */
export const SYMBOL_SIDE = 0.08;

interface Shape {
  /** Outline in its own units, y up. */
  d: string;
  box: [number, number, number, number];
  /** Ink bottom and top over the baseline, in em, as a browser draws the character beside Atkinson Hyperlegible (Chromium, macOS). */
  bottom: number; top: number;
}

/**
 * The music font's accidentals are drawn for staff use and look thin beside text; they get an outline stroke in the
 * fill colour of this many em: more beside bold text.
 */
const GLYPH_STROKE: Record<Weight, number> = { 400: 0.012, 700: 0.03 };

const glyph = (name: keyof typeof glyphs.paths, bottom: number, top: number): Shape => ({
  d: glyphs.paths[name], box: glyphs.bbox[name as keyof typeof glyphs.bbox] as unknown as [number, number, number, number], bottom, top,
});

const f = (n: number) => String(Math.round(n * 10) / 10);
const K = 0.5523;   // cubic Bézier approximation of a quarter circle

/** A full circle, counter-clockwise (y up) or clockwise. */
function circle(cx: number, cy: number, r: number, ccw: boolean): string {
  const k = K * r;
  const pts = ccw
    ? [[cx + r, cy], [cx, cy + r], [cx - r, cy], [cx, cy - r]]
    : [[cx + r, cy], [cx, cy - r], [cx - r, cy], [cx, cy + r]];
  const dir = ccw ? 1 : -1;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % 4];
    // tangent at a point of the circle, in the direction of travel
    const t0 = [-(y0 - cy) / r * dir, (x0 - cx) / r * dir];
    const t1 = [-(y1 - cy) / r * dir, (x1 - cx) / r * dir];
    d += `C${f(x0 + t0[0] * k)} ${f(y0 + t0[1] * k)} ${f(x1 - t1[0] * k)} ${f(y1 - t1[1] * k)} ${f(x1)} ${f(y1)}`;
  }
  return `${d}Z`;
}

/** Δ: a triangle outline, the inner contour reversed so that the nonzero rule leaves it open. */
function triangle(thickness: number): string {
  const W = 823, H = 1000;
  const leg = Math.hypot(W / 2, H);
  const r = (W * H) / (W + 2 * leg);    // inradius: area / half perimeter
  const k = (r - thickness) / r;
  const outer = [[0, 0], [W, 0], [W / 2, H]];
  const inner = outer.map(([x, y]) => [W / 2 + (x - W / 2) * k, r + (y - r) * k]).reverse();
  const poly = (p: number[][]) => `M${p.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
  return poly(outer) + poly(inner);
}

/** ‿: a shallow arc open at the top. */
function undertie(thickness: number): string {
  const W = 1000, H = 380;
  return `M0 ${H}Q${W / 2} ${-H} ${W} ${H}L${W - thickness / 2} ${H}Q${W / 2} ${-H + 2 * thickness} ${thickness / 2} ${H}Z`;
}

const RING = 0.13;   // the charts' 1.3-unit stroke on a disc of about 10 units

const ACCIDENTALS = new Set(['♭', '♯', '♮', '𝄫', '𝄪']);

const SHAPES: Record<string, (weight: Weight) => Shape> = {
  '♭': () => glyph('flat', 0.14, 0.705),
  '♯': () => glyph('sharp', 0.10, 0.705),
  '♮': () => glyph('natural', 0.10, 0.705),
  '𝄫': () => glyph('doubleFlat', 0.14, 0.705),
  '𝄪': () => glyph('doubleSharp', 0.16, 0.45),
  '♩': () => glyph('noteQuarterUp', -0.067, 0.824),
  'Δ': w => ({ d: triangle(w === 700 ? 150 : 105), box: [0, 0, 823, 1000], bottom: 0, top: 0.705 }),
  '‿': w => ({ d: undertie(w === 700 ? 130 : 95), box: [0, 0, 1000, 380], bottom: -0.241, top: -0.065 }),
  '●': () => ({ d: circle(500, 500, 500, true), box: [0, 0, 1000, 1000], bottom: -0.042, top: 0.747 }),
  '○': () => ({ d: circle(500, 500, 500, true) + circle(500, 500, 500 * (1 - 2 * RING), false), box: [0, 0, 1000, 1000], bottom: -0.042, top: 0.747 }),
  '◐': () => {
    const ri = 500 * (1 - 2 * RING);
    const half = `M500 ${f(500 + ri)}C${f(500 - K * ri)} ${f(500 + ri)} ${f(500 - ri)} ${f(500 + K * ri)} ${f(500 - ri)} 500`
      + `C${f(500 - ri)} ${f(500 - K * ri)} ${f(500 - K * ri)} ${f(500 - ri)} 500 ${f(500 - ri)}Z`;
    return { d: circle(500, 500, 500, true) + circle(500, 500, ri, false) + half, box: [0, 0, 1000, 1000], bottom: -0.042, top: 0.747 };
  },
};

/** Where a symbol's outline goes: its path, and the transform that puts it at pen x, baseline y for a text of size px. */
export function symbolPlacement(ch: string, weight: Weight, x: number, y: number, px: number): { d: string; scale: number; tx: number; ty: number; stroke: number } {
  const shape = SHAPES[ch](weight);
  const [x1, y1, , y2] = shape.box;
  const scale = ((shape.top - shape.bottom) * px) / (y2 - y1);
  const stroke = ACCIDENTALS.has(ch) ? GLYPH_STROKE[weight] * px : 0;
  return { d: shape.d, scale, tx: x + SYMBOL_SIDE * px - x1 * scale, ty: y - shape.bottom * px + y1 * scale, stroke };
}

/** Ink box of a symbol placed at pen x, baseline y, for a text of size px; y down. */
export function symbolInk(ch: string, weight: Weight, x: number, y: number, px: number): { x1: number; y1: number; x2: number; y2: number } {
  const shape = SHAPES[ch](weight);
  const ink = (symbolEm(ch, weight) - 2 * SYMBOL_SIDE) * px;
  return { x1: x + SYMBOL_SIDE * px, x2: x + SYMBOL_SIDE * px + ink, y1: y - shape.top * px, y2: y - shape.bottom * px };
}

export function symbolEm(ch: string, weight: Weight): number {
  const shape = SHAPES[ch](weight);
  const [x1, y1, x2, y2] = shape.box;
  return ((x2 - x1) / (y2 - y1)) * (shape.top - shape.bottom) + 2 * SYMBOL_SIDE;
}

