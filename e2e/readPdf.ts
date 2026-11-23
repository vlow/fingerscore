// Reads a PDF back for the tests, with pdfjs-dist in Node (development dependency only).
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfText { str: string; x: number; y: number; width: number }
export interface PdfPage { width: number; height: number; text: PdfText[] }

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** m1 then m2, as PDF concatenates matrices. */
const times = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3],
  m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
  m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
];
interface Glyph { unicode: string; width: number }

/**
 * Pages with their size and text items, and the names of the embedded fonts the pages use.
 * One item per text-showing operator, read from pdfjs's operator list: pdfjs's own text content joins
 * neighbouring pieces of a line into one item, which hides where each piece starts.
 * Units are PDF points; x and y are the start of an item's baseline, measured from the page's top-left corner;
 * width runs to the end of the last glyph's advance.
 */
export async function readPdf(bytes: Uint8Array): Promise<{ pages: PdfPage[]; fonts: string[] }> {
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
      const stack: Matrix[] = [];
      let ctm = IDENTITY;
      let tm = IDENTITY;
      let size = 0, charSpacing = 0, wordSpacing = 0, hScale = 1;
      ops.fnArray.forEach((fn, i) => {
        const args = ops.argsArray[i] as unknown[];
        switch (fn) {
          case OPS.save: stack.push(ctm); break;
          case OPS.restore: ctm = stack.pop() ?? IDENTITY; break;
          case OPS.transform: ctm = times(args as Matrix, ctm); break;
          case OPS.beginText: tm = IDENTITY; break;
          case OPS.setTextMatrix: tm = Array.from(args[0] as ArrayLike<number>) as Matrix; break;
          case OPS.moveText: tm = times([1, 0, 0, 1, args[0] as number, args[1] as number], tm); break;
          case OPS.setCharSpacing: charSpacing = args[0] as number; break;
          case OPS.setWordSpacing: wordSpacing = args[0] as number; break;
          case OPS.setHScale: hScale = (args[0] as number) / 100; break;
          case OPS.setFont: {
            size = args[1] as number;
            const font = page.commonObjs.get(args[0] as string) as { name?: string; missingFile?: boolean };
            if (font.name && !font.missingFile) fonts.add(font.name);
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
            const m = times(tm, ctm);
            if (str !== '') text.push({ str, x: m[4], y: height - m[5], width: inkEnd * Math.hypot(m[0], m[1]) });
            tm = times([1, 0, 0, 1, advance, 0], tm);
            break;
          }
        }
      });
      pages.push({ width, height, text });
    }
  } finally {
    await task.destroy();
  }
  return { pages, fonts: [...fonts] };
}

/** One page rendered to a PNG at `dpi` (pdfjs with its Node canvas, @napi-rs/canvas), for looking at it. */
export async function renderPdfPage(bytes: Uint8Array, pageNumber: number, dpi: number): Promise<Buffer> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const factory = doc.canvasFactory as { create(w: number, h: number): { canvas: { toBuffer(type: string): Buffer } } };
    const { canvas } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport, background: '#ffffff' }).promise;
    return canvas.toBuffer('image/png');
  } finally {
    await task.destroy();
  }
}
