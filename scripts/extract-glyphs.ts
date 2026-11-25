// Extracts the music glyphs the app draws from Bravura (SMuFL reference font, SIL OFL 1.1)
// and writes src/data/glyphs.json (outlines, ink boxes, advances; notes in scripts/extract-glyphs.md). Run: npm run glyphs
// The font comes from the devDependency @fontsource/bravura; only outline paths ship.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// opentype.js ships no type declarations; tsx does not type-check.
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@fontsource/bravura';
const FONT_FILE = 'files/bravura-latin-400-normal.woff';
const OUT = join(ROOT, 'src/data/glyphs.json');

/** App glyph name -> [SMuFL name, code point]. */
const GLYPHS: Record<string, [string, number]> = {
  trebleClef: ['gClef', 0xe050],
  flat: ['accidentalFlat', 0xe260],
  natural: ['accidentalNatural', 0xe261],
  sharp: ['accidentalSharp', 0xe262],
  doubleSharp: ['accidentalDoubleSharp', 0xe263],
  doubleFlat: ['accidentalDoubleFlat', 0xe264],
  restWhole: ['restWhole', 0xe4e3],
  restHalf: ['restHalf', 0xe4e4],
  restQuarter: ['restQuarter', 0xe4e5],
  restEighth: ['rest8th', 0xe4e6],
  restSixteenth: ['rest16th', 0xe4e7],
  noteQuarterUp: ['noteQuarterUp', 0xe1d5],
};
for (let d = 0; d <= 9; d++) GLYPHS[`digit${d}`] = [`timeSig${d}`, 0xe080 + d];

const pkgDir = dirname(require.resolve(`${PKG}/package.json`));
const buf = readFileSync(join(pkgDir, FONT_FILE));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
if (font.unitsPerEm !== 1000) throw new Error(`expected 1000 units per em, got ${font.unitsPerEm}`);

const paths: Record<string, string> = {};
const bbox: Record<string, [number, number, number, number]> = {};
const advance: Record<string, number> = {};
const missing: string[] = [];
for (const [name, [smufl, cp]] of Object.entries(GLYPHS)) {
  const glyph = font.charToGlyph(String.fromCodePoint(cp));
  const hex = `U+${cp.toString(16).toUpperCase()}`;
  // charToGlyph returns .notdef (index 0) for unmapped code points.
  if (!glyph || glyph.index === 0 || glyph.path.commands.length === 0) { missing.push(`${name} (${smufl} ${hex})`); continue; }
  // glyph.path is the raw outline in font units, y up; flipY: false keeps it that way.
  const d: string = glyph.path.toPathData({ decimalPlaces: 1, flipY: false, optimize: true });
  if (!d || !d.startsWith('M')) { missing.push(`${name} (${smufl} ${hex}): empty path`); continue; }
  paths[name] = d;
  const b = glyph.getBoundingBox();
  bbox[name] = [b.x1, b.y1, b.x2, b.y2].map(v => Math.round(v * 10) / 10) as [number, number, number, number];
  advance[name] = glyph.advanceWidth;
}
if (missing.length > 0) {
  console.error(`Bravura is missing glyphs: ${missing.join(', ')}`);
  process.exit(1);
}

// Only what the renderer reads ships: the notes on units, placement and source are in scripts/extract-glyphs.md.
const doc = { bbox, advance, paths };
writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`);
console.log(`wrote ${Object.keys(paths).length} glyphs to ${OUT}`);
