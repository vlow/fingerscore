import coverage from './fonts/coverage.json';

/** Drawn as outlines: ♭ ♯ ♮ 𝄫 𝄪 ♩ Δ ‿ ● ○ ◐. */
export const SYMBOLS = ['♭', '♯', '♮', '𝄫', '𝄪', '♩', 'Δ', '‿', '●', '○', '◐'] as const;

export type Font = 'latin' | 'latinExt' | 'symbol';

type Ranges = number[][];

function has(ranges: Ranges, cp: number): boolean {
  return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}

// Always supported, whatever the font files say: space, line break, no-break space.
const NEUTRAL = new Set([0x20, 0x0a, 0xa0]);

export function fontFor(ch: string): Font | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return null;
  if (NEUTRAL.has(cp)) return 'latin';
  if ((SYMBOLS as readonly string[]).includes(ch)) return 'symbol';
  if (has(coverage.latin, cp)) return 'latin';
  if (has(coverage.latinExt, cp)) return 'latinExt';
  return null;
}

/** Pieces of one text by font file. A space, line break and no-break space count as 'latin'. Unsupported characters are dropped: call `unsupported` first. */
export function runs(text: string): { kind: Font; text: string }[] {
  const out: { kind: Font; text: string }[] = [];
  for (const ch of text) {
    const kind = fontFor(ch);
    if (kind === null) continue;
    const last = out.length > 0 ? out[out.length - 1] : undefined;
    if (last && last.kind === kind) last.text += ch;
    else out.push({ kind, text: ch });
  }
  return out;
}

/** Distinct characters (by code point) that no font file and no symbol covers, in order of first appearance. */
export function unsupported(texts: string[]): string[] {
  const seen = new Set<string>();
  for (const t of texts) for (const ch of t) if (fontFor(ch) === null) seen.add(ch);
  return [...seen];
}
