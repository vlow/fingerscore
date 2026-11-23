// Text for the PDF: measured with the font file that draws each piece, symbols the font lacks drawn as outlines.
// The same layout feeds the page parts (drawn straight onto the PDF) and the texts of the systems (prepareSvg).
import type { jsPDF } from 'jspdf';
import glyphs from '../data/glyphs.json';
import { runs } from './chars';

/** One embedded TrueType file: Latin or extended Latin, regular, bold or bold italic. */
export type FontKey = 'latin-400' | 'latin-700' | 'latin-700i' | 'ext-400' | 'ext-700' | 'ext-700i';
export const FONT_KEYS: FontKey[] = ['latin-400', 'latin-700', 'latin-700i', 'ext-400', 'ext-700', 'ext-700i'];

/** Each file is registered under its own name, which is also its name in the PDF (so a viewer and the tests tell them apart). */
export const FONT_NAME: Record<FontKey, string> = {
  'latin-400': 'AtkinsonHyperlegible-Regular',
  'latin-700': 'AtkinsonHyperlegible-Bold',
  'latin-700i': 'AtkinsonHyperlegible-BoldItalic',
  'ext-400': 'AtkinsonHyperlegibleExt-Regular',
  'ext-700': 'AtkinsonHyperlegibleExt-Bold',
  'ext-700i': 'AtkinsonHyperlegibleExt-BoldItalic',
};

export type Weight = 400 | 700;

export function fontKey(kind: 'latin' | 'latinExt', weight: Weight, italic: boolean): FontKey {
  if (italic && weight !== 700) throw new Error('only bold italic is embedded');
  return `${kind === 'latin' ? 'latin' : 'ext'}-${weight}${italic ? 'i' : ''}` as FontKey;
}

// ---------------------------------------------------------------------------------------------------------------
// Advance widths, read from the font files (cmap format 4 and hmtx).

interface Metrics { glyphOf: Map<number, number>; advances: number[]; unitsPerEm: number }
const metrics = new Map<FontKey, Metrics>();

function parseMetrics(bytes: ArrayBuffer): Metrics {
  const v = new DataView(bytes);
  const tables = new Map<string, number>();
  for (let i = 0, n = v.getUint16(4); i < n; i++) {
    const at = 12 + 16 * i;
    tables.set(String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3)), v.getUint32(at + 8));
  }
  const table = (tag: string) => {
    const at = tables.get(tag);
    if (at === undefined) throw new Error(`font: no ${tag} table`);
    return at;
  };
  const unitsPerEm = v.getUint16(table('head') + 18);
  const numberOfHMetrics = v.getUint16(table('hhea') + 34);
  const numGlyphs = v.getUint16(table('maxp') + 4);
  const hmtx = table('hmtx');
  const advances: number[] = [];
  for (let g = 0; g < numGlyphs; g++) advances.push(v.getUint16(hmtx + 4 * Math.min(g, numberOfHMetrics - 1)));

  const cmap = table('cmap');
  let sub = -1;
  for (let i = 0, n = v.getUint16(cmap + 2); i < n; i++) {
    const platform = v.getUint16(cmap + 4 + 8 * i);
    const encoding = v.getUint16(cmap + 6 + 8 * i);
    const at = cmap + v.getUint32(cmap + 8 + 8 * i);
    if (v.getUint16(at) === 4 && (platform === 0 || (platform === 3 && encoding === 1))) sub = at;
  }
  if (sub < 0) throw new Error('font: no Unicode cmap of format 4');
  const segs = v.getUint16(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + 2 * segs + 2;
  const deltas = starts + 2 * segs;
  const offsets = deltas + 2 * segs;
  const glyphOf = new Map<number, number>();
  for (let s = 0; s < segs; s++) {
    const end = v.getUint16(ends + 2 * s);
    const start = v.getUint16(starts + 2 * s);
    const delta = v.getInt16(deltas + 2 * s);
    const rangeOffset = v.getUint16(offsets + 2 * s);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let g: number;
      if (rangeOffset === 0) g = (c + delta) & 0xffff;
      else {
        g = v.getUint16(offsets + 2 * s + rangeOffset + 2 * (c - start));
        if (g !== 0) g = (g + delta) & 0xffff;
      }
      if (g !== 0) glyphOf.set(c, g);
    }
  }
  return { glyphOf, advances, unitsPerEm };
}

