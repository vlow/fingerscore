export const MARGIN_MM = 12;
/** Width of a system in units; every length in this file is in units. */
export const UNITS = 860;

export interface PageSize { name: 'A4' | 'Letter'; widthMm: number; heightMm: number }

const A4: PageSize = { name: 'A4', widthMm: 210, heightMm: 297 };
const LETTER: PageSize = { name: 'Letter', widthMm: 215.9, heightMm: 279.4 };

/** Letter when the language tag has the region US or CA (en-US, fr-CA); A4 otherwise. */
export function pageSizeFor(language: string): PageSize {
  const region = language.split('-')[1]?.toUpperCase();
  return region === 'US' || region === 'CA' ? LETTER : A4;
}

export function unitMm(size: PageSize): number {
  return (size.widthMm - 2 * MARGIN_MM) / UNITS;
}

export function pageHeightUnits(size: PageSize): number {
  return (size.heightMm - 2 * MARGIN_MM) / unitMm(size);
}

export interface Block {
  kind: 'title' | 'subtitle' | 'meta' | 'caption' | 'system' | 'line' | 'legend';
  height: number;
  index?: number;
}

export interface PageGroup { blocks: Block[]; scale: number }

const EPS = 1e-9;

/**
 * Blocks arrive in page order. Each page is a list of groups: one group of scale 1 holding the blocks
 * that share the page, or a single block taller than a page alone with scale < 1.
 * A block that does not fit starts a new page; a block exactly as tall as the remaining space fits.
 * A legend that does not fit goes to a new page alone, like any block that does not fit,
 * and is the last block, so nothing follows it.
 */
export function paginate(blocks: Block[], pageHeight: number): PageGroup[][] {
  const pages: PageGroup[][] = [];
  let current: Block[] = [];
  let used = 0;
  const flush = () => {
    if (current.length > 0) pages.push([{ blocks: current, scale: 1 }]);
    current = [];
    used = 0;
  };
  for (const b of blocks) {
    if (b.height > pageHeight + EPS) {
      flush();
      pages.push([{ blocks: [b], scale: pageHeight / b.height }]);
      continue;
    }
    if (used + b.height > pageHeight + EPS) flush();
    current.push(b);
    used += b.height;
  }
  flush();
  return pages;
}

/** The largest size from `px` down to `minPx` (0.5 steps) at which the text fits; at `minPx` the text is cut with "…". */
export function fitText(
  text: string, widthAt: (text: string, px: number) => number, maxWidth: number, px: number, minPx: number,
): { text: string; px: number } {
  if (text === '') return { text, px };
  for (let size = px; size > minPx; size -= 0.5) {
    if (widthAt(text, size) <= maxWidth) return { text, px: size };
  }
  if (widthAt(text, minPx) <= maxWidth) return { text, px: minPx };
  const chars = [...text];
  while (chars.length > 0) {
    chars.pop();
    const cut = `${chars.join('').trimEnd()}…`;
    if (widthAt(cut, minPx) <= maxWidth) return { text: cut, px: minPx };
  }
  return { text: '…', px: minPx };
}

const FOOTER_GAP = 24;

/**
 * Breaks at " · " first, then at spaces inside a segment wider than a line. A break at a separator drops it.
 * The footer shares the last line when legend line, a gap of 24 units and footer all fit.
 */
export function wrapLegend(
  legend: string, footer: string, widthOf: (text: string) => number, maxWidth: number,
): { lines: string[]; footerOwnLine: boolean } {
  const pieces: string[] = [];
  for (const segment of legend.split(' · ')) {
    if (widthOf(segment) <= maxWidth) { pieces.push(segment); continue; }
    let line = '';
    for (const word of segment.split(' ')) {
      const next = line === '' ? word : `${line} ${word}`;
      if (line !== '' && widthOf(next) > maxWidth) { pieces.push(line); line = word; } else line = next;
    }
    pieces.push(line);
  }
  const lines: string[] = [];
  for (const piece of pieces) {
    const last = lines.length - 1;
    const joined = last >= 0 ? `${lines[last]} · ${piece}` : piece;
    if (last >= 0 && widthOf(joined) <= maxWidth) lines[last] = joined;
    else lines.push(piece);
  }
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : undefined;
  const shares = lastLine !== undefined && widthOf(lastLine) + FOOTER_GAP + widthOf(footer) <= maxWidth;
  return { lines, footerOwnLine: !shares };
}

export function footerText(title: string, page: number, pages: number): string | null {
  if (pages <= 1) return null;
  return title === '' ? `page ${page} of ${pages}` : `${title} · page ${page} of ${pages}`;
}
