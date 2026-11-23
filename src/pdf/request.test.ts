import { sampleDoc } from '../domain/fixture';
import { LOAD_FAILED } from '../loadFailed';
import { PDF_FAILED } from './errors';

const downloadBlob = vi.fn();
vi.mock('../ui/download', () => ({ downloadBlob: (...a: unknown[]) => downloadBlob(...a) }));

const BLOB = new Blob(['%PDF'], { type: 'application/pdf' });
const doc = { ...sampleDoc('asax'), title: 'Auld Lang Syne' };
const input = { inst: 'asax', scale: { tonic: 'C' }, scaleName: 'major' } as never;

/** Loads request.ts afresh with the engine modules replaced by the given makers (or an import that fails). */
async function load(opts: { sheet?: (...a: unknown[]) => unknown; scale?: (...a: unknown[]) => unknown; importFails?: boolean }) {
  vi.resetModules();
  if (opts.importFails) {
    vi.doMock('./sheetPdf', () => { throw new Error('Failed to fetch dynamically imported module'); });
    vi.doMock('./scalePdf', () => { throw new Error('Failed to fetch dynamically imported module'); });
  } else {
    vi.doMock('./sheetPdf', () => ({ makeSheetPdf: opts.sheet ?? (async () => BLOB) }));
    vi.doMock('./scalePdf', () => ({ makeScalePdf: opts.scale ?? (async () => BLOB) }));
  }
  return import('./request');
}
const abortError = () => new DOMException('cancelled', 'AbortError');

beforeEach(() => downloadBlob.mockClear());

describe('requestSheetPdf', () => {
  it('builds with the browser language and downloads under the sheet name', async () => {
    const sheet = vi.fn(async () => BLOB);
    vi.stubGlobal('navigator', { language: 'en-US' });
    const { requestSheetPdf } = await load({ sheet });
    const onProgress = vi.fn();
    const signal = new AbortController().signal;
    await requestSheetPdf(doc, { onProgress, signal });
    expect(sheet).toHaveBeenCalledWith(doc, { language: 'en-US', onProgress, signal });
    expect(downloadBlob).toHaveBeenCalledWith('auld-lang-syne-alto-sax.pdf', BLOB);
    vi.unstubAllGlobals();
  });
  it('an untitled sheet is named "sheet"', async () => {
    const { requestSheetPdf } = await load({});
    await requestSheetPdf({ ...doc, title: '' }, {});
    expect(downloadBlob).toHaveBeenCalledWith('sheet-alto-sax.pdf', BLOB);
  });
  it('tolerates a browser without a language', async () => {
    const sheet = vi.fn(async () => BLOB);
    vi.stubGlobal('navigator', {});
    const { requestSheetPdf } = await load({ sheet });
    await requestSheetPdf(doc, {});
    expect(sheet).toHaveBeenCalledWith(doc, expect.objectContaining({ language: '' }));
    vi.unstubAllGlobals();
  });
  it('a failed import becomes the load message', async () => {
    const { requestSheetPdf } = await load({ importFails: true });
    await expect(requestSheetPdf(doc, {})).rejects.toMatchObject({ name: 'PdfError', userMessage: LOAD_FAILED });
    expect(downloadBlob).not.toHaveBeenCalled();
  });
  it('a PdfError passes unchanged', async () => {
    let e: Error | undefined;
    const { requestSheetPdf } = await load({ sheet: async () => { e = new (await import('./errors')).PdfError('The PDF can\'t show these characters: д. Use Print instead.'); throw e; } });
    const caught = await requestSheetPdf(doc, {}).catch((x: unknown) => x);
    expect(caught).toBe(e);
  });
  it('another error becomes the generic message', async () => {
    const { requestSheetPdf } = await load({ sheet: async () => { throw new TypeError('x'); } });
    await expect(requestSheetPdf(doc, {})).rejects.toMatchObject({ name: 'PdfError', userMessage: PDF_FAILED });
    expect(downloadBlob).not.toHaveBeenCalled();
  });
  it('an abort is silent and downloads nothing', async () => {
    const { requestSheetPdf } = await load({ sheet: async () => { throw abortError(); } });
    await expect(requestSheetPdf(doc, {})).resolves.toBeUndefined();
    expect(downloadBlob).not.toHaveBeenCalled();
  });
  it('a signal that fires after the build downloads nothing', async () => {
    const ctl = new AbortController();
    const { requestSheetPdf } = await load({ sheet: async () => { ctl.abort(); return BLOB; } });
    await requestSheetPdf(doc, { signal: ctl.signal });
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});

describe('requestScalePdf', () => {
  it('downloads under key, scale and instrument', async () => {
    const scale = vi.fn(async () => BLOB);
    const { requestScalePdf } = await load({ scale });
    await requestScalePdf(input, {});
    expect(scale).toHaveBeenCalledWith(input, expect.objectContaining({ language: expect.any(String) }));
    expect(downloadBlob).toHaveBeenCalledWith('c-major-alto-sax.pdf', BLOB);
  });
  it('maps errors like the sheet request', async () => {
    const failed = await load({ importFails: true });
    await expect(failed.requestScalePdf(input, {})).rejects.toMatchObject({ userMessage: LOAD_FAILED });
    const other = await load({ scale: async () => { throw new Error('x'); } });
    await expect(other.requestScalePdf(input, {})).rejects.toMatchObject({ userMessage: PDF_FAILED });
    const aborted = await load({ scale: async () => { throw abortError(); } });
    await expect(aborted.requestScalePdf(input, {})).resolves.toBeUndefined();
  });
});
