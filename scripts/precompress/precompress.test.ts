// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { compressedCopies, precompress, shouldCompress } from './precompress';

it('shouldCompress picks text files by extension', () => {
  for (const f of ['assets/index-x.js', 'index.html', 'manifest.webmanifest', 'demo/Auld_Lang_Syne.mid', 'assets/a.ttf']) expect(shouldCompress(f), f).toBe(true);
  for (const f of ['assets/a.woff2', 'icon-192.png', 'favicon.ico', 'assets/index-x.js.br', 'assets/index-x.js.gz']) expect(shouldCompress(f), f).toBe(false);
});

it('compressedCopies round-trips', () => {
  const text = Buffer.from('const fingering = "alto sax";\n'.repeat(700)).subarray(0, 20_000);
  const { br, gz } = compressedCopies(text);
  expect(brotliDecompressSync(br!).equals(text)).toBe(true);
  expect(gunzipSync(gz!).equals(text)).toBe(true);
});

it('compressedCopies skips what does not shrink by 5 %', () => {
  expect(compressedCopies(randomBytes(4096))).toEqual({ br: null, gz: null });
});

describe('the plugin', () => {
  let root: string;
  let outDir: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'precompress-'));
    outDir = join(root, 'dist');
    mkdirSync(join(outDir, 'assets'), { recursive: true });
    writeFileSync(join(outDir, 'assets', 'a.js'), 'export const sheet = "Auld Lang Syne";\n'.repeat(260));
    writeFileSync(join(outDir, 'assets', 'b.woff2'), randomBytes(2048));
    writeFileSync(join(outDir, 'index.html'), `<!doctype html><html><head>${'<meta name="x" content="y">'.repeat(40)}</head></html>`);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function run(write: boolean) {
    const plugin = precompress() as unknown as { configResolved(c: unknown): void; closeBundle(): void };
    plugin.configResolved({ root, build: { outDir, write } });
    plugin.closeBundle();
  }

  it('writes copies and the release list', () => {
    run(true);
    expect(existsSync(join(outDir, 'assets', 'a.js.br'))).toBe(true);
    expect(existsSync(join(outDir, 'assets', 'a.js.gz'))).toBe(true);
    expect(existsSync(join(outDir, 'index.html.br'))).toBe(true);
    expect(existsSync(join(outDir, 'assets', 'b.woff2.br'))).toBe(false);
    expect(readFileSync(join(root, 'build-report', 'release-files.txt'), 'utf8')).toBe('assets/a.js\nassets/a.js.br\nassets/a.js.gz\nassets/b.woff2\n');
  });

  it('does nothing for an in-memory build', () => {
    run(false);
    expect(existsSync(join(outDir, 'assets', 'a.js.br'))).toBe(false);
    expect(existsSync(join(root, 'build-report'))).toBe(false);
  });
});
