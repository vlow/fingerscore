// A scale page as a PDF: caption, staff lines with note names and charts, legend and page footers (design 4.2 "Scales").
import { createElement, Fragment } from 'react';
import { legend as chartLegend, type RecorderSystem } from '../domain/fingerings';
import { scaleFingerings, type ScaleResult } from '../domain/scales';
import type { InstId } from '../domain/types';
import { scaleLines, type ScaleStaffProps } from '../render/ScaleStaff';
import { SHEET } from '../render/layout';
import { unsupported } from './chars';
import { collapse, drawFooter, drawLegend, drawSvg, drawSvgScaled, INK, LEGEND, loadFonts, newPdf, nextTurn, renderOffscreen, SITE, text, throwIfAborted, width, type Pdf } from './engine';
import { PdfError, unsupportedMessage } from './errors';
import { fitText, pageHeightUnits, pageSizeFor, paginate, UNITS, wrapLegend, type Block, type PageSize } from './pageModel';
import { prepareSvg } from './prepareSvg';
import { textWidth } from './drawText';

/** The caption block as on the Scales paper: 18 bold, centred; with its 18 bottom margin it is 40 units high. */
const CAPTION = { px: 18, minPx: 14, height: 40, baseline: 18 };
/** The space the page puts between two lines (src/render/ScaleStaff.module.css). */
const LINE_GAP = 8;

export interface ScalePdfInput {
  inst: InstId; scale: ScaleResult; scaleName: string; caption: string;
  chartStyle: 'compact' | 'full'; recorderSystem: RecorderSystem; showNames: boolean; showAlternates: boolean;
  /** The player's picks: note index → option index. */
  overrides: Record<number, number>;
}

export interface ScalePlan {
  blocks: Block[];
  caption: { text: string; px: number };
  legend: { lines: string[]; footerOwnLine: boolean };
}

const staffProps = (i: ScalePdfInput): ScaleStaffProps => ({
  inst: i.inst, scale: i.scale, chartStyle: i.chartStyle, recorderSystem: i.recorderSystem,
  showNames: i.showNames, showAlternates: i.showAlternates, overrides: i.overrides,
});

/** Every text the PDF draws from the scale's content, for the character check. */
function drawnTexts(i: ScalePdfInput): string[] {
  const out = [i.caption, chartLegend(i.inst)];
  const fingerings = scaleFingerings(i.inst, i.scale.notes, i.recorderSystem, i.overrides);
  i.scale.notes.forEach((n, k) => {
    if (i.showNames) out.push(n.spelled.name);
    if (i.showAlternates) for (const o of fingerings[k].options) out.push(o.n);
  });
  return out;
}

/** The blocks of the scale in page order. A line's block includes the gap to the next line. Needs the font metrics (`loadFonts`). */
export function planScale(i: ScalePdfInput): ScalePlan {
  const caption = fitText(i.caption, width(700), UNITS, CAPTION.px, CAPTION.minPx);
  const legend = wrapLegend(collapse(chartLegend(i.inst)), SITE, t => textWidth(t, LEGEND.px, 400), UNITS);
  const lines = scaleLines(staffProps(i));
  const blocks: Block[] = [{ kind: 'caption', height: CAPTION.height }];
  lines.forEach((l, index) => blocks.push({ kind: 'line', height: l.height + (index < lines.length - 1 ? LINE_GAP : 0), index }));
  blocks.push({ kind: 'legend', height: LEGEND.top + LEGEND.line * (legend.lines.length + (legend.footerOwnLine ? 1 : 0)) });
  return { blocks, caption, legend };
}

/**
 * The page draws an option name of several lines as one text whose tspans each restart at the note's x; the PDF
 * conversion places the runs of one text side by side. Each line becomes a text of its own.
 */
function splitOptionNames(svg: SVGSVGElement): void {
  for (const t of Array.from(svg.querySelectorAll('text[data-option-name]'))) {
    let y = Number(t.getAttribute('y'));
    const lines = Array.from(t.querySelectorAll('tspan'));
    lines.forEach(span => {
      y += Number(span.getAttribute('dy') ?? 0);
      const copy = t.cloneNode(false) as SVGTextElement;
      copy.setAttribute('x', span.getAttribute('x') ?? t.getAttribute('x') ?? '0');
      copy.setAttribute('y', String(y));
      copy.textContent = span.textContent;
      t.before(copy);
    });
    t.remove();
  }
}

/** Draws the lines at their y (units of the content box); a group with scale < 1 holds one line alone on its page. */
async function drawLines(pdf: Pdf, input: ScalePdfInput, placed: { index: number; y: number; scale: number }[]): Promise<void> {
  if (placed.length === 0) return;
  const lines = scaleLines(staffProps(input));      // no renderUnderChart: the page's pill slot is not drawn
  const off = renderOffscreen(createElement(Fragment, null, ...placed.map(({ index }) => createElement(Fragment, { key: index }, lines[index].render()))));
  try {
    const svgs = Array.from(off.host.querySelectorAll<SVGSVGElement>('svg[data-testid="scale-line"]'));
    for (let k = 0; k < placed.length; k++) {
      const { index, y, scale } = placed[k];
      splitOptionNames(svgs[k]);
      prepareSvg(svgs[k]);
      if (scale === 1) await drawSvg(pdf, svgs[k], 0, y, SHEET.systemWidth, lines[index].height);
      else await drawSvgScaled(pdf, svgs[k], y, SHEET.systemWidth, lines[index].height, scale);
    }
  } finally {
    off.dispose();
  }
}

export interface ScalePdfOptions { language: string; onProgress?(page: number, pages: number): void; signal?: AbortSignal }

/** Checks the characters, then builds the PDF page by page, yielding to the browser between pages. */
export async function makeScalePdf(input: ScalePdfInput, o: ScalePdfOptions): Promise<Blob> {
  const bad = unsupported(drawnTexts(input));
  if (bad.length > 0) throw new PdfError(unsupportedMessage(bad));
  throwIfAborted(o.signal);
  const fonts = await loadFonts();
  throwIfAborted(o.signal);

  const size: PageSize = pageSizeFor(o.language);
  const plan = planScale(input);
  const pages = paginate(plan.blocks, pageHeightUnits(size));
  const pdf = newPdf(size, fonts, { title: input.caption, subject: input.scaleName });

  for (let n = 0; n < pages.length; n++) {
    if (n > 0) pdf.doc.addPage([size.widthMm, size.heightMm], 'portrait');
    let y = 0;
    const placed: { index: number; y: number; scale: number }[] = [];
    for (const group of pages[n]) {
      for (const b of group.blocks) {
        if (b.kind === 'line') placed.push({ index: b.index!, y, scale: group.scale });
        else if (b.kind === 'caption') text(pdf, plan.caption.text, UNITS / 2, y + CAPTION.baseline, plan.caption.px, 700, 'middle', INK);
        else if (b.kind === 'legend') drawLegend(pdf, y, plan.legend);
        y += b.height;
      }
    }
    await drawLines(pdf, input, placed);
    drawFooter(pdf, input.caption, n + 1, pages.length);
    o.onProgress?.(n + 1, pages.length);
    await nextTurn(o.signal);
  }
  return pdf.doc.output('blob');
}
