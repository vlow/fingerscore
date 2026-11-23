// The only module that touches the PDF libraries: fonts, pages, SVG conversion, off-screen rendering, yielding.
import { jsPDF } from 'jspdf';
import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { svg2pdf } from 'svg2pdf.js';
import { LOAD_FAILED } from '../loadFailed';
import { FONT_KEYS, FONT_NAME, setFontMetrics, type FontKey } from './drawText';
import { PdfError } from './errors';
import { MARGIN_MM, unitMm, type PageSize } from './pageModel';
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
