import glyphs from '../data/glyphs.json';
import type { TimeSig } from '../domain/types';

export type GlyphName =
  | 'trebleClef' | 'flat' | 'sharp' | 'natural' | 'doubleSharp' | 'doubleFlat'
  | 'restWhole' | 'restHalf' | 'restQuarter' | 'restEighth' | 'restSixteenth';
export type DigitName = `digit${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
type AnyGlyph = GlyphName | DigitName;

const PATHS = glyphs.paths as Record<AnyGlyph, string>;
const BBOX = glyphs.bbox as unknown as Record<AnyGlyph, [number, number, number, number]>;
const ADVANCE = glyphs.advance as Record<AnyGlyph, number>;
const INK = '#15171C';

/** Bravura: one staff space = 250 font units = 10px. */
export const GLYPH_SCALE = 10 / 250;

/**
 * SMuFL origin of each glyph relative to the y the caller passes (glyphs.json `placement`):
 * clef and rests get the bottom staff line B, accidentals the note y.
 */
const ORIGIN_DY: Record<GlyphName, number> = {
  trebleClef: -10,                               // G line
  flat: 0, sharp: 0, natural: 0, doubleSharp: 0, doubleFlat: 0,   // notehead centre
  restWhole: -30,                                // hangs from the 4th line
  restHalf: -20, restQuarter: -20, restEighth: -20, restSixteenth: -20,   // middle line
};

const transform = (x: number, y: number) => `translate(${x}, ${y}) scale(${GLYPH_SCALE}, ${-GLYPH_SCALE})`;

/** Horizontal ink extent in px relative to the glyph origin. */
export function glyphInk(name: AnyGlyph): { left: number; right: number } {
  const [x1, , x2] = BBOX[name];
  return { left: x1 * GLYPH_SCALE, right: x2 * GLYPH_SCALE };
}

/** x = glyph origin (left side); y = bottom staff line for clef and rests, note y for accidentals. */
export function Glyph(p: { name: GlyphName; x: number; y: number; fill?: string }): JSX.Element {
  return <path d={PATHS[p.name]} transform={transform(p.x, p.y + ORIGIN_DY[p.name])} fill={p.fill ?? INK} />;
}

/** One number from time-signature digits, ink centred on cx, digit origins on y. */
function TimeSigNumber(p: { n: number; cx: number; y: number }): JSX.Element {
  const digits = String(p.n).split('').map(c => `digit${c}` as DigitName);
  const offsets: number[] = [];
  let pen = 0;
  for (const d of digits) { offsets.push(pen); pen += ADVANCE[d]; }
  const last = digits.length - 1;
  const inkMid = (BBOX[digits[0]][0] + offsets[last] + BBOX[digits[last]][2]) / 2;
  const x0 = p.cx - inkMid * GLYPH_SCALE;
  return <>{digits.map((d, i) => <path key={i} data-digit={d} d={PATHS[d]} transform={transform(x0 + offsets[i] * GLYPH_SCALE, p.y)} fill={INK} />)}</>;
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
