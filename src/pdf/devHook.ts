// Development only: lets the Playwright tests (e2e/pdf-content.spec.ts) build sheet PDFs and show the same sheet on screen.
// Loaded through a dynamic import behind import.meta.env.DEV (src/main.tsx); not part of a production build.
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { inst } from '../domain/instruments';
import { mod12 } from '../domain/keys';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { layoutSheet } from '../render/layout';
import { Paper } from '../render/Paper';
import { loadFonts } from './engine';
import { pageHeightUnits, pageSizeFor, paginate } from './pageModel';
import { makeSheetPdf, planSheet } from './sheetPdf';

/** Helpers the tests use to build documents in the page. */
export { derive, inst, mod12, parseChord, sampleDoc };

export interface HookResult {
  /** The PDF, base64. */
  pdf?: string;
  type?: string;
  error?: { name: string; message: string };
  progress: [number, number][];
  /** onProgress calls after the signal fired. */
  progressAfterAbort: number;
  ms: number;
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** makeSheetPdf for a document; `abortAtPage` fires the signal from the progress report of that page, `abortBefore` before the start. */
export async function sheetPdf(doc: Doc, o: { language: string; abortAtPage?: number; abortBefore?: boolean }): Promise<HookResult> {
  const ctl = new AbortController();
  if (o.abortBefore) ctl.abort();
  const progress: [number, number][] = [];
  let progressAfterAbort = 0;
  const t0 = performance.now();
  try {
    const blob = await makeSheetPdf(doc, {
      language: o.language, signal: ctl.signal,
      onProgress: (n, total) => {
        if (ctl.signal.aborted) progressAfterAbort++;
        progress.push([n, total]);
        if (n === o.abortAtPage) ctl.abort();
      },
    });
    return { pdf: await base64(blob), type: blob.type, progress, progressAfterAbort, ms: performance.now() - t0 };
  } catch (e) {
    const err = e as Error;
    return { error: { name: err.name, message: err.message }, progress, progressAfterAbort, ms: performance.now() - t0 };
  }
}

/** The number of pages the page model gives the document. */
export async function expectedPages(doc: Doc, language: string): Promise<number> {
  await loadFonts();
  const d = derive(doc, DEFAULT_PREFS);
  return paginate(planSheet(doc, d, layoutSheet(doc, d)).blocks, pageHeightUnits(pageSizeFor(language))).length;
}

let screen: { root: Root; host: HTMLElement } | null = null;

/** Shows the document's paper over the app, as the sheet page draws it, for a screenshot; returns what the paper drew. */
export async function showPaper(doc: Doc): Promise<{ squeezed: { text: string; textLength: number }[]; tupletSides: string[]; voltas: number; states: string[]; raised: number; systems: number[][] }> {
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
  };
}