/** Reads the advance widths of one font file; the engine calls it for every file before any text is laid out. */
export function setFontMetrics(key: FontKey, bytes: ArrayBuffer): void {
  metrics.set(key, parseMetrics(bytes));
}

/** Width of a plain text in one font file, in em. */
function emWidth(key: FontKey, text: string): number {
  const m = metrics.get(key);
  if (!m) throw new Error(`font metrics of ${key} not loaded`);
  let w = 0;
  for (const ch of text) w += m.advances[m.glyphOf.get(ch.codePointAt(0)!) ?? 0];
  return w / m.unitsPerEm;
}

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

function symbolEm(ch: string, weight: Weight): number {
  const shape = SHAPES[ch](weight);
  const [x1, y1, x2, y2] = shape.box;
  return ((x2 - x1) / (y2 - y1)) * (shape.top - shape.bottom) + 2 * SYMBOL_SIDE;
}

// ---------------------------------------------------------------------------------------------------------------
// Layout.

/** A run of text in one style. dx moves the pen before it; dy is its baseline shift (down positive) from the text's baseline. */
export interface Span { text: string; px: number; weight: Weight; italic: boolean; dx: number; dy: number }

export type Piece =
  | { kind: 'text'; font: FontKey; text: string; x: number; dy: number; px: number }
  | { kind: 'symbol'; symbol: string; weight: Weight; x: number; dy: number; px: number };

/** Pieces from the pen at 0, and the natural width. */
export function layoutSpans(spans: Span[]): { pieces: Piece[]; width: number } {
  const pieces: Piece[] = [];
  let pen = 0;
  for (const s of spans) {
    pen += s.dx;
    for (const r of runs(s.text)) {
      if (r.kind === 'symbol') {
        for (const ch of r.text) {
          pieces.push({ kind: 'symbol', symbol: ch, weight: s.weight, x: pen, dy: s.dy, px: s.px });
          pen += symbolEm(ch, s.weight) * s.px;
        }
      } else {
        const font = fontKey(r.kind, s.weight, s.italic);
        const last = pieces.length > 0 ? pieces[pieces.length - 1] : undefined;
        const w = emWidth(font, r.text) * s.px;
        // Text nodes in a row with the same style (a chord's root and quality) are one piece.
        if (last?.kind === 'text' && last.font === font && last.px === s.px && last.dy === s.dy && last.x + emWidth(font, last.text) * s.px === pen) last.text += r.text;
        else pieces.push({ kind: 'text', font, text: r.text, x: pen, dy: s.dy, px: s.px });
        pen += w;
      }
    }
  }
  return { pieces, width: pen };
}

export function textWidth(text: string, px: number, weight: Weight, italic = false): number {
  return layoutSpans([{ text, px, weight, italic, dx: 0, dy: 0 }]).width;
}

export type Anchor = 'start' | 'middle' | 'end';

