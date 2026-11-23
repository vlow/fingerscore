// Development-only proof that jsPDF + svg2pdf.js turn one system of the sheet into a PDF page with the embedded
// text font. Loaded through a dynamic import behind import.meta.env.DEV (src/main.tsx); not part of a production build.
import { jsPDF } from 'jspdf';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { svg2pdf } from 'svg2pdf.js';
import glyphs from '../data/glyphs.json';
import { parseChord } from '../domain/chords';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { inst } from '../domain/instruments';
import { mod12 } from '../domain/keys';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { layoutSheet, SHEET } from '../render/layout';
import { CHORD_FONT_PX } from '../render/NoteView';
import { SystemView, tieSegments } from '../render/SystemView';
import regular from './fonts/atkinson-hyperlegible-latin-400-normal.ttf?url';
import bold from './fonts/atkinson-hyperlegible-latin-700-normal.ttf?url';
import boldItalic from './fonts/atkinson-hyperlegible-latin-700-italic.ttf?url';
import regularExt from './fonts/atkinson-hyperlegible-latin-ext-400-normal.ttf?url';
import boldExt from './fonts/atkinson-hyperlegible-latin-ext-700-normal.ttf?url';
import boldItalicExt from './fonts/atkinson-hyperlegible-latin-ext-700-italic.ttf?url';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FAMILY = 'Atkinson Hyperlegible';
const FAMILY_EXT = 'Atkinson Hyperlegible Ext';
/** jsPDF font style names, as svg2pdf derives them from font-weight 400/700 and font-style normal/italic. */
const FONTS: [string, string, string][] = [
  [regular, FAMILY, 'normal'], [bold, FAMILY, 'bold'], [boldItalic, FAMILY, 'bolditalic'],
  [regularExt, FAMILY_EXT, 'normal'], [boldExt, FAMILY_EXT, 'bold'], [boldItalicExt, FAMILY_EXT, 'bolditalic'],
];

const PAGE = { width: 210, height: 297, margin: 12 };
const CONTENT_W = PAGE.width - 2 * PAGE.margin;

/** Symbols the text font lacks, drawn from the music font's outlines (glyphs.json, 1000 units per em, y up). */
const SYMBOLS: Record<string, keyof typeof glyphs.paths> = { '♭': 'flat', '♯': 'sharp', '♮': 'natural', '𝄫': 'doubleFlat', '𝄪': 'doubleSharp' };
/** A symbol is drawn 1.2 text em tall per music-font em: a flat then reaches about cap height. */
const SYMBOL_EM = 1.2;
const CAP_HEIGHT = 0.668;   // Atkinson Hyperlegible, OS/2 sCapHeight / unitsPerEm
const symbolScale = (fontSize: number) => (fontSize * SYMBOL_EM) / 1000;
const symbolInk = (name: keyof typeof glyphs.paths) => glyphs.bbox[name] as [number, number, number, number];

/** The sample song's first system with a chord B♭m7, a squeezed lyric and a bracketed triplet. */
function spikeDoc(): Doc {
  const doc = sampleDoc();
  doc.show = { ...doc.show, raiseExtensions: false };
  const [pickup, , , bar3] = doc.score;
  const tk = mod12(doc.shift + inst(doc.inst).off);   // chords spelled in the key shown are drawn as written
  doc.chords[pickup.ev[0].id] = parseChord('B♭m7', tk);
  pickup.ev[2].l = 'everyone';                        // a long syllable on an eighth between "wat-" and "is": condensed
  bar3.ev = [
    { id: 't1', m: 57, d: 8, r: false, tie: false, l: 'tri' },
    { id: 't2', m: 59, d: 8, r: false, tie: false, l: 'o' },
    { id: 't3', m: 62, d: 8, r: false, tie: false, l: 'let' },
    { id: 't4', m: 57, d: 24, r: false, tie: false, l: '' },
  ];
  return doc;
}

function binaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

