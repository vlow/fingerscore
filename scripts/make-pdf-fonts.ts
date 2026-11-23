// Unpacks the Atkinson Hyperlegible WOFF files of @fontsource/atkinson-hyperlegible to TrueType for the PDF
// (src/pdf/fonts/*.ttf), copies the font licence beside them (OFL.txt) and writes coverage.json: the code points
// each subset maps, as sorted inclusive ranges. Run: npm run fonts
// WOFF 1 is an sfnt whose tables are each zlib-compressed; this script inflates them with node:zlib and writes a
// new sfnt table directory. opentype.js (devDependency) only reads, to check the result.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
// opentype.js ships no type declarations; tsx does not type-check.
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PKG = '@fontsource/atkinson-hyperlegible';
export const OUT_DIR = join(ROOT, 'src/pdf/fonts');
const SUBSETS = { latin: 'latin', latinExt: 'latin-ext' } as const;
const STYLES = ['400-normal', '700-normal', '700-italic'] as const;

const pad4 = (n: number) => (n + 3) & ~3;

/** Sum of big-endian 32-bit words, the data zero-padded to a multiple of 4 bytes. */
function checksum(data: Uint8Array): number {
  const padded = new Uint8Array(pad4(data.length));
  padded.set(data);
  const view = new DataView(padded.buffer);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  return sum;
}

/** WOFF 1 -> sfnt (TrueType). Spec: https://www.w3.org/TR/WOFF/ */
function woffToSfnt(woff: Uint8Array): Uint8Array {
  const v = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (v.getUint32(0) !== 0x774f4646) throw new Error('not a WOFF 1 file');
  const flavor = v.getUint32(4);
  const numTables = v.getUint16(12);
  const tables: { tag: number; data: Uint8Array; orig: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const at = 44 + 20 * i;
    const tag = v.getUint32(at);
    const offset = v.getUint32(at + 4);
    const compLength = v.getUint32(at + 8);
    const origLength = v.getUint32(at + 12);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? new Uint8Array(inflateSync(raw)) : raw.slice();
    if (data.length !== origLength) throw new Error(`table ${i}: ${data.length} bytes, expected ${origLength}`);
    tables.push({ tag, data, orig: v.getUint32(at + 16) });
  }
  tables.sort((a, b) => a.tag - b.tag);

  let size = 12 + 16 * numTables;
  for (const t of tables) size += pad4(t.data.length);
  const out = new Uint8Array(size);
  const o = new DataView(out.buffer);
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 16 * 2 ** entrySelector;
  o.setUint32(0, flavor);
  o.setUint16(4, numTables);
  o.setUint16(6, searchRange);
  o.setUint16(8, entrySelector);
  o.setUint16(10, numTables * 16 - searchRange);

  const HEAD = 0x68656164;
  let headAt = -1;
  let offset = 12 + 16 * numTables;
  tables.forEach((t, i) => {
    if (t.tag === HEAD) {
      headAt = offset;
      new DataView(t.data.buffer, t.data.byteOffset).setUint32(8, 0);   // checkSumAdjustment counts as 0
    }
    const sum = checksum(t.data);
    if (t.tag !== HEAD && sum !== t.orig) throw new Error(`table ${i}: checksum ${sum} differs from the WOFF's ${t.orig}`);
    const rec = 12 + 16 * i;
    o.setUint32(rec, t.tag);
    o.setUint32(rec + 4, sum);
    o.setUint32(rec + 8, offset);
    o.setUint32(rec + 12, t.data.length);
    out.set(t.data, offset);
    offset += pad4(t.data.length);
  });
  if (headAt < 0) throw new Error('no head table');
  o.setUint32(headAt + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}

/** Sorted code points -> inclusive [first, last] ranges. */
function ranges(cps: number[]): number[][] {
  const out: number[][] = [];
  for (const cp of cps) {
    const last = out[out.length - 1];
    if (last && cp === last[1] + 1) last[1] = cp; else out.push([cp, cp]);
  }
  return out;
}

const parse = (bytes: Uint8Array) => opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

/** The six TrueType files, the coverage ranges and the licence text made from the WOFF files in the font package's folder. Writes nothing. */
export function convertFonts(pkgDir: string): { files: Map<string, Uint8Array>; coverage: Record<string, number[][]>; licence: Uint8Array; log: string[] } {
  const files = new Map<string, Uint8Array>();
  const coverage: Record<string, number[][]> = {};
  const log: string[] = [];
  for (const [key, subset] of Object.entries(SUBSETS)) {
    let common = null as Set<number> | null;
    for (const style of STYLES) {
      const name = `atkinson-hyperlegible-${subset}-${style}`;
      const woff = new Uint8Array(readFileSync(join(pkgDir, 'files', `${name}.woff`)));
      const ttf = woffToSfnt(woff);
      const fromWoff = parse(woff);
      const fromTtf = parse(ttf);
      if (fromTtf.numGlyphs !== fromWoff.numGlyphs || fromTtf.numGlyphs < 2) {
        throw new Error(`${name}: ${fromTtf.numGlyphs} glyphs in the TrueType file, ${fromWoff.numGlyphs} in the WOFF`);
      }
      files.set(`${name}.ttf`, ttf);
      const cps = Object.keys(fromTtf.tables.cmap.glyphIndexMap).map(Number);
      const mine: Set<number> = new Set(cps);
      common = common === null ? mine : new Set([...common].filter(cp => mine.has(cp)));
      log.push(`${name}.ttf: ${ttf.length} bytes, ${fromTtf.numGlyphs} glyphs, ${cps.length} code points`);
    }
    // A character counts as covered only when every style of the subset has it.
    coverage[key] = ranges([...(common ?? [])].sort((a, b) => a - b));
  }
  return { files, coverage, licence: new Uint8Array(readFileSync(join(pkgDir, 'LICENSE'))), log };
}

/** The text of coverage.json for a coverage. */
export const coverageJson = (coverage: Record<string, number[][]>) => `${JSON.stringify(coverage)}\n`;

// Run as a script (npm run fonts); importing this file, as the font check test does, writes nothing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkgDir = dirname(require.resolve(`${PKG}/package.json`));
  mkdirSync(OUT_DIR, { recursive: true });
  const { files, coverage, licence, log } = convertFonts(pkgDir);
  for (const [name, bytes] of files) writeFileSync(join(OUT_DIR, name), bytes);
  writeFileSync(join(OUT_DIR, 'OFL.txt'), licence);
  writeFileSync(join(OUT_DIR, 'coverage.json'), coverageJson(coverage));
  for (const line of log) console.log(line);
  console.log(`wrote ${OUT_DIR}/coverage.json and OFL.txt`);
}
