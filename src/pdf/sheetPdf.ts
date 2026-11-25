// A whole sheet as a PDF: title block, systems, legend and page footers, laid out by the page model (design 4.2).
import { createElement, Fragment } from 'react';
import { prettyChord } from '../domain/chords';
import { derive, type Derived } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { layoutSheet, SHEET, type SheetLayout } from '../render/layout';
import { SystemView, tieSegments } from '../render/SystemView';
import { unsupported } from './chars';
import { textWidth } from './drawText';
import { collapse, drawFooter, fitFooterTitle, headingText, drawLegend, drawSvgScaled, INK, LEGEND, loadFonts, MUTED, newPdf, nextTurn, placeBlocks, renderOffscreen, SITE, text, TEXT, throwIfAborted, width, type Pdf } from './engine';
import { PdfError, unsupportedMessage } from './errors';
import { prepareSvg } from './prepareSvg';
import { fitText, pageHeightUnits, pageSizeFor, paginate, sheetBlocks, UNITS, wrapLegend, type Block, type PageGroup, type PageSize } from './pageModel';

// Sizes of the title block in units (src/render/Paper.module.css).
export const TITLE = { px: 26, minPx: 14, height: 44, baseline: 28 };
export const SUBTITLE = { px: 14, minPx: 14, height: 28, baseline: 18 };
export const META = { px: 12, height: 24, baseline: 12 };

const metaLeft = (doc: Doc) => `♩ = ${doc.tempo}`;
const metaRight = (d: Derived) => `${d.inst.name} · ${d.headerKeys}`;

/** Every text the PDF draws from the sheet's content, for the character check. */
function drawnTexts(doc: Doc, d: Derived): string[] {
  const out = [headingText(doc.title), headingText(doc.subtitle), metaLeft(doc), metaRight(d), d.legend];
  for (const ev of d.events) {
    if (doc.show.lyrics && !ev.rest && ev.lyric !== '') out.push(ev.lyric);
    if (doc.show.chords && ev.chord !== null) out.push(ev.chordOk ? prettyChord(ev.chord) : ev.chord);
  }
  return out;
}

export interface SheetPlan {
  blocks: Block[];
  title: { text: string; px: number };
  subtitle: { text: string; px: number };
  legend: { lines: string[]; footerOwnLine: boolean };
}

/** The blocks of the sheet in page order, with the fitted title and the wrapped legend. Needs the font metrics (`loadFonts`). */
export function planSheet(doc: Doc, d: Derived, layout: SheetLayout): SheetPlan {
  const title = fitText(headingText(doc.title), width(700), UNITS, TITLE.px, TITLE.minPx);
  const subtitle = fitText(headingText(doc.subtitle), width(700), UNITS, SUBTITLE.px, SUBTITLE.minPx);
  const legend = wrapLegend(collapse(d.legend), SITE, t => textWidth(t, LEGEND.px, 400), UNITS);
  const lines = legend.lines.length + (legend.footerOwnLine ? 1 : 0);
  const blocks = sheetBlocks({
    title: title.text !== '' ? TITLE.height : null, subtitle: subtitle.text !== '' ? SUBTITLE.height : null, meta: META.height,
    systems: layout.systems, systemHeight: layout.systemHeight, legend: LEGEND.top + LEGEND.line * lines,
  });
  return { blocks, title, subtitle, legend };
}

interface Sheet { doc: Doc; derived: Derived; layout: SheetLayout; plan: SheetPlan; ties: ReturnType<typeof tieSegments> }