async function newPdf(): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: 'mm', format: [PAGE.width, PAGE.height], orientation: 'portrait' });
  await Promise.all(FONTS.map(async ([url, family, style]) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font ${url}: ${res.status}`);
    const file = url.split('/').pop()!;
    pdf.addFileToVFS(file, binaryString(await res.arrayBuffer()));
    pdf.addFont(file, family, style);
  }));
  return pdf;
}

/** Nearest value of a presentation attribute on the element or its ancestors. */
function inherited(el: Element, name: string): string | null {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const v = e.getAttribute(name);
    if (v !== null) return v;
  }
  return null;
}

function fontStyle(el: Element): string {
  const weight = inherited(el, 'font-weight') ?? '400';
  const b = weight === 'bold' || Number(weight) >= 600;
  const i = inherited(el, 'font-style') === 'italic';
  return b ? (i ? 'bolditalic' : 'bold') : i ? 'italic' : 'normal';
}

interface Piece { text: string; symbol: keyof typeof glyphs.paths | null; size: number; style: string; dy: number; dx: number }

/** The text's characters as pieces of plain text and symbols, with each piece's size and baseline shift. */
function pieces(text: SVGTextElement): Piece[] {
  const out: Piece[] = [];
  let shift = 0;
  const add = (node: Node, owner: Element) => {
    const size = Number(inherited(owner, 'font-size'));
    const style = fontStyle(owner);
    let dx = 0;
    if (owner !== text && node === owner.firstChild) {
      dx = Number(owner.getAttribute('dx') ?? 0);
      shift += Number(owner.getAttribute('dy') ?? 0);
    }
    for (const ch of Array.from(node.textContent ?? '')) {
      const symbol = SYMBOLS[ch] ?? null;
      const last = out[out.length - 1];
      if (!symbol && dx === 0 && last && !last.symbol && last.size === size && last.style === style && last.dy === shift) last.text += ch;
      else out.push({ text: ch, symbol, size, style, dy: shift, dx });
      dx = 0;
    }
  };
  for (const node of Array.from(text.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) add(node, text);
    else if (node instanceof Element) for (const inner of Array.from(node.childNodes)) add(inner, node);
  }
  return out;
}

/**
 * Replaces a text that the converter cannot draw as emitted (a symbol the font lacks, tspans, a squeezed width)
 * by a group of start-anchored pieces laid out with the PDF font's own advance widths, scaled to textLength.
 */
function layOutText(text: SVGTextElement, pdf: jsPDF): void {
  const parts = pieces(text);
  const widths = parts.map(p => {
    if (p.symbol) { const [x1, , x2] = symbolInk(p.symbol); return (x2 - x1) * symbolScale(p.size); }
    pdf.setFont(FAMILY, p.style);
    return pdf.getStringUnitWidth(p.text) * p.size;
  });
  const natural = parts.reduce((s, p, i) => s + p.dx + widths[i], 0);
  const textLength = text.getAttribute('textLength');
  const k = textLength === null ? 1 : Number(textLength) / natural;
  const anchor = text.getAttribute('text-anchor') ?? 'start';
  const x = Number(text.getAttribute('x') ?? 0);
  const y = Number(text.getAttribute('y') ?? 0);
  const x0 = anchor === 'middle' ? x - (natural * k) / 2 : anchor === 'end' ? x - natural * k : x;

  const g = document.createElementNS(SVG_NS, 'g');
  for (const a of Array.from(text.attributes)) {
    if (!['x', 'y', 'textLength', 'lengthAdjust', 'text-anchor'].includes(a.name)) g.setAttribute(a.name, a.value);
  }
  g.setAttribute('transform', `translate(${x0} ${y}) scale(${k} 1)`);
  let pen = 0;
  parts.forEach((p, i) => {
    pen += p.dx;
    if (p.symbol) {
      const s = symbolScale(p.size);
      const [x1, y1, , y2] = symbolInk(p.symbol);
      // Flats sit on the baseline; the other symbols are centred on half the cap height.
      const oy = p.symbol === 'flat' || p.symbol === 'doubleFlat' ? y1 * s : -(CAP_HEIGHT * p.size) / 2 + ((y1 + y2) / 2) * s;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', glyphs.paths[p.symbol]);
      path.setAttribute('transform', `translate(${pen - x1 * s} ${p.dy + oy}) scale(${s} ${-s})`);
      path.setAttribute('stroke', 'none');
      g.appendChild(path);
    } else {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(pen));
      t.setAttribute('y', String(p.dy));
      t.setAttribute('font-size', String(p.size));
      t.setAttribute('text-anchor', 'start');
      t.textContent = p.text;
      g.appendChild(t);
    }
    pen += widths[i];
  });
  text.replaceWith(g);
}

/** The preparation steps found necessary in the spike (see the task report's feature record). */
function prepare(svg: SVGSVGElement, pdf: jsPDF): void {
  svg.setAttribute('overflow', 'visible');
  // Invisible click areas would still be drawn, with opacity 0.
  svg.querySelectorAll('[fill="transparent"]').forEach(e => e.remove());
  // paint-order="stroke": a copy filled with the stroke colour under the plain fill.
  svg.querySelectorAll('text[paint-order="stroke"]').forEach(t => {
    const under = t.cloneNode(true) as SVGTextElement;
    under.removeAttribute('paint-order');
    under.setAttribute('fill', t.getAttribute('stroke') ?? 'none');
    t.before(under);
    t.removeAttribute('stroke');
    t.removeAttribute('stroke-width');
    t.removeAttribute('paint-order');
  });
  const symbol = new RegExp(`[${Object.keys(SYMBOLS).join('')}]`, 'u');
  svg.querySelectorAll('text').forEach(t => {
    if (t.hasAttribute('textLength') || t.children.length > 0 || symbol.test(t.textContent ?? '')) layOutText(t, pdf);
  });
}

async function fontsReady(): Promise<void> {
  await Promise.all(['400', '700', 'italic 700'].map(w => document.fonts.load(`${w} 13px '${FAMILY}'`)));
}

/** Converts an SVG drawing of the given unit width onto the page, its width filling the content width. */
async function convert(markup: string, unitWidth: number, unitHeight: number, prep: boolean): Promise<Uint8Array> {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;';
  host.innerHTML = markup;
  document.body.appendChild(host);
  try {
    await fontsReady();
    const svg = host.querySelector('svg')!;
    const pdf = await newPdf();
    if (prep) prepare(svg, pdf);
    const width = CONTENT_W;
    await svg2pdf(svg, pdf, { x: PAGE.margin, y: PAGE.margin, width, height: (width * unitHeight) / unitWidth });
    return new Uint8Array(pdf.output('arraybuffer'));
  } finally {
    host.remove();
  }
}

export interface SpikeResult {
  pdf: number[];
  /** The system's SVG as the app draws it, for a screenshot beside the PDF. */
  markup: string;
  /** Ink width of the flat drawn in the chord, in system units. */
  flatWidth: number;
}

/** One system of the sample song (with B♭m7, a squeezed lyric and a triplet) as a one-page PDF. */
export async function spikePdf(): Promise<SpikeResult> {
  const doc = spikeDoc();
  const derived = derive(doc, DEFAULT_PREFS);
  const layout = layoutSheet(doc, derived);
  const system = layout.systems[0];
  const markup = renderToStaticMarkup(createElement(SystemView, {
    doc, derived, system, beams: layout.beams, tuplets: layout.tuplets, ties: tieSegments(derived, layout)[0],
    playingId: null, selectedId: null, onSelect: () => {}, lastSystem: layout.systems.length === 1,
  }));
  if (!markup.includes('textLength')) throw new Error('spike: no lyric is squeezed');
  const pdf = await convert(markup, SHEET.systemWidth, SHEET.systemHeight, true);
  const [x1, , x2] = symbolInk('flat');
  return { pdf: Array.from(pdf), markup, flatWidth: (x2 - x1) * symbolScale(CHORD_FONT_PX) };
}

/** Each SVG feature of the feature record, converted without preparation. */
const PROBE = `<svg xmlns="${SVG_NS}" width="860" height="290" viewBox="0 0 860 290">
  <g font-family="'Atkinson Hyperlegible', system-ui, sans-serif" font-size="14" fill="#15171C">
    <line x1="100" y1="0" x2="100" y2="290" stroke="#B91C1C" stroke-width="0.5"/>
    <text x="100" y="20" text-anchor="middle">middle Wide</text>
    <text x="100" y="40" text-anchor="middle" font-weight="700">bold Wide</text>
    <text x="100" y="60" text-anchor="middle" font-weight="700" font-style="italic">bolditalic 3</text>
    <text x="100" y="80" font-family="Nope, 'Atkinson Hyperlegible', sans-serif">quoted stack</text>
    <rect x="60" y="88" width="80" height="16" fill="none" stroke="#B91C1C" stroke-width="0.5"/>
    <text x="100" y="100" text-anchor="middle" textLength="80" lengthAdjust="spacingAndGlyphs">squeezed syllable</text>
    <text x="100" y="130" text-anchor="middle">C<tspan dy="-6" dx="1" font-size="9">maj7</tspan><tspan dy="6">/E</tspan></text>
    <rect x="80" y="140" width="40" height="20" fill="#0E6E68"/>
    <text x="100" y="156" text-anchor="middle" font-size="16" font-weight="700" stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke">3</text>
    <rect x="200" y="10" width="60" height="40" fill="transparent" stroke="none"/>
    <rect x="200" y="10" width="60" height="40" fill="none" stroke="#5B616E" stroke-dasharray="3 2"/>
    <rect x="280" y="10" width="60" height="40" rx="6" fill="#E3F4F2" stroke="#0E6E68" stroke-width="1.5"/>
    <ellipse cx="380" cy="30" rx="6" ry="4.5" transform="rotate(-22 380 30)" fill="#15171C"/>
    <ellipse cx="400" cy="30" rx="5" ry="3.5" transform="rotate(-22 400 30)" fill="none" stroke="#15171C" stroke-width="2"/>
    <path d="M420 40A20 5 0 0 1 480 40" fill="none" stroke="#15171C" stroke-width="1.5"/>
    <path d="M500 20A7 7 0 0 1 507 27V34" fill="none" stroke="#15171C" stroke-width="2"/>
    <text x="840" y="-4" text-anchor="middle" font-weight="700">above</text>
    <rect x="850" y="100" width="30" height="10" fill="#B45309"/>
  </g>
</svg>`;

/** The probe drawing converted as emitted; `overflowVisible` adds overflow="visible" to the outer svg. */
export async function probePdf(overflowVisible: boolean): Promise<number[]> {
  const markup = overflowVisible ? PROBE.replace('<svg ', '<svg overflow="visible" ') : PROBE;
  return Array.from(await convert(markup, 860, 290, false));
}
