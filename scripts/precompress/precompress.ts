// Build only. Writes a brotli (.br) and a gzip (.gz) copy beside every text file in dist/, so the server sends files in
// their smallest form without compressing at request time (deploy/nginx: brotli_static, gzip_static). Then it writes
// build-report/release-files.txt, the release's files under assets/, which deploy/prune-assets.sh reads.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

export const COMPRESSED_EXTENSIONS = ['.js', '.css', '.html', '.svg', '.json', '.txt', '.webmanifest', '.mid', '.ttf'] as const;

/** A copy is kept only when it is at most this share of the original: below that, the gain is not worth a file. */
const WORTH = 0.95;

export function shouldCompress(path: string): boolean {
  return COMPRESSED_EXTENSIONS.some(ext => path.endsWith(ext));
}

export function compressedCopies(bytes: Uint8Array): { br: Buffer | null; gz: Buffer | null } {
  const keep = (b: Buffer) => (b.length <= bytes.length * WORTH ? b : null);
  return {
    br: keep(brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } })),
    gz: keep(gzipSync(bytes, { level: 9 })),
  };
}

/** Every file below `dir`, as paths relative to it with / separators. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(f => statSync(join(dir, f)).isFile())
    .map(f => f.split(sep).join('/'));
}

export function precompress(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  let write = true;
  return {
    name: 'precompress',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
      // scripts/make-notices-list.ts builds in memory (write: false); dist/ is then not this build's to touch.
      write = config.build.write !== false;
    },
    // closeBundle, not writeBundle: by then Vite has also copied public/ into dist/.
    closeBundle() {
      if (!write) return;
      for (const file of filesIn(outDir).filter(shouldCompress)) {
        const { br, gz } = compressedCopies(readFileSync(join(outDir, file)));
        if (br) writeFileSync(join(outDir, `${file}.br`), br);
        if (gz) writeFileSync(join(outDir, `${file}.gz`), gz);
      }
      const release = filesIn(outDir).filter(f => f.startsWith('assets/')).sort((a, b) => a.localeCompare(b));
      const report = join(root, 'build-report');
      mkdirSync(report, { recursive: true });
      writeFileSync(join(report, 'release-files.txt'), release.map(f => `${f}\n`).join(''));
    },
  };
}
