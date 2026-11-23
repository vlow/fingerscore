export const MARGIN_MM = 12;
/** Width of a system in units; every length in this file is in units. */
export const UNITS = 860;

export interface PageSize { name: 'A4' | 'Letter'; widthMm: number; heightMm: number }

const A4: PageSize = { name: 'A4', widthMm: 210, heightMm: 297 };
const LETTER: PageSize = { name: 'Letter', widthMm: 215.9, heightMm: 279.4 };

/**
 * Letter when the language tag's region is US or CA (en-US, fr-CA, zh-Hant-US); A4 otherwise and without a tag.
 * The region is the first segment after the language that is two letters or three digits.
 */
export function pageSizeFor(language: string | null | undefined): PageSize {
  const region = (language ?? '').split('-').slice(1).find(s => /^([a-z]{2}|\d{3})$/i.test(s))?.toUpperCase();
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

/** The least shrink of a page's other blocks that keeps the legend off a page of its own. */
export const MIN_LEGEND_SHRINK = 0.92;

/**
 * Blocks arrive in page order. Each page is a list of groups: one group of scale 1 holding the blocks
 * that share the page, or a single block taller than a page alone with scale < 1.
 * A block that does not fit starts a new page; a block exactly as tall as the remaining space fits.
 * The legend is the last block. When it would stand alone on the last page, it stays on the page before if that
 * page's blocks (H units) shrunk to (pageHeight - legend) / H, at least MIN_LEGEND_SHRINK, make room for it: that page
 * then holds a group of its blocks at that scale and the legend at scale 1. A page with a block taller than a page
 * keeps its own rule.
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

  const n = pages.length;
  const last = pages[n - 1];
  const before = pages[n - 2];
  if (n >= 2 && last.length === 1 && last[0].blocks.length === 1 && last[0].blocks[0].kind === 'legend'
    && before.length === 1 && before[0].scale === 1) {
    const legend = last[0].blocks[0];
    const h = before[0].blocks.reduce((s, b) => s + b.height, 0);
    const scale = (pageHeight - legend.height) / h;
    if (scale >= MIN_LEGEND_SHRINK) {
      pages.splice(n - 2, 2, [{ blocks: before[0].blocks, scale }, { blocks: [legend], scale: 1 }]);
    }
  }
  return pages;
}

/**
 * The largest size from `px` down to `minPx` (0.5 steps) at which the text fits; at `minPx` the text is cut with "…".
 * A text too wide at `minPx` is not measured at the larger sizes, and the cut is found by binary search.
 */
export function fitText(
  text: string, widthAt: (text: string, px: number) => number, maxWidth: number, px: number, minPx: number,
): { text: string; px: number } {
  if (text === '') return { text, px };
  if (widthAt(text, minPx) <= maxWidth) {
    for (let size = px; size > minPx; size -= 0.5) {
      if (widthAt(text, size) <= maxWidth) return { text, px: size };
    }
    return { text, px: minPx };
  }
  const chars = [...text];
  const cutAt = (n: number) => `${chars.slice(0, n).join('').trimEnd()}…`;
  let lo = 0;                      // cutAt(lo) fits, or lo is 0 and only "…" is left
  let hi = chars.length;           // cutAt(hi) is not shorter than the text: known not to fit
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (widthAt(cutAt(mid), minPx) <= maxWidth) lo = mid; else hi = mid;
  }
  return { text: cutAt(lo), px: minPx };
}

/** The most code points a title, subtitle or caption keeps in the PDF, before it is fitted to the line. */
export const MAX_HEADING = 300;

const FOOTER_GAP = 24;

/**
 * Breaks at " · " first, then at spaces inside a segment wider than a line. A break at a separator drops it.
 * The footer shares the last line when legend line, a gap of 24 units and footer all fit.
 */
export function wrapLegend(
  legend: string, footer: string, widthOf: (text: string) => number, maxWidth: number,
): { lines: string[]; footerOwnLine: boolean } {
  const pieces: string[] = [];
  for (const segment of legend.split(' · ').map(t => t.trim()).filter(t => t !== '')) {
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
