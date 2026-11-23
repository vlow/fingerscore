// The only module that touches the PDF libraries: fonts, pages, SVG conversion, off-screen rendering, yielding.
import { jsPDF } from 'jspdf';
import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { svg2pdf } from 'svg2pdf.js';
import { LOAD_FAILED } from '../loadFailed';
import { drawText, FONT_KEYS, FONT_NAME, fontsOf, setFontMetrics, textWidth, type Anchor, type FontKey, type Weight } from './drawText';
import { PdfError } from './errors';
import { fitText, footerText, MARGIN_MM, UNITS, unitMm, type PageSize } from './pageModel';
import latin400 from './fonts/atkinson-hyperlegible-latin-400-normal.ttf?url';
import latin700 from './fonts/atkinson-hyperlegible-latin-700-normal.ttf?url';
import latin700i from './fonts/atkinson-hyperlegible-latin-700-italic.ttf?url';
import ext400 from './fonts/atkinson-hyperlegible-latin-ext-400-normal.ttf?url';
import ext700 from './fonts/atkinson-hyperlegible-latin-ext-700-normal.ttf?url';
import ext700i from './fonts/atkinson-hyperlegible-latin-ext-700-italic.ttf?url';

const FONT_URL: Record<FontKey, string> = {
  'latin-400': latin400, 'latin-700': latin700, 'latin-700i': latin700i,
  'ext-400': ext400, 'ext-700': ext700, 'ext-700i': ext700i,
};
const KEY_OF_NAME = new Map(FONT_KEYS.map(k => [FONT_NAME[k], k]));

function binaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

let loading: Promise<Map<FontKey, string>> | null = null;

/** Fetches the six font files once and reads their advance widths; a failed fetch is retried on the next call. */
export function loadFonts(): Promise<Map<FontKey, string>> {
  loading ??= Promise.all(FONT_KEYS.map(async key => {
    let res: Response;
    try { res = await fetch(FONT_URL[key]); } catch { throw new PdfError(LOAD_FAILED); }
    if (!res.ok) throw new PdfError(LOAD_FAILED);
    const bytes = await res.arrayBuffer();
    setFontMetrics(key, bytes);
    return [key, binaryString(bytes)] as const;
  })).then(entries => new Map(entries), e => { loading = null; throw e; });
  return loading;
}

/** A PDF and the font files registered on it; only registered files are embedded. */
export interface Pdf { doc: jsPDF; size: PageSize; fonts: Map<FontKey, string>; registered: Set<FontKey> }

export function newPdf(size: PageSize, fonts: Map<FontKey, string>, props: { title: string; subject: string }): Pdf {
  const doc = new jsPDF({ unit: 'mm', format: [size.widthMm, size.heightMm], orientation: 'portrait', compress: true });
  doc.setProperties({ title: props.title, subject: props.subject, creator: 'fingerscore' });
  return { doc, size, fonts, registered: new Set() };
}

export function registerFonts(pdf: Pdf, keys: Iterable<FontKey>): void {
  for (const key of keys) {
    if (pdf.registered.has(key)) continue;
    const file = `${FONT_NAME[key]}.ttf`;
    pdf.doc.addFileToVFS(file, pdf.fonts.get(key)!);
    pdf.doc.addFont(file, FONT_NAME[key], 'normal');
    pdf.registered.add(key);
  }
}

/** Page position in mm of a point given in units from the top-left corner of the content box. */
export function pageMm(size: PageSize, x: number, y: number): { x: number; y: number } {
  const u = unitMm(size);
  return { x: MARGIN_MM + x * u, y: MARGIN_MM + y * u };
}

/** Converts a prepared SVG of `width` × `height` units with its top-left corner at (x, y) units of the content box. */
export async function drawSvg(pdf: Pdf, svg: SVGSVGElement, x: number, y: number, width: number, height: number): Promise<void> {
  const names = new Set(Array.from(svg.querySelectorAll('text'), t => t.getAttribute('font-family') ?? ''));
  registerFonts(pdf, [...names].map(n => {
    const key = KEY_OF_NAME.get(n);
    if (!key) throw new Error(`text in font "${n}" was not prepared`);
    return key;
  }));
  const u = unitMm(pdf.size);
  const at = pageMm(pdf.size, x, y);
  await svg2pdf(svg, pdf.doc, { x: at.x, y: at.y, width: width * u, height: height * u });
}

