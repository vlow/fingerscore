// Reads a PDF back for the tests, with pdfjs-dist in Node (development dependency only).
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfText { str: string; x: number; y: number; width: number; font: string }
/** A painted path: its bounding box (a stroke's half line width included) and its fill and stroke colours, null when not painted. */
export interface PdfPath { x1: number; y1: number; x2: number; y2: number; fill: string | null; stroke: string | null }
export interface PdfPage { width: number; height: number; text: PdfText[]; paths: PdfPath[] }
export interface PdfInfo { pages: PdfPage[]; fonts: string[]; embeddedFonts: string[] }

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** m1 then m2, as PDF concatenates matrices. */
const times = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3],
  m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
  m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
interface Glyph { unicode: string; width: number }
interface GState { ctm: Matrix; fill: string; stroke: string; lineWidth: number }

const FILLS = new Set<number>([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const STROKES = new Set<number>([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

/**
 * Names of the fonts whose file is embedded (a FontDescriptor with /FontFile2), read from the raw bytes.
 * jsPDF writes its objects uncompressed, so the descriptors are plain text.
 */
function embeddedFontNames(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes).toString('latin1');
  const names = new Set<string>();
  for (const m of raw.matchAll(/\/FontName\s*\/([^\s/<>[\]()]+)[^>]*?\/FontFile2/g)) {
    names.add(m[1].replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))));
  }
  return [...names].sort();
}

/**
 * Pages with their size, text items and painted paths; the names of the fonts the pages set; the names of the embedded font files.
 * One text item per text-showing operator, read from pdfjs's operator list: pdfjs's own text content joins
 * neighbouring pieces of a line into one item, which hides where each piece starts.
 * Units are PDF points, measured from the page's top-left corner. A text's x and y are the start of its baseline;
 * its width runs to the end of the last glyph's advance.
 */
export async function readPdf(bytes: Uint8Array): Promise<PdfInfo> {
  // pdfjs takes ownership of the buffer it is given; pass a copy.
  const task = getDocument({ data: bytes.slice(), fontExtraProperties: true, useSystemFonts: false });
  const pages: PdfPage[] = [];
  const fonts = new Set<string>();
  try {
    const doc = await task.promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      const text: PdfText[] = [];
      const paths: PdfPath[] = [];
      const stack: GState[] = [];
      let gs: GState = { ctm: IDENTITY, fill: '#000000', stroke: '#000000', lineWidth: 1 };
      let tm = IDENTITY;
      let size = 0, charSpacing = 0, wordSpacing = 0, hScale = 1;
      let font = '';
      ops.fnArray.forEach((fn, i) => {
        const args = ops.argsArray[i] as unknown[];
        switch (fn) {
          case OPS.save: stack.push(gs); gs = { ...gs }; break;
          case OPS.restore: gs = stack.pop() ?? gs; break;
          case OPS.transform: gs.ctm = times(args as Matrix, gs.ctm); break;
          case OPS.setFillRGBColor: gs.fill = args[0] as string; break;
          case OPS.setStrokeRGBColor: gs.stroke = args[0] as string; break;
          case OPS.setLineWidth: gs.lineWidth = args[0] as number; break;
          case OPS.beginText: tm = IDENTITY; break;
          case OPS.setTextMatrix: tm = Array.from(args[0] as ArrayLike<number>) as Matrix; break;
          case OPS.moveText: tm = times([1, 0, 0, 1, args[0] as number, args[1] as number], tm); break;
          case OPS.setCharSpacing: charSpacing = args[0] as number; break;
          case OPS.setWordSpacing: wordSpacing = args[0] as number; break;
          case OPS.setHScale: hScale = (args[0] as number) / 100; break;
          case OPS.setFont: {
            size = args[1] as number;
            const f = page.commonObjs.get(args[0] as string) as { name?: string; missingFile?: boolean };
            font = f.name ?? '';
            if (f.name && !f.missingFile) fonts.add(f.name);
            break;
          }
          case OPS.showText: {
            let str = '';
            let advance = 0;     // text space units
            let inkEnd = 0;
            for (const g of args[0] as (Glyph | number)[]) {
              if (typeof g === 'number') { advance -= (g / 1000) * size * hScale; continue; }
              str += g.unicode;
              inkEnd = advance + (g.width / 1000) * size * hScale;
              advance = inkEnd + (charSpacing + (g.unicode === ' ' ? wordSpacing : 0)) * hScale;
            }
            const m = times(tm, gs.ctm);
            if (str !== '') text.push({ str, x: m[4], y: height - m[5], width: inkEnd * Math.hypot(m[0], m[1]), font });
            tm = times([1, 0, 0, 1, advance, 0], tm);
            break;
          }
          case OPS.constructPath: {
            const paint = args[0] as number;
            const box = args[2] as ArrayLike<number> | null;
            const filled = FILLS.has(paint);
            const stroked = STROKES.has(paint);
            if (!box || (!filled && !stroked)) break;
            const corners = [apply(gs.ctm, box[0], box[1]), apply(gs.ctm, box[2], box[1]), apply(gs.ctm, box[0], box[3]), apply(gs.ctm, box[2], box[3])];
            const xs = corners.map(c => c[0]);
            const ys = corners.map(c => height - c[1]);
            const half = stroked ? (gs.lineWidth * Math.hypot(gs.ctm[0], gs.ctm[1])) / 2 : 0;
            paths.push({
              x1: Math.min(...xs) - half, x2: Math.max(...xs) + half, y1: Math.min(...ys) - half, y2: Math.max(...ys) + half,
              fill: filled ? gs.fill : null, stroke: stroked ? gs.stroke : null,
            });
            break;
          }
        }
      });
      pages.push({ width, height, text, paths });
    }
  } finally {
    await task.destroy();
  }
  return { pages, fonts: [...fonts].sort(), embeddedFonts: embeddedFontNames(bytes) };
}

interface NodeCanvas { toBuffer(type: string): Buffer; getContext(type: '2d'): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } }

async function render<T>(bytes: Uint8Array, pageNumber: number, dpi: number, use: (canvas: NodeCanvas, width: number, height: number) => T): Promise<T> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const factory = doc.canvasFactory as { create(w: number, h: number): { canvas: NodeCanvas } };
    const { canvas } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport, background: '#ffffff' }).promise;
    return use(canvas, Math.ceil(viewport.width), Math.ceil(viewport.height));
  } finally {
    await task.destroy();
  }
}

/** One page rendered to a PNG at `dpi` (pdfjs with its Node canvas, @napi-rs/canvas), for looking at it. */
export async function renderPdfPage(bytes: Uint8Array, pageNumber: number, dpi: number): Promise<Buffer> {
  return render(bytes, pageNumber, dpi, canvas => canvas.toBuffer('image/png'));
}

/** One page rendered at `dpi` as RGBA pixels, row by row from the top-left corner. */
export async function renderPdfPixels(bytes: Uint8Array, pageNumber: number, dpi: number): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  return render(bytes, pageNumber, dpi, (canvas, width, height) => ({ width, height, data: canvas.getContext('2d').getImageData(0, 0, width, height).data }));
}