/** The page's systems rendered off screen and prepared, by system index; `dispose` removes them. */
function renderSystems(sheet: Sheet, indices: number[]): { svgs: Map<number, SVGSVGElement>; dispose(): void } {
  if (indices.length === 0) return { svgs: new Map(), dispose: () => {} };
  const { doc, derived, layout, ties } = sheet;
  const last = layout.systems.length - 1;
  const views = indices.map(index => createElement(SystemView, {
    key: index, doc, derived, system: layout.systems[index], beams: layout.beams, tuplets: layout.tuplets, ties: ties[index],
    playingId: null, selectedId: null, onSelect: () => {}, lastSystem: index === last,
  }));
  const off = renderOffscreen(createElement(Fragment, null, ...views));
  try {
    const found = Array.from(off.host.querySelectorAll<SVGSVGElement>('svg[data-testid="system"]'));
    found.forEach(prepareSvg);
    return { svgs: new Map(indices.map((index, k) => [index, found[k]])), dispose: off.dispose };
  } catch (e) {
    off.dispose();
    throw e;
  }
}

/** Draws one block of the title block at y, in a frame shrunk by `scale` and centred (x0 is the frame's left edge). */
function drawHeading(pdf: Pdf, sheet: Sheet, b: Block, y: number, x0: number, scale: number): void {
  const { doc, derived, plan } = sheet;
  const at = (x: number) => x0 + x * scale;
  if (b.kind === 'title') text(pdf, plan.title.text, at(UNITS / 2), y + TITLE.baseline * scale, plan.title.px * scale, 700, 'middle', INK);
  else if (b.kind === 'subtitle') text(pdf, plan.subtitle.text, at(UNITS / 2), y + SUBTITLE.baseline * scale, plan.subtitle.px * scale, 700, 'middle', TEXT);
  else if (b.kind === 'meta') {
    text(pdf, metaLeft(doc), at(0), y + META.baseline * scale, META.px * scale, 400, 'start', MUTED);
    text(pdf, metaRight(derived), at(UNITS), y + META.baseline * scale, META.px * scale, 400, 'end', MUTED);
  }
}

/** One page, written in reading order: title block, systems top to bottom, legend and site, footer. */
async function drawPage(pdf: Pdf, sheet: Sheet, groups: PageGroup[], page: number, pages: number, footerTitle: string): Promise<void> {
  const placed = placeBlocks(groups);
  const systems = renderSystems(sheet, placed.filter(p => p.block.kind === 'system').map(p => p.block.index!));
  try {
    for (const { block, y, scale, x0 } of placed) {
      if (block.kind === 'system') await drawSvgScaled(pdf, systems.svgs.get(block.index!)!, y, SHEET.systemWidth, sheet.layout.systemHeight, scale);
      else if (block.kind === 'legend') drawLegend(pdf, y, sheet.plan.legend);
      else drawHeading(pdf, sheet, block, y, x0, scale);
    }
  } finally {
    systems.dispose();
  }
  drawFooter(pdf, footerTitle, page, pages);
}

export interface SheetPdfOptions { language: string; onProgress?(page: number, pages: number): void; signal?: AbortSignal }

/** Checks the characters, then builds the PDF page by page, yielding to the browser between pages. */
export async function makeSheetPdf(doc: Doc, o: SheetPdfOptions): Promise<Blob> {
  const derived = derive(doc, DEFAULT_PREFS);
  const bad = unsupported(drawnTexts(doc, derived));
  if (bad.length > 0) throw new PdfError(unsupportedMessage(bad));
  throwIfAborted(o.signal);
  const fonts = await loadFonts();
  throwIfAborted(o.signal);

  const size: PageSize = pageSizeFor(o.language);
  const layout = layoutSheet(doc, derived);
  const plan = planSheet(doc, derived, layout);
  const sheet: Sheet = { doc, derived, layout, plan, ties: tieSegments(derived, layout) };
  const pages = paginate(plan.blocks, pageHeightUnits(size));
  const title = headingText(doc.title);
  const footerTitle = fitFooterTitle(title, pages.length);
  const pdf = newPdf(size, fonts, { title, subject: headingText(doc.subtitle) });

  for (let n = 0; n < pages.length; n++) {
    if (n > 0) pdf.doc.addPage([size.widthMm, size.heightMm], 'portrait');
    await drawPage(pdf, sheet, pages[n], n + 1, pages.length, footerTitle);
    o.onProgress?.(n + 1, pages.length);
    await nextTurn(o.signal);
  }
  return pdf.doc.output('blob');
}
