// Text for the PDF: measured with the font file that draws each piece, symbols the font lacks drawn as outlines.
// The same layout feeds the page parts (drawn straight onto the PDF) and the texts of the systems (prepareSvg).
import type { jsPDF } from 'jspdf';
import { runs } from './chars';
import { emInk, emWidth, fontKey, FONT_NAME, type FontKey, type Weight } from './fontMetrics';
import { symbolEm, symbolInk, symbolPlacement } from './symbols';

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

/** Fills an outline (y up) scaled by sx, sy and moved to tx, ty; stroke > 0 also strokes it in the fill colour. */
function fillOutline(pdf: jsPDF, d: string, sx: number, sy: number, tx: number, ty: number, stroke: number): void {
  const X = (x: number) => tx + x * sx;
  const Y = (y: number) => ty - y * sy;
  let cx = 0, cy = 0, mx = 0, my = 0;
  for (const [cmd, n] of parsePath(d)) {
    if (cmd === 'M') { pdf.moveTo(X(n[0]), Y(n[1])); [cx, cy, mx, my] = [n[0], n[1], n[0], n[1]]; }
    else if (cmd === 'L') { pdf.lineTo(X(n[0]), Y(n[1])); [cx, cy] = [n[0], n[1]]; }
    else if (cmd === 'Q') {
      // quadratic to cubic: control points two thirds of the way to the quadratic control point
      const c1x = cx + (2 / 3) * (n[0] - cx), c1y = cy + (2 / 3) * (n[1] - cy);
      const c2x = n[2] + (2 / 3) * (n[0] - n[2]), c2y = n[3] + (2 / 3) * (n[1] - n[3]);
      pdf.curveTo(X(c1x), Y(c1y), X(c2x), Y(c2y), X(n[2]), Y(n[3]));
      [cx, cy] = [n[2], n[3]];
    } else if (cmd === 'C') { pdf.curveTo(X(n[0]), Y(n[1]), X(n[2]), Y(n[3]), X(n[4]), Y(n[5])); [cx, cy] = [n[4], n[5]]; }
    else { pdf.close(); [cx, cy] = [mx, my]; }
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
      // A squeezed text scales its outlines horizontally with it, from the text's start.
      const s = symbolPlacement(p.symbol, p.weight, p.x, o.y + p.dy, p.px);
      fillOutline(pdf, s.d, s.scale * k, s.scale, x0 + s.tx * k, s.ty, s.stroke);
    }
  }
}

/** Ink box of laid-out pieces, from the pen at 0 on the baseline, y down; null when nothing is inked. */
export function piecesInk(pieces: Piece[]): { x1: number; y1: number; x2: number; y2: number } | null {
  let box: { x1: number; y1: number; x2: number; y2: number } | null = null;
  const add = (b: { x1: number; y1: number; x2: number; y2: number }) => {
    box = box ? { x1: Math.min(box.x1, b.x1), y1: Math.min(box.y1, b.y1), x2: Math.max(box.x2, b.x2), y2: Math.max(box.y2, b.y2) } : b;
  };
  for (const p of pieces) {
    if (p.kind === 'text') {
      const e = emInk(p.font, p.text);
      if (e) add({ x1: p.x + e.x1 * p.px, x2: p.x + e.x2 * p.px, y1: p.dy - e.y2 * p.px, y2: p.dy - e.y1 * p.px });
    } else add(symbolInk(p.symbol, p.weight, p.x, p.dy, p.px));
  }
  return box;
}

/** The font files a text needs. */
export function fontsOf(text: string, weight: Weight, italic = false): FontKey[] {
  return runs(text).flatMap(r => (r.kind === 'symbol' ? [] : [fontKey(r.kind, weight, italic)]));
}
