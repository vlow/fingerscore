// The embedded font files: their keys and PDF names, and the advance widths and ink boxes read from them.

/** One embedded TrueType file: Latin or extended Latin, regular, bold or bold italic. */
export type FontKey = 'latin-400' | 'latin-700' | 'latin-700i' | 'ext-400' | 'ext-700' | 'ext-700i';
export const FONT_KEYS: FontKey[] = ['latin-400', 'latin-700', 'latin-700i', 'ext-400', 'ext-700', 'ext-700i'];

/** Each file is registered under its own name, which is also its name in the PDF (so a viewer and the tests tell them apart). */
export const FONT_NAME: Record<FontKey, string> = {
  'latin-400': 'AtkinsonHyperlegible-Regular',
  'latin-700': 'AtkinsonHyperlegible-Bold',
  'latin-700i': 'AtkinsonHyperlegible-BoldItalic',
  'ext-400': 'AtkinsonHyperlegibleExt-Regular',
  'ext-700': 'AtkinsonHyperlegibleExt-Bold',
  'ext-700i': 'AtkinsonHyperlegibleExt-BoldItalic',
};

export type Weight = 400 | 700;

export function fontKey(kind: 'latin' | 'latinExt', weight: Weight, italic: boolean): FontKey {
  if (italic && weight !== 700) throw new Error('only bold italic is embedded');
  return `${kind === 'latin' ? 'latin' : 'ext'}-${weight}${italic ? 'i' : ''}` as FontKey;
}

// ---------------------------------------------------------------------------------------------------------------
// Advance widths, read from the font files (cmap format 4 and hmtx).

/** boxes: each glyph's ink box [xMin, yMin, xMax, yMax] in font units, y up; null for an empty glyph. */
interface Metrics { glyphOf: Map<number, number>; advances: number[]; boxes: (number[] | null)[]; unitsPerEm: number }
const metrics = new Map<FontKey, Metrics>();

function parseMetrics(bytes: ArrayBuffer): Metrics {
  const v = new DataView(bytes);
  const tables = new Map<string, number>();
  for (let i = 0, n = v.getUint16(4); i < n; i++) {
    const at = 12 + 16 * i;
    tables.set(String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3)), v.getUint32(at + 8));
  }
  const table = (tag: string) => {
    const at = tables.get(tag);
    if (at === undefined) throw new Error(`font: no ${tag} table`);
    return at;
  };
  const unitsPerEm = v.getUint16(table('head') + 18);
  const numberOfHMetrics = v.getUint16(table('hhea') + 34);
  const numGlyphs = v.getUint16(table('maxp') + 4);
  const hmtx = table('hmtx');
  const advances: number[] = [];
  for (let g = 0; g < numGlyphs; g++) advances.push(v.getUint16(hmtx + 4 * Math.min(g, numberOfHMetrics - 1)));

  const longOffsets = v.getInt16(table('head') + 50) === 1;
  const loca = table('loca');
  const glyf = table('glyf');
  const offset = (g: number) => (longOffsets ? v.getUint32(loca + 4 * g) : 2 * v.getUint16(loca + 2 * g));
  const boxes: (number[] | null)[] = [];
  for (let g = 0; g < numGlyphs; g++) {
    const at = glyf + offset(g);
    boxes.push(offset(g + 1) === offset(g) ? null : [v.getInt16(at + 2), v.getInt16(at + 4), v.getInt16(at + 6), v.getInt16(at + 8)]);
  }

  const cmap = table('cmap');
  let sub = -1;
  for (let i = 0, n = v.getUint16(cmap + 2); i < n; i++) {
    const platform = v.getUint16(cmap + 4 + 8 * i);
    const encoding = v.getUint16(cmap + 6 + 8 * i);
    const at = cmap + v.getUint32(cmap + 8 + 8 * i);
    if (v.getUint16(at) === 4 && (platform === 0 || (platform === 3 && encoding === 1))) sub = at;
  }
  if (sub < 0) throw new Error('font: no Unicode cmap of format 4');
  const segs = v.getUint16(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + 2 * segs + 2;
  const deltas = starts + 2 * segs;
  const offsets = deltas + 2 * segs;
  const glyphOf = new Map<number, number>();
  for (let s = 0; s < segs; s++) {
    const end = v.getUint16(ends + 2 * s);
    const start = v.getUint16(starts + 2 * s);
    const delta = v.getInt16(deltas + 2 * s);
    const rangeOffset = v.getUint16(offsets + 2 * s);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let g: number;
      if (rangeOffset === 0) g = (c + delta) & 0xffff;
      else {
        g = v.getUint16(offsets + 2 * s + rangeOffset + 2 * (c - start));
        if (g !== 0) g = (g + delta) & 0xffff;
      }
      if (g !== 0) glyphOf.set(c, g);
    }
  }
  return { glyphOf, advances, boxes, unitsPerEm };
}

/** Reads the advance widths of one font file; the engine calls it for every file before any text is laid out. */
export function setFontMetrics(key: FontKey, bytes: ArrayBuffer): void {
  metrics.set(key, parseMetrics(bytes));
}

/** Width of a plain text in one font file, in em. */
export function emWidth(key: FontKey, text: string): number {
  const m = metrics.get(key);
  if (!m) throw new Error(`font metrics of ${key} not loaded`);
  let w = 0;
  for (const ch of text) w += m.advances[m.glyphOf.get(ch.codePointAt(0)!) ?? 0];
  return w / m.unitsPerEm;
}

/** Ink box of a plain text in one font file, in em from the pen at 0 on the baseline, y up; null when nothing is inked. */
export function emInk(key: FontKey, text: string): { x1: number; y1: number; x2: number; y2: number } | null {
  const m = metrics.get(key);
  if (!m) throw new Error(`font metrics of ${key} not loaded`);
  let pen = 0;
  let box: { x1: number; y1: number; x2: number; y2: number } | null = null;
  for (const ch of text) {
    const g = m.glyphOf.get(ch.codePointAt(0)!) ?? 0;
    const b = m.boxes[g];
    if (b) {
      const [x1, y1, x2, y2] = [pen + b[0], b[1], pen + b[2], b[3]].map(n => n / m.unitsPerEm);
      box = box ? { x1: Math.min(box.x1, x1), y1: Math.min(box.y1, y1), x2: Math.max(box.x2, x2), y2: Math.max(box.y2, y2) } : { x1, y1, x2, y2 };
    }
    pen += m.advances[g];
  }
  return box;
}
