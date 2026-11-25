// Development only: lets the Playwright tests (e2e/pdf-content.spec.ts, e2e/pdf-scale.spec.ts) build sheet and scale PDFs and show the same sheet on screen.
// Loaded through a dynamic import behind import.meta.env.DEV (src/main.tsx); not part of a production build.
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { legend } from '../domain/fingerings';
import { inst } from '../domain/instruments';
import { mod12 } from '../domain/keys';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { layoutSheet } from '../render/sheetLayout';
import { COLUMN_BOTTOM } from '../render/NoteView';
import { drawText, fontsOf, textWidth } from './drawText';
import { Paper } from '../render/Paper';
import { buildScale, scaleFingerings } from '../domain/scales';
import { scaleLines } from '../render/ScaleStaff';
import { drawSvgScaled, loadFonts, newPdf, pageMm, placeBlocks, registerFonts, renderOffscreen } from './engine';
import { pageHeightUnits, pageSizeFor, paginate, unitMm } from './pageModel';
import { prepareSvg } from './prepareSvg';
import { makeScalePdf, planScale, type ScalePdfInput } from './scalePdf';
import { makeSheetPdf, META, planSheet, SUBTITLE, TITLE } from './sheetPdf';

/** Helpers the tests use to build documents in the page. */
export { buildScale, derive, inst, legend, mod12, parseChord, sampleDoc, scaleFingerings };

