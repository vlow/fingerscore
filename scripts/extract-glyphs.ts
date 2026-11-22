// Extracts the music glyphs the app draws from Bravura (SMuFL reference font, SIL OFL 1.1)
// and writes src/data/glyphs.json. Run: npm run glyphs
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
  restWhole: ['restWhole', 0xe4e3],
  restHalf: ['restHalf', 0xe4e4],
  restQuarter: ['restQuarter', 0xe4e5],
  restEighth: ['rest8th', 0xe4e6],
  restSixteenth: ['rest16th', 0xe4e7],
};
for (let d = 0; d <= 9; d++) GLYPHS[`digit${d}`] = [`timeSig${d}`, 0xe080 + d];

/** Final placement rule per glyph; scale 10 px / 250 units = 0.04, B = bottom staff line. */
const PLACEMENT: Record<string, string> = {
  all: 'transform translate(x, y) scale(0.04, -0.04): one staff space = 250 font units = 10px. x = glyph origin (left side bearing point), y = the staff position the SMuFL origin belongs on.',
  trebleClef: 'origin on the G line (2nd line from the bottom): y = B - 10; x = 4 (ink 4..30.8px, inside the 34px clef slot)',
  flat: 'origin at the notehead centre: y = note y; right ink edge 9px left of the notehead centre (x = noteX - 9 - inkRight), the gap the app used before Bravura. Key signature: origin x = 34 + 11k (k = 0, 1, ...), y = line or space of the accidental',
  sharp: 'as flat',
  natural: 'as flat',
  restWhole: 'origin on the 4th line, glyph hangs from it: y = B - 30',
  restHalf: 'origin on the middle line, glyph sits on it: y = B - 20',
  restQuarter: 'origin on the middle line: y = B - 20',
  restEighth: 'origin on the middle line: y = B - 20',
  restSixteenth: 'origin on the middle line: y = B - 20',
  rests: 'all rests: ink box centred horizontally on the event x (x = eventX - (inkLeft + inkRight) / 2)',
  digits: 'time-signature digits are vertically centred on their origin and two staff spaces tall: numerator origin on the 4th line (y = B - 30), denominator origin on the 2nd line (y = B - 10); each number centred on x by its advance width',
};

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

const doc = {
  _doc: 'Outline paths extracted from Bravura (Steinberg, SMuFL reference font, SIL Open Font License 1.1; licence text in licenses/Bravura-OFL.txt) by scripts/extract-glyphs.ts. Units: font units, 1000/em, y axis UP, one staff space = 250 units. bbox = ink box [xMin, yMin, xMax, yMax], advance = advance width. Draw inside an SVG <path> with transform translate(x, y) scale(0.04, -0.04); staff space = 10px, B = y of the bottom staff line.',
  source: { package: PKG, version: JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version, file: FONT_FILE },
  smufl: Object.fromEntries(Object.entries(GLYPHS).map(([k, [s, cp]]) => [k, `${s} U+${cp.toString(16).toUpperCase()}`])),
  placement: PLACEMENT,
  bbox,
  advance,
  paths,
};
writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`);
console.log(`wrote ${Object.keys(paths).length} glyphs to ${OUT}`);