/** Start x and horizontal scale of a text of natural width `width`, anchored at x, squeezed to `squeezeTo` when given. */
export function placeText(width: number, x: number, anchor: Anchor, squeezeTo?: number): { x0: number; k: number } {
  const k = squeezeTo === undefined || width === 0 ? 1 : squeezeTo / width;
  const w = width * k;
  return { x0: anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x, k };
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing straight onto the PDF.

export interface TextOptions { x: number; y: number; px: number; weight: Weight; italic?: boolean; anchor: Anchor; color: string; squeezeTo?: number }

type Cmd = [string, number[]];

/** Absolute M, L, Q, C and Z commands of an outline (the forms glyphs.json and the shapes above use). */
function parsePath(d: string): Cmd[] {
  const out: Cmd[] = [];
  const re = /([MLQCZ])([^MLQCZ]*)/gi;
  for (const m of d.matchAll(re)) {
    const nums = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    const cmd = m[1].toUpperCase();
    if (cmd !== m[1]) throw new Error('relative path commands are not supported');
    const size = { M: 2, L: 2, Q: 4, C: 6, Z: 0 }[cmd]!;
    if (size === 0) { out.push([cmd, []]); continue; }
    for (let i = 0; i < nums.length; i += size) out.push([i > 0 && cmd === 'M' ? 'L' : cmd, nums.slice(i, i + size)]);
  }
  return out;
}

function fillOutline(pdf: jsPDF, d: string, scale: number, tx: number, ty: number, stroke: number): void {
  const X = (x: number) => tx + x * scale;
  const Y = (y: number) => ty - y * scale;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const [cmd, n] of parsePath(d)) {
    if (cmd === 'M') { pdf.moveTo(X(n[0]), Y(n[1])); [cx, cy, sx, sy] = [n[0], n[1], n[0], n[1]]; }
    else if (cmd === 'L') { pdf.lineTo(X(n[0]), Y(n[1])); [cx, cy] = [n[0], n[1]]; }
    else if (cmd === 'Q') {
      // quadratic to cubic: control points two thirds of the way to the quadratic control point
      const c1x = cx + (2 / 3) * (n[0] - cx), c1y = cy + (2 / 3) * (n[1] - cy);
      const c2x = n[2] + (2 / 3) * (n[0] - n[2]), c2y = n[3] + (2 / 3) * (n[1] - n[3]);
      pdf.curveTo(X(c1x), Y(c1y), X(c2x), Y(c2y), X(n[2]), Y(n[3]));
      [cx, cy] = [n[2], n[3]];
    } else if (cmd === 'C') { pdf.curveTo(X(n[0]), Y(n[1]), X(n[2]), Y(n[3]), X(n[4]), Y(n[5])); [cx, cy] = [n[4], n[5]]; }
    else { pdf.close(); [cx, cy] = [sx, sy]; }
  }
  if (stroke > 0) {
    pdf.setLineWidth(stroke);
    pdf.setLineJoin('round');
    pdf.fillStroke();
  } else pdf.fill();
}

/**
 * Draws a text at (x, y) in the PDF's user unit; px is the font size in the same unit.
 * The fonts it uses must be registered on the PDF first (`fontsOf`).
 */
export function drawText(pdf: jsPDF, text: string, o: TextOptions): void {
  const weight = o.weight;
  const { pieces, width } = layoutSpans([{ text, px: o.px, weight, italic: o.italic ?? false, dx: 0, dy: 0 }]);
  const { x0, k } = placeText(width, o.x, o.anchor, o.squeezeTo);
  pdf.setTextColor(o.color);
  pdf.setFillColor(o.color);
  pdf.setDrawColor(o.color);
  for (const p of pieces) {
    const x = x0 + p.x * k;
    if (p.kind === 'text') {
      pdf.setFont(FONT_NAME[p.font], 'normal');
      pdf.setFontSize(p.px * pdf.internal.scaleFactor);
      pdf.text(p.text, x, o.y + p.dy, k === 1 ? {} : { horizontalScale: k });
    } else {
      if (k !== 1) throw new Error('a squeezed text with symbols is drawn through prepareSvg');
      const s = symbolPlacement(p.symbol, p.weight, x, o.y + p.dy, p.px);
      fillOutline(pdf, s.d, s.scale, s.tx, s.ty, s.stroke);
    }
  }
}

/** The font files a text needs. */
export function fontsOf(text: string, weight: Weight, italic = false): FontKey[] {
  return runs(text).flatMap(r => (r.kind === 'symbol' ? [] : [fontKey(r.kind, weight, italic)]));
}
