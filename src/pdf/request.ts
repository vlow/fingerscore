// The pages' only static import from src/pdf/: loads the engine on first use, builds the PDF and downloads it.
// Type-only imports of the engine files are erased, so the PDF libraries stay out of the entry chunk.
import { inst } from '../domain/instruments';
import type { Doc } from '../domain/types';
import { LOAD_FAILED } from '../shell/loadFailed';
import { lazyModule } from '../shell/lazy';
import { downloadBlob } from '../ui/download';
import { PDF_FAILED, PdfError } from './errors';
import { scalePdfName, sheetPdfName } from './names';
import type { ScalePdfInput } from './scalePdf';

export interface PdfRequestOptions { onProgress?(page: number, pages: number): void; signal?: AbortSignal }

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** The engines, each its own chunk with the PDF libraries; Download PDF prefetches them on pointer enter or focus. */
export const sheetPdfModule = lazyModule(() => import('./sheetPdf'));
export const scalePdfModule = lazyModule(() => import('./scalePdf'));

/** Loads an engine; a failed fetch of its chunk is a load failure. */
async function load<T>(m: { load(): Promise<T> }): Promise<T> {
  try { return await m.load(); } catch { throw new PdfError(LOAD_FAILED); }
}

/** Runs the build and downloads the result. An abort ends silently; a PdfError passes; anything else is the generic failure. */
async function run(make: () => Promise<Blob>, name: string, signal: AbortSignal | undefined): Promise<void> {
  let blob: Blob;
  try {
    blob = await make();
  } catch (e) {
    if (isAbort(e)) return;
    throw e instanceof PdfError ? e : new PdfError(PDF_FAILED);
  }
  if (signal?.aborted) return;
  downloadBlob(name, blob);
}

const language = () => (typeof navigator === 'undefined' ? undefined : navigator.language) ?? '';

export async function requestSheetPdf(doc: Doc, o: PdfRequestOptions): Promise<void> {
  const { makeSheetPdf } = await load(sheetPdfModule);
  await run(() => makeSheetPdf(doc, { language: language(), onProgress: o.onProgress, signal: o.signal }),
    sheetPdfName(doc.title, inst(doc.inst).name), o.signal);
}

export async function requestScalePdf(input: ScalePdfInput, o: PdfRequestOptions): Promise<void> {
  const { makeScalePdf } = await load(scalePdfModule);
  await run(() => makeScalePdf(input, { language: language(), onProgress: o.onProgress, signal: o.signal }),
    scalePdfName(input.scale.tonic, input.scaleName, inst(input.inst).name), o.signal);
}
