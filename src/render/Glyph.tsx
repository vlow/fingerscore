import glyphs from '../data/glyphs.json';
import type { TimeSig } from '../domain/types';
import { usePalette } from './palette';

export type GlyphName =
  | 'trebleClef' | 'flat' | 'sharp' | 'natural' | 'doubleSharp' | 'doubleFlat'
  | 'restWhole' | 'restHalf' | 'restQuarter' | 'restEighth' | 'restSixteenth'
  | 'segno' | 'coda';
export type DigitName = `digit${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
type AnyGlyph = GlyphName | DigitName;

const PATHS = glyphs.paths as Record<AnyGlyph, string>;
const BBOX = glyphs.bbox as unknown as Record<AnyGlyph, [number, number, number, number]>;
const ADVANCE = glyphs.advance as Record<AnyGlyph, number>;

/** Bravura: one staff space = 250 font units = 10px. */
export const GLYPH_SCALE = 10 / 250;

/**
 * SMuFL origin of each glyph relative to the y the caller passes (scripts/extract-glyphs.md):
 * clef and rests get the bottom staff line B, accidentals the note y.
 */
const ORIGIN_DY: Record<GlyphName, number> = {
  trebleClef: -10,                               // G line
  flat: 0, sharp: 0, natural: 0, doubleSharp: 0, doubleFlat: 0,   // notehead centre
  restWhole: -30,                                // hangs from the 4th line
  restHalf: -20, restQuarter: -20, restEighth: -20, restSixteenth: -20,   // middle line
  segno: 0, coda: 0,                             // baseline
};

const transform = (x: number, y: number, scale = GLYPH_SCALE) => `translate(${x}, ${y}) scale(${scale}, ${-scale})`;

/** Horizontal ink extent in px relative to the glyph origin. */
export function glyphInk(name: AnyGlyph): { left: number; right: number } {
  const [x1, , x2] = BBOX[name];
  return { left: x1 * GLYPH_SCALE, right: x2 * GLYPH_SCALE };
}

/** Vertical ink extent in px relative to the y passed to `Glyph`: `top` is negative above it. */
export function glyphInkY(name: GlyphName): { top: number; bottom: number } {
  const [, y1, , y2] = BBOX[name];
  return { top: ORIGIN_DY[name] - y2 * GLYPH_SCALE, bottom: ORIGIN_DY[name] - y1 * GLYPH_SCALE };
}

/**
 * x = glyph origin (left side); y = bottom staff line for clef and rests, note y for accidentals, the baseline for signs.
 * `scale` is px per font unit; the default draws on the staff (one staff space = 10px).
 */
export function Glyph(p: { name: GlyphName; x: number; y: number; fill?: string; scale?: number }): JSX.Element {
  const pal = usePalette();
  return <path d={PATHS[p.name]} transform={transform(p.x, p.y + ORIGIN_DY[p.name], p.scale)} fill={p.fill ?? pal.ink} />;
}

/** One number from time-signature digits, ink centred on cx, digit origins on y. */
function TimeSigNumber(p: { n: number; cx: number; y: number }): JSX.Element {
  const pal = usePalette();
  const digits = String(p.n).split('').map(c => `digit${c}` as DigitName);
  const offsets: number[] = [];
  let pen = 0;
  for (const d of digits) { offsets.push(pen); pen += ADVANCE[d]; }
  const last = digits.length - 1;
  const inkMid = (BBOX[digits[0]][0] + offsets[last] + BBOX[digits[last]][2]) / 2;
  const x0 = p.cx - inkMid * GLYPH_SCALE;
  return <>{digits.map((d, i) => <path key={i} data-digit={d} d={PATHS[d]} transform={transform(x0 + offsets[i] * GLYPH_SCALE, p.y)} fill={pal.ink} />)}</>;
}

/**
 * Time signature from Bravura digits. x = centre, y = bottom staff line.
 * Digits are two staff spaces tall and centred on their origin: numerator on the 4th line, denominator on the 2nd.
 */
export function TimeSigDigits(p: { ts: TimeSig; x: number; y: number }): JSX.Element {
  return (
    <g data-timesig={`${p.ts[0]}/${p.ts[1]}`}>
      <TimeSigNumber n={p.ts[0]} cx={p.x} y={p.y - 30} />
      <TimeSigNumber n={p.ts[1]} cx={p.x} y={p.y - 10} />
    </g>
  );
}
