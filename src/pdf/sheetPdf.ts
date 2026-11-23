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
import { collapse, drawFooter, drawLegend, drawSvg, INK, LEGEND, loadFonts, MUTED, newPdf, nextTurn, renderOffscreen, SITE, text, TEXT, throwIfAborted, width, type Pdf } from './engine';
import { PdfError, unsupportedMessage } from './errors';
import { prepareSvg } from './prepareSvg';
import { fitText, pageHeightUnits, pageSizeFor, paginate, UNITS, wrapLegend, type Block, type PageSize } from './pageModel';

// Sizes of the title block in units (src/render/Paper.module.css).
const TITLE = { px: 26, minPx: 14, height: 44, baseline: 28 };
const SUBTITLE = { px: 14, minPx: 14, height: 28, baseline: 18 };
const META = { px: 12, height: 24, baseline: 12 };

const metaLeft = (doc: Doc) => `♩ = ${doc.tempo}`;
const metaRight = (d: Derived) => `${d.inst.name} · ${d.headerKeys}`;

/** Every text the PDF draws from the sheet's content, for the character check. */
function drawnTexts(doc: Doc, d: Derived): string[] {
  const out = [doc.title, doc.subtitle, metaLeft(doc), metaRight(d), d.legend];
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
  const title = fitText(doc.title, width(700), UNITS, TITLE.px, TITLE.minPx);
  const subtitle = fitText(doc.subtitle, width(700), UNITS, SUBTITLE.px, SUBTITLE.minPx);
  const legend = wrapLegend(collapse(d.legend), SITE, t => textWidth(t, LEGEND.px, 400), UNITS);
  const blocks: Block[] = [];
  if (title.text !== '') blocks.push({ kind: 'title', height: TITLE.height });
  if (subtitle.text !== '') blocks.push({ kind: 'subtitle', height: SUBTITLE.height });
  blocks.push({ kind: 'meta', height: META.height });
  for (const s of layout.systems) blocks.push({ kind: 'system', height: SHEET.systemHeight, index: s.index });
  const lines = legend.lines.length + (legend.footerOwnLine ? 1 : 0);
  blocks.push({ kind: 'legend', height: LEGEND.top + LEGEND.line * lines });
  return { blocks, title, subtitle, legend };
}

interface Sheet { doc: Doc; derived: Derived; layout: SheetLayout; plan: SheetPlan; ties: ReturnType<typeof tieSegments> }

async function drawSystems(pdf: Pdf, sheet: Sheet, placed: { index: number; y: number }[]): Promise<void> {
  if (placed.length === 0) return;
  const { doc, derived, layout, ties } = sheet;
  const last = layout.systems.length - 1;
  const views = placed.map(({ index }) => createElement(SystemView, {
    key: index, doc, derived, system: layout.systems[index], beams: layout.beams, tuplets: layout.tuplets, ties: ties[index],
    playingId: null, selectedId: null, onSelect: () => {}, lastSystem: index === last,
  }));
  const off = renderOffscreen(createElement(Fragment, null, ...views));
  try {
    const svgs = Array.from(off.host.querySelectorAll<SVGSVGElement>('svg[data-testid="system"]'));
    for (let i = 0; i < placed.length; i++) {
      prepareSvg(svgs[i]);
      await drawSvg(pdf, svgs[i], 0, placed[i].y, SHEET.systemWidth, SHEET.systemHeight);
    }
  } finally {
    off.dispose();
  }
}

function drawBlock(pdf: Pdf, sheet: Sheet, b: Block, y: number): void {
  const { doc, derived, plan } = sheet;
  if (b.kind === 'title') text(pdf, plan.title.text, UNITS / 2, y + TITLE.baseline, plan.title.px, 700, 'middle', INK);
  else if (b.kind === 'subtitle') text(pdf, plan.subtitle.text, UNITS / 2, y + SUBTITLE.baseline, plan.subtitle.px, 700, 'middle', TEXT);
  else if (b.kind === 'meta') {
    text(pdf, metaLeft(doc), 0, y + META.baseline, META.px, 400, 'start', MUTED);
    text(pdf, metaRight(derived), UNITS, y + META.baseline, META.px, 400, 'end', MUTED);
  } else if (b.kind === 'legend') drawLegend(pdf, y, plan.legend);
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
  const pdf = newPdf(size, fonts, { title: doc.title, subject: doc.subtitle });

  for (let n = 0; n < pages.length; n++) {
    if (n > 0) pdf.doc.addPage([size.widthMm, size.heightMm], 'portrait');
    let y = 0;
    const systems: { index: number; y: number }[] = [];
    for (const group of pages[n]) {
      for (const b of group.blocks) {
        if (b.kind === 'system') systems.push({ index: b.index!, y });
        else drawBlock(pdf, sheet, b, y);
        y += b.height;
      }
    }
    await drawSystems(pdf, sheet, systems);
    drawFooter(pdf, doc.title, n + 1, pages.length);
    o.onProgress?.(n + 1, pages.length);
    await nextTurn(o.signal);
  }
  return pdf.doc.output('blob');
}