/** Renders React content into a container off screen (in the document, as svg2pdf needs); remove it with `dispose`. */
export function renderOffscreen(content: ReactElement): { host: HTMLElement; dispose(): void } {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-100000px;top:0;width:860px;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(content));
  return { host, dispose: () => { root.unmount(); host.remove(); } };
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('The PDF was cancelled.', 'AbortError');
}

/** Lets the browser handle input and paint, then checks the signal. */
export async function nextTurn(signal: AbortSignal | undefined): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  throwIfAborted(signal);
}

// Paper colours (src/styles/tokens.css) and sizes in units (src/render/Paper.module.css), shared by the sheet and the scale page.
export const INK = '#15171c';
export const TEXT = '#2a2d33';
export const MUTED = '#5b616e';
const BORDER = '#e2e4e8';
/** Legend: a rule 12 units below the last block, the first line 12 units below the rule. */
export const LEGEND = { px: 11, line: 16, baseline: 12, rule: 12, top: 25 };
const FOOTER_PX = 10;
const FOOTER_BOTTOM_MM = 5;
export const SITE = 'fingerscore.eu';

/** HTML collapses runs of white space; the PDF writes the legend as the paper shows it. */
export const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

export const width = (weight: Weight) => (text: string, px: number) => textWidth(text, px, weight);

/** Draws a text at x, baseline y in units of the content box; px in units. */
export function text(pdf: Pdf, s: string, x: number, y: number, px: number, weight: Weight, anchor: Anchor, color: string): void {
  registerFonts(pdf, fontsOf(s, weight));
  const u = unitMm(pdf.size);
  const at = pageMm(pdf.size, x, y);
  drawText(pdf.doc, s, { x: at.x, y: at.y, px: px * u, weight, anchor, color });
}

/** The legend block at y: the rule, the wrapped lines and the site, right-aligned on the last line or on a line of its own. */
export function drawLegend(pdf: Pdf, y: number, legend: { lines: string[]; footerOwnLine: boolean }): void {
  const u = unitMm(pdf.size);
  const rule = pageMm(pdf.size, 0, y + LEGEND.rule);
  pdf.doc.setFillColor(BORDER);
  pdf.doc.rect(rule.x, rule.y, UNITS * u, u, 'F');
  const { lines, footerOwnLine } = legend;
  const baseline = (i: number) => y + LEGEND.top + LEGEND.line * i + LEGEND.baseline;
  lines.forEach((line, i) => text(pdf, line, 0, baseline(i), LEGEND.px, 400, 'start', MUTED));
  text(pdf, SITE, UNITS, baseline(footerOwnLine ? lines.length : lines.length - 1), LEGEND.px, 400, 'end', MUTED);
}

/** The page footer "{title} · page n of N" in the bottom margin; nothing for a one-page PDF. */
export function drawFooter(pdf: Pdf, title: string, page: number, pages: number): void {
  const full = footerText(title, page, pages);
  if (full === null) return;
  // A title too long for the line is cut so that the page number stays.
  const tail = footerText('', page, pages)!;
  const room = UNITS - textWidth(` · ${tail}`, FOOTER_PX, 400);
  const cut = title === '' ? '' : fitText(title, width(400), room, FOOTER_PX, FOOTER_PX).text;
  const s = footerText(cut, page, pages)!;
  const yUnits = (pdf.size.heightMm - FOOTER_BOTTOM_MM - MARGIN_MM) / unitMm(pdf.size);
  text(pdf, s, UNITS / 2, yUnits, FOOTER_PX, 400, 'middle', MUTED);
}

/** Draws a prepared SVG of `width` × `height` units at y, shrunk by `scale` (< 1 for a block taller than a page) and centred in the content width. */
export async function drawSvgScaled(pdf: Pdf, svg: SVGSVGElement, y: number, width: number, height: number, scale: number): Promise<void> {
  const w = width * scale;
  await drawSvg(pdf, svg, (UNITS - w) / 2, y, w, height * scale);
}
