// Turns a system drawn by the app into an SVG that svg2pdf converts as it looks on screen (Task 1's feature record).
import { FONT_NAME, layoutSpans, placeText, symbolPlacement, type Anchor, type Span, type Weight } from './drawText';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Nearest value of a presentation attribute on the element or its ancestors. */
function inherited(el: Element, name: string): string | null {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const v = e.getAttribute(name);
    if (v !== null) return v;
  }
  return null;
}

function styleOf(el: Element): { px: number; weight: Weight; italic: boolean } {
  const size = inherited(el, 'font-size');
  if (size === null || !(Number(size) > 0)) throw new Error(`text "${el.textContent ?? ''}" has no font size`);
  const w = inherited(el, 'font-weight') ?? '400';
  const weight: Weight = w === 'bold' || Number(w) >= 600 ? 700 : 400;
  return { px: Number(size), weight, italic: inherited(el, 'font-style') === 'italic' };
}

/** The text's runs in document order, with each tspan's size, weight, dx and accumulated dy. */
function spansOf(text: SVGTextElement): Span[] {
  const spans: Span[] = [];
  let dy = 0;
  const visit = (owner: Element) => {
    let first = true;
    for (const node of Array.from(owner.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        let dx = 0;
        if (first && owner !== text) {
          dx = Number(owner.getAttribute('dx') ?? 0);
          dy += Number(owner.getAttribute('dy') ?? 0);
        }
        spans.push({ text: node.textContent ?? '', ...styleOf(owner), dx, dy });
      } else if (node instanceof Element && node.localName === 'tspan') visit(node);
      first = false;
    }
  };
  visit(text);
  return spans;
}

const svgEl = (name: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/**
 * A group of start-anchored pieces, each in the font file that has its characters or a symbol outline,
 * placed and squeezed as the browser draws the text.
 */
function piecesGroup(spans: Span[], x: number, y: number, anchor: Anchor, squeezeTo: number | undefined, paint: Record<string, string>): SVGGElement {
  const { pieces, width } = layoutSpans(spans);
  const { x0, k } = placeText(width, x, anchor, squeezeTo);
  const g = svgEl('g', { transform: `translate(${x0} ${y})${k === 1 ? '' : ` scale(${k} 1)`}`, ...paint }) as SVGGElement;
  for (const p of pieces) {
    if (p.kind === 'text') {
      const t = svgEl('text', {
        x: p.x, y: p.dy, 'font-family': FONT_NAME[p.font], 'font-size': p.px, 'font-weight': 400, 'font-style': 'normal',
        'text-anchor': 'start', 'xml:space': 'preserve',
      });
      t.textContent = p.text;
      g.appendChild(t);
    } else {
      const s = symbolPlacement(p.symbol, p.weight, p.x, p.dy, p.px);
      const path = svgEl('path', { d: s.d, transform: `translate(${s.tx} ${s.ty}) scale(${s.scale} ${-s.scale})` });
      // a halo's stroke width is given in the text's units; the outline is drawn scaled
      if (paint['stroke-width'] !== undefined) path.setAttribute('stroke-width', String((Number(paint['stroke-width']) + s.stroke) / s.scale));
      else if (s.stroke > 0) {
        path.setAttribute('stroke', paint.fill);
        path.setAttribute('stroke-width', String(s.stroke / s.scale));
        path.setAttribute('stroke-linejoin', 'round');
      }
      g.appendChild(path);
    }
  }
  return g;
}

/** Replaces one text by its pieces; a white halo (paint-order="stroke") becomes a stroked copy under the plain fill. */
function replaceText(text: SVGTextElement): void {
  const spans = spansOf(text);
  const x = Number(text.getAttribute('x') ?? 0);
  const y = Number(text.getAttribute('y') ?? 0);
  const anchor = (inherited(text, 'text-anchor') ?? 'start') as Anchor;
  const length = text.getAttribute('textLength');
  const squeezeTo = length === null ? undefined : Number(length);
  const fill = inherited(text, 'fill') ?? '#000';
  const out = document.createDocumentFragment();
  const stroke = text.getAttribute('stroke');
  if (text.getAttribute('paint-order') === 'stroke' && stroke !== null) {
    out.appendChild(piecesGroup(spans, x, y, anchor, squeezeTo, {
      fill: stroke, stroke, 'stroke-width': text.getAttribute('stroke-width') ?? '1', 'stroke-linejoin': text.getAttribute('stroke-linejoin') ?? 'miter',
    }));
  }
  const g = piecesGroup(spans, x, y, anchor, squeezeTo, { fill, stroke: 'none' });
  for (const a of Array.from(text.attributes)) if (a.name.startsWith('data-')) g.setAttribute(a.name, a.value);
  out.appendChild(g);
  text.replaceWith(out);
}

/**
 * Prepares a system's SVG for svg2pdf:
 * - ink outside the box is not clipped (overflow visible);
 * - the selection and playback marks, everything marked not to print and the transparent click areas go;
 * - every text becomes pieces drawn from the embedded font files (each registered under its own name) and
 *   symbol outlines, placed with the files' own advance widths, so anchor, squeeze and raised extensions
 *   come out as on screen.
 */
export function prepareSvg(svg: SVGSVGElement): void {
  svg.setAttribute('overflow', 'visible');
  svg.querySelectorAll('[data-mark], [data-print-hide], [fill="transparent"], title').forEach(e => e.remove());
  svg.querySelectorAll('text').forEach(t => replaceText(t));
}
