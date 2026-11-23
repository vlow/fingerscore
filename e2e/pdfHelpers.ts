// Helpers for reading a PDF in the PDF content tests. e2e/pdf-content.spec.ts still has its own copies of
// MM, MARGIN, unitOf, lineOf, expectSymbolBetween and expectInside and could import these instead.
import { expect } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfPage, PdfText } from './readPdf';

/** PDF points per millimetre; the 12 mm margin; per unit of the 860-unit width between the margins. */
export const MM = 72 / 25.4;
export const MARGIN = 12 * MM;
export const unitOf = (p: PdfPage) => (p.width - 2 * MARGIN) / 860;

/** The items on the baseline of the exact item `str`, left to right. */
export function lineOf(p: PdfPage, str: string): PdfText[] {
  const item = p.text.find(t => t.str === str);
  expect(item, `text item "${str}"`).toBeDefined();
  return p.text.filter(t => Math.abs(t.y - item!.y) < 0.3).sort((a, b) => a.x - b.x);
}

/** A symbol outline: a filled path inside the gap between two neighbouring items of a line. */
export function expectSymbolBetween(p: PdfPage, left: PdfText, right: PdfText | null, em: number): void {
  const from = left.x + left.width;
  const to = right ? right.x : from + 1.2 * em;
  expect(to - from, `gap after "${left.str}"`).toBeGreaterThan(0.2 * em);
  const ink = p.paths.filter(q => q.fill !== null && q.x1 >= from - 0.01 && q.x2 <= to + 0.01
    && q.y2 > left.y - 1.2 * em && q.y1 < left.y + 0.5 * em && q.x2 - q.x1 > 0.1);
  expect(ink.length, `symbol outline between "${left.str}" and "${right?.str ?? '(end)'}"`).toBeGreaterThan(0);
}

export function expectInside(p: PdfPage, x1: number, y1: number, x2: number, y2: number, what: string): void {
  const eps = 0.01;
  expect(x1, what).toBeGreaterThanOrEqual(MARGIN - eps);
  expect(x2, what).toBeLessThanOrEqual(p.width - MARGIN + eps);
  expect(y1, what).toBeGreaterThanOrEqual(MARGIN - eps);
  expect(y2, what).toBeLessThanOrEqual(p.height - MARGIN + eps);
}

/** The document's Title property. */
export async function pdfTitle(bytes: Uint8Array): Promise<string | undefined> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false });
  try {
    const doc = await task.promise;
    const { info } = await doc.getMetadata();
    return (info as { Title?: string }).Title;
  } finally {
    await task.destroy();
  }
}
