import glyphs from '../data/glyphs.json';
import type { TimeSig } from '../domain/types';

export type GlyphName =
  | 'trebleClef' | 'flat' | 'sharp' | 'natural'
  | 'restWhole' | 'restHalf' | 'restQuarter' | 'restEighth' | 'restSixteenth';

const PATHS = glyphs.paths as Record<GlyphName, string>;

// Placement per glyphs.json `placement`. y is the bottom staff line for clef and rests,
// the note y for accidentals. Returns the SVG transform for a glyph at (x, y).
function transform(name: GlyphName, x: number, y: number): string {
  switch (name) {
    case 'trebleClef': return `translate(${x}, ${y + 0.6}) scale(0.0588,-0.0588)`;
    case 'flat': return `translate(${x}, ${y - 18 + 24}) scale(0.03,-0.03)`;
    case 'sharp': return `translate(${x}, ${y - 16 + 21.7}) scale(0.03,-0.03)`;
    case 'natural': return `translate(${x}, ${y - 15 + 20.25}) scale(0.03,-0.03)`;
    default: return `translate(${x}, ${y - 30 + 26.7}) scale(0.0467,-0.0467)`;
  }
}

export function Glyph(p: { name: GlyphName; x: number; y: number; fill?: string }): JSX.Element {
  return <path d={PATHS[p.name]} transform={transform(p.name, p.x, p.y)} fill={p.fill ?? '#15171C'} />;
}

const SERIF = '"Times New Roman", Times, "Nimbus Roman", serif';
const DIGIT_PX = 20;          // digit height: two staff spaces
const DIGIT_FONT_SIZE = 30;   // Times digits are ~0.676 em tall -> ~20px

/** Time signature as two stacked bold-serif digits. x = centre, y = bottom staff line. */
export function TimeSigDigits(p: { ts: TimeSig; x: number; y: number }): JSX.Element {
  const style = { fontFamily: SERIF, fontWeight: 700 } as const;
  const common = { x: p.x, textAnchor: 'middle' as const, fontSize: DIGIT_FONT_SIZE, fill: '#15171C', style };
  return (
    <g data-timesig={`${p.ts[0]}/${p.ts[1]}`}>
      <text {...common} y={p.y - DIGIT_PX}>{p.ts[0]}</text>
      <text {...common} y={p.y}>{p.ts[1]}</text>
    </g>
  );
}
