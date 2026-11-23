import { LOAD_FAILED } from '../loadFailed';

// The engine imports the PDF libraries, which need a real browser; fonts are all this file touches.
vi.mock('jspdf', () => ({ jsPDF: class {} }));
vi.mock('svg2pdf.js', () => ({ svg2pdf: async () => {} }));

async function fresh() {
  vi.resetModules();
  return (await import('./engine')).loadFonts;
}
const reply = (body: BodyInit | null, init?: ResponseInit) => async () => new Response(body, init);

afterEach(() => vi.unstubAllGlobals());

it('a rejected fetch is a load failure', async () => {
  vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
  await expect((await fresh())()).rejects.toMatchObject({ name: 'PdfError', userMessage: LOAD_FAILED });
});

it('a status that is not OK is a load failure', async () => {
  vi.stubGlobal('fetch', reply('x', { status: 404 }));
  await expect((await fresh())()).rejects.toMatchObject({ userMessage: LOAD_FAILED });
});

it('a body that cannot be read is a load failure', async () => {
  vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => { throw new TypeError('network error'); } }));
  await expect((await fresh())()).rejects.toMatchObject({ name: 'PdfError', userMessage: LOAD_FAILED });
});

it('a 200 response that is not a font (an HTML fallback page) is a load failure', async () => {
  vi.stubGlobal('fetch', reply('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } }));
  await expect((await fresh())()).rejects.toMatchObject({ name: 'PdfError', userMessage: LOAD_FAILED });
});

it('a failed load is retried on the next call', async () => {
  const loadFonts = await fresh();
  vi.stubGlobal('fetch', reply('<html>', {}));
  await expect(loadFonts()).rejects.toMatchObject({ userMessage: LOAD_FAILED });
  const calls = vi.fn(async () => new Response('<html>'));
  vi.stubGlobal('fetch', calls);
  await expect(loadFonts()).rejects.toMatchObject({ userMessage: LOAD_FAILED });
  expect(calls).toHaveBeenCalled();
});