export interface HookResult {
  /** The PDF, base64. */
  pdf?: string;
  type?: string;
  error?: { name: string; message: string };
  progress: [number, number][];
  /** onProgress calls after the signal fired. */
  progressAfterAbort: number;
  ms: number;
  /** Children of document.body before and after: the PDF code leaves nothing behind. */
  bodyBefore: number;
  bodyAfter: number;
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

interface RunOptions { language: string; abortAtPage?: number; abortBefore?: boolean }

/** Runs a PDF maker; `abortAtPage` fires the signal from the progress report of that page, `abortBefore` before the start. */
async function run(make: (o: { language: string; signal: AbortSignal; onProgress(n: number, total: number): void }) => Promise<Blob>, o: RunOptions): Promise<HookResult> {
  const ctl = new AbortController();
  if (o.abortBefore) ctl.abort();
  const progress: [number, number][] = [];
  let progressAfterAbort = 0;
  const t0 = performance.now();
  const bodyBefore = document.body.childElementCount;
  const body = () => ({ bodyBefore, bodyAfter: document.body.childElementCount });
  try {
    const blob = await make({
      language: o.language, signal: ctl.signal,
      onProgress: (n, total) => {
        if (ctl.signal.aborted) progressAfterAbort++;
        progress.push([n, total]);
        if (n === o.abortAtPage) ctl.abort();
      },
    });
    return { pdf: await base64(blob), type: blob.type, progress, progressAfterAbort, ms: performance.now() - t0, ...body() };
  } catch (e) {
    const err = e as Error;
    return { error: { name: err.name, message: err.message }, progress, progressAfterAbort, ms: performance.now() - t0, ...body() };
  }
}

/** makeSheetPdf for a document. */
export const sheetPdf = (doc: Doc, o: RunOptions): Promise<HookResult> => run(m => makeSheetPdf(doc, m), o);

/** makeScalePdf for a scale page's input. */
export const scalePdf = (input: ScalePdfInput, o: RunOptions): Promise<HookResult> => run(m => makeScalePdf(input, m), o);

/**
 * A synthetic block `height` units tall (a rectangle over the whole box, a line of text at its top) drawn alone on its page
 * with the scale the page model gives it: the engine's drawing of a block taller than a page.
 */
export async function scaledBlockPdf(height: number): Promise<{ pdf: string; scale: number; pageUnits: number }> {
  const fonts = await loadFonts();
  const size = pageSizeFor('de-DE');
  const pageUnits = pageHeightUnits(size);
  const [[group]] = paginate([{ kind: 'line', height }], pageUnits);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '860');
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 860 ${height}`);
  svg.innerHTML = `<rect x="0" y="0" width="860" height="${height}" fill="#ffe0e0"/>`
    + `<text x="430" y="40" text-anchor="middle" font-size="20" font-family="Atkinson Hyperlegible" fill="#2a2d33">tall block</text>`;
  document.body.appendChild(svg);
  try {
    prepareSvg(svg);
    const pdf = newPdf(size, fonts, { title: 'tall', subject: '' });
    await drawSvgScaled(pdf, svg, 0, 860, height, group.scale);
    return { pdf: await base64(pdf.doc.output('blob')), scale: group.scale, pageUnits };
  } finally {
    svg.remove();
  }
}

/** Renders a component that throws through the engine's off-screen rendering; counts document.body's children around it. */
export function renderFailure(): { before: number; after: number; error: string } {
  const before = document.body.childElementCount;
  const Fails = (): never => { throw new Error('render failed'); };
  const quiet = console.error;
  console.error = () => {};
  try {
    renderOffscreen(createElement(Fails));
    return { before, after: document.body.childElementCount, error: '' };
  } catch (e) {
    return { before, after: document.body.childElementCount, error: (e as Error).message };
  } finally {
    console.error = quiet;
  }
}

/** Texts drawn with drawText at 100 units, one line each, on one A4 page; with each text's natural width in units. */
export async function drawTextPdf(items: { text: string; px: number; weight: 400 | 700; squeezeTo?: number }[]): Promise<{ pdf: string; natural: number[] }> {
  const fonts = await loadFonts();
  const size = pageSizeFor('de-DE');
  const pdf = newPdf(size, fonts, { title: 'text', subject: '' });
  const u = unitMm(size);
  items.forEach((it, i) => {
    registerFonts(pdf, fontsOf(it.text, it.weight));
    const at = pageMm(size, 100, 60 + 60 * i);
    drawText(pdf.doc, it.text, { x: at.x, y: at.y, px: it.px * u, weight: it.weight, anchor: 'start', color: '#15171c', squeezeTo: it.squeezeTo === undefined ? undefined : it.squeezeTo * u });
  });
  return { pdf: await base64(pdf.doc.output('blob')), natural: items.map(it => textWidth(it.text, it.px, it.weight)) };
}

/**
 * The stack of this document's systems (design 5.10) and the height of a full title block, for the tests' geometry. All y
 * values are in a system's own coordinates: the chord lane starts at `chordY`, the lyric band at `lyricY`, the charts
 * stand between `chartY` and `chartBottom`.
 */
export function geometry(doc: Doc): { chordY: number; lyricY: number; chartY: number; chartBottom: number; systemHeight: number; titleBlock: number } {
  const { stack } = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
  return {
    chordY: stack.frame.chordY + stack.shift, lyricY: stack.frame.lyricY + stack.shift, chartY: stack.chartTop,
    chartBottom: COLUMN_BOTTOM + stack.shift, systemHeight: stack.systemHeight,
    titleBlock: TITLE.height + SUBTITLE.height + META.height,
  };
}

/**
 * The height of every system of this document, the mark row's height, the system of each bar
 * and the systems on each page of the page model.
 */
export async function sheetGeometry(doc: Doc, language: string): Promise<{ systemHeight: number; markRow: number; systemOfBar: number[]; pages: number[][] }> {
  await loadFonts();
  const d = derive(doc, DEFAULT_PREFS);
  const layout = layoutSheet(doc, d);
  const systemOfBar: number[] = [];
  for (const s of layout.systems) for (const b of s.bars) systemOfBar[b.bar] = s.index;
  const pages = paginate(planSheet(doc, d, layout).blocks, pageHeightUnits(pageSizeFor(language)))
    .map(groups => groups.flatMap(g => g.blocks).filter(b => b.kind === 'system').map(b => b.index!));
  return { systemHeight: layout.systemHeight, markRow: layout.stack.bands.marks, systemOfBar, pages };
}

/** The number of pages the page model gives the document. */
export async function expectedPages(doc: Doc, language: string): Promise<number> {
  await loadFonts();
  const d = derive(doc, DEFAULT_PREFS);
  return paginate(planSheet(doc, d, layoutSheet(doc, d)).blocks, pageHeightUnits(pageSizeFor(language))).length;
}

let screen: { root: Root; host: HTMLElement } | null = null;

/** Shows the document's paper over the app, as the sheet page draws it, for a screenshot; returns what the paper drew. */
export async function showPaper(doc: Doc): Promise<{ squeezed: { text: string; textLength: number }[]; tupletSides: string[]; voltas: number; states: string[]; raised: number; systems: number[][]; tuplets: { x: number; y: number; system: number }[] }> {
  if (!screen) {
    const host = document.createElement('div');
    host.id = 'pdf-screen';
    host.style.cssText = 'position:absolute;left:0;top:0;z-index:1000;background:#f3f4f6;padding:20px;';
    document.body.appendChild(host);
    screen = { root: createRoot(host), host };
  }
  const d = derive(doc, DEFAULT_PREFS);
  const { root, host } = screen;
  const layout = layoutSheet(doc, d);
  flushSync(() => root.render(createElement(Paper, {
    doc, derived: d, layout, playingId: null, selectedId: null,
    onSelect: () => {}, onTitle: () => {}, onSubtitle: () => {},
  })));
  await document.fonts.ready;
  return {
    squeezed: Array.from(host.querySelectorAll('text[textLength]'), t => ({ text: t.textContent ?? '', textLength: Number(t.getAttribute('textLength')) })),
    tupletSides: Array.from(host.querySelectorAll('[data-tuplet]'), t => t.getAttribute('data-tuplet-side') ?? ''),
    voltas: host.querySelectorAll('[data-volta]').length,
    states: Array.from(new Set(Array.from(host.querySelectorAll('[data-state]'), e => e.getAttribute('data-state') ?? ''))),
    raised: host.querySelectorAll('tspan[data-ext][dy]').length,
    systems: layout.systems.map(s => s.bars.map(b => b.bar)),
    tuplets: Array.from(host.querySelectorAll('svg[data-testid="system"]')).flatMap((svg, system) =>
      Array.from(svg.querySelectorAll('[data-tuplet] text'), t => ({ x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')) + layout.stack.shift, system }))),
  };
}

/** What a scale PDF lays out, for the tests: per page the placed blocks, per line what the page draws under each note. */
export interface ScalePlanView {
  /** Blocks in units of the content box, after the group's scale: a line's `height` is its drawn height. */
  pages: { blocks: { kind: string; index?: number; y: number; height: number; scale: number; x0: number }[] }[];
  /** `viewTop`: the line svg's viewBox top; notes with x, name and per option the first label baseline and the label lines (line svg coordinates). */
  lines: { viewTop: number; notes: { x: number; name: string; options: { option: number; labelY: number; lines: string[] }[] }[] }[];
}

/** The page model's plan of a scale PDF, with the option labels the page draws (`detail` false skips rendering them). */
export async function scalePlan(input: ScalePdfInput, o: { language: string; detail?: boolean }): Promise<ScalePlanView> {
  await loadFonts();
  const plan = planScale(input);
  const size = pageSizeFor(o.language);
  const lines = scaleLines({ ...input });
  const pages = paginate(plan.blocks, pageHeightUnits(size)).map(groups => ({
    blocks: placeBlocks(groups).map(({ block, y, scale, x0 }) => ({
      kind: block.kind, index: block.index, y, scale, x0,
      height: (block.kind === 'line' ? lines[block.index!].height : block.height) * scale,
    })),
  }));
  const details: ScalePlanView['lines'] = [];
  if (o.detail !== false) {
    for (const line of lines) {
      const off = renderOffscreen(line.render());
      try {
        const svg = off.host.querySelector('svg[data-testid="scale-line"]')!;
        const notes = Array.from(svg.querySelectorAll('g[data-note]'), g => ({
          x: Number(g.querySelector('[data-name]')?.getAttribute('x') ?? g.querySelector('[data-option-name]')?.getAttribute('x') ?? Number.NaN),
          name: g.querySelector('[data-name]')?.textContent ?? '',
          options: Array.from(g.querySelectorAll('g[data-option]'), og => {
            const t = og.querySelector('text[data-option-name]');
            return {
              option: Number(og.getAttribute('data-option')),
              labelY: Number(t?.getAttribute('y') ?? Number.NaN),
              lines: t ? Array.from(t.querySelectorAll('tspan'), x => x.textContent ?? '') : [],
            };
          }),
        }));
        details.push({ viewTop: Number(svg.getAttribute('viewBox')!.split(' ')[1]), notes });
      } finally {
        off.dispose();
      }
    }
  }
  return { pages, lines: details };
}
