import { useEffect, useSyncExternalStore } from 'react';
import { JUMP_TEXT } from '../domain/jumps';
import type { Bar } from '../domain/types';
import { Glyph, GLYPH_SCALE, glyphInk } from './Glyph';
import type { SystemLayout } from './layout';
import { TEXT_EM_PER_CHAR } from './lyrics';
import { FONT } from './NoteView';
import { usePalette } from './palette';

/** Font size of the texts (px), and the baseline of the row's one line: signs and texts share it. */
export const MARK_FONT_PX = 13;
/** The least size a text shrinks to before the marks of a bar may reach past its left barline. */
export const MIN_FONT_PX = 10;
const TEXT_Y = 19;
/** The signs are drawn at 0.57 of the staff's scale: the Coda, 42px at full size, then fits the 30px row. */
export const SIGN_SCALE = GLYPH_SCALE * 0.57;
const SIGN_BASELINE = 22.5;
const EDGE = 4;           // distance of a mark from its bar's edge
const GAP = 8;            // between two marks of one bar
const MIN_GAP = 4;
const SIGN_TEXT_GAP = 5;  // between "To Coda" and its sign
const LAST_RESORT = { px: 6, gap: 2 };

/** The face of the texts, with the family name of the stylesheet (global.css imports it as 'Atkinson Hyperlegible'). */
const MARK_FACE = 'italic 700 13px "Atkinson Hyperlegible"';

// Texts are measured in the face, so the face must be there: it is requested at first use, and the marks are drawn
// again once it has arrived (until then the browser measures in its fallback face).
let faceRequested = false;
let faceVersion = 0;
const faceListeners = new Set<() => void>();

/** Test hook: forget that the face was requested. */
export function resetMarkFace(): void { faceRequested = false; faceVersion = 0; }

function requestFace(): void {
  if (faceRequested) return;
  faceRequested = true;
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;   // jsdom has none
  if (!fonts || typeof fonts.load !== 'function') return;
  try {
    if (typeof fonts.check === 'function' && fonts.check(MARK_FACE)) return;
    fonts.load(MARK_FACE).then(() => { faceVersion++; faceListeners.forEach(f => f()); }, () => undefined);
  } catch { /* no font loading API: the marks keep their first measure */ }
}

/** Requests the face at first use; the number changes when it has loaded, so a component that reads it draws again. */
export function useMarkFace(): number {
  useEffect(requestFace, []);
  return useSyncExternalStore(
    on => { faceListeners.add(on); return () => { faceListeners.delete(on); }; },
    () => faceVersion,
    () => 0,
  );
}

let context: CanvasRenderingContext2D | null | undefined;
/** A canvas to measure text with: only in a browser (jsdom has none). */
function measuring(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    context = null;
    if (typeof document !== 'undefined' && !/jsdom/i.test(navigator.userAgent)) {
      try { context = document.createElement('canvas').getContext('2d'); } catch { context = null; }
    }
  }
  return context;
}

/**
 * Advance of a text in bold italic (px). In a browser the text is measured in the sheet's font, plus 4 %; without a
 * canvas (unit tests) it is estimated at 0.55 em per character, which is wider than the font's real advance.
 */
export function markTextWidth(text: string, px = MARK_FONT_PX): number {
  const c = measuring();
  if (c) {
    c.font = `italic 700 ${px}px ${FONT}`;
    return c.measureText(text).width * 1.04;
  }
  return text.length * TEXT_EM_PER_CHAR * px;
}

const signWidth = (name: 'segno' | 'coda') => {
  const ink = glyphInk(name);
  return (ink.right - ink.left) * (SIGN_SCALE / GLYPH_SCALE);
};
/** The sign's x origin that puts its ink's left edge on x. */
const signOrigin = (name: 'segno' | 'coda', x: number) => x - glyphInk(name).left * (SIGN_SCALE / GLYPH_SCALE);

export type MarkKind = 'segno' | 'coda' | 'toCoda' | 'fine' | 'jump';
/** One mark placed: its box spans x1 to x2 (ink); `px` is its text size. */
export interface PlacedMark { kind: MarkKind; bar: number; x1: number; x2: number; px: number }

const LEFT: MarkKind[] = ['segno', 'coda'];
const RIGHT: MarkKind[] = ['toCoda', 'fine', 'jump'];     // left to right

const textOf = (kind: MarkKind, b: Bar) => (kind === 'toCoda' ? 'To Coda' : kind === 'fine' ? 'Fine' : JUMP_TEXT[b.jump!]);
function widthOf(kind: MarkKind, b: Bar, px: number): number {
  if (kind === 'segno' || kind === 'coda') return signWidth(kind);
  const text = markTextWidth(textOf(kind, b), px);
  return kind === 'toCoda' ? text + SIGN_TEXT_GAP + signWidth('coda') : text;
}

/**
 * Where the marks of a system go. Segno and Coda start at the left edge of their bar; "To Coda", "Fine" and the jump
 * text end at its right edge, the jump text last. When they do not fit side by side the gap shrinks to 4 px, then the
 * texts of that bar shrink to 10 px. If they still do not fit, all marks of the bar form one run that ends at the right
 * edge and reaches left past the barline: never into the clef of the first bar or over a mark of the bar before.
 * Only then, if even that run does not fit, texts shrink further (down to 6 px).
 */
export function planMarks(system: SystemLayout, score: Bar[]): PlacedMark[] {
  const out: PlacedMark[] = [];
  let taken = 0;                        // right end of what the bar before has put on the row
  system.bars.forEach((bar, i) => {
    const b = score[bar.bar];
    const left = LEFT.filter(k => b[k]);
    const right = RIGHT.filter(k => (k === 'jump' ? b.jump : b[k]));
    const kinds = [...left, ...right];
    const from = bar.x + EDGE;
    const to = bar.x + bar.width - EDGE;
    const limit = i === 0 ? from : Math.max(system.bars[i - 1].x + EDGE, taken + MIN_GAP);
    const total = (px: number, gap: number) => kinds.reduce((s, k) => s + widthOf(k, b, px), 0) + gap * (kinds.length - 1);
    const placed: PlacedMark[] = [];
    const run = (x: number, ks: MarkKind[], px: number, gap: number) => ks.forEach(k => {
      const w = widthOf(k, b, px);
      placed.push({ kind: k, bar: bar.bar, x1: x, x2: x + w, px });
      x += w + gap;
    });
    if (kinds.length > 0) {
      const steps: [number, number][] = [[MARK_FONT_PX, GAP], [MARK_FONT_PX, MIN_GAP]];
      for (let px = MARK_FONT_PX - 0.5; px >= MIN_FONT_PX; px -= 0.5) steps.push([px, MIN_GAP]);
      const fit = steps.find(([px, gap]) => total(px, gap) <= to - from);
      if (fit) {
        const [px, gap] = fit;
        run(from, left, px, gap);
        const rightWidth = right.reduce((s, k) => s + widthOf(k, b, px), 0) + gap * (right.length - 1);
        run(to - rightWidth, right, px, gap);
      } else {
        let px = MIN_FONT_PX;
        let gap = MIN_GAP;
        while (to - total(px, gap) < limit && px > LAST_RESORT.px) { px -= 0.5; gap = px >= MIN_FONT_PX ? MIN_GAP : LAST_RESORT.gap; }
        run(to - total(px, gap), kinds, px, gap);
      }
    }
    out.push(...placed);
    taken = placed.length > 0 ? Math.max(...placed.map(m => m.x2)) : from - MIN_GAP;
  });
  return out;
}

/**
 * The jump marks of one system, in the row above it (y from 0 to the row's height, see `markRow`), placed by `planMarks`.
 * `drop` moves the marks down (see `markDrop`).
 * Every element carries `data-jump` (the PDF keeps it; `data-mark` would be deleted from the PDF and hidden in print).
 */
export function JumpMarks(p: { system: SystemLayout; score: Bar[]; drop?: number }): JSX.Element {
  const pal = usePalette();
  useMarkFace();
  const drop = p.drop ?? 0;
  const textY = TEXT_Y + drop;
  const signY = SIGN_BASELINE + drop;
  return (
    <>
      {planMarks(p.system, p.score).map(m => {
        const key = `${m.bar}-${m.kind}`;
        const text = (s: string, x: number) => (
          <text x={x} y={textY} textAnchor="end" fontSize={m.px} fontWeight={700} fontStyle="italic" fontFamily={FONT} fill={pal.ink}>{s}</text>
        );
        if (m.kind === 'segno' || m.kind === 'coda') {
          return (
            <g key={key} data-jump={m.kind}>
              <Glyph name={m.kind} x={signOrigin(m.kind, m.x1)} y={signY} scale={SIGN_SCALE} fill={pal.ink} />
            </g>
          );
        }
        if (m.kind === 'toCoda') {
          return (
            <g key={key} data-jump="toCoda">
              {text('To Coda', m.x2 - signWidth('coda') - SIGN_TEXT_GAP)}
              <Glyph name="coda" x={signOrigin('coda', m.x2 - signWidth('coda'))} y={signY} scale={SIGN_SCALE} fill={pal.ink} />
            </g>
          );
        }
        const s = textOf(m.kind, p.score[m.bar]);
        return <text key={key} data-jump={m.kind} x={m.x2} y={textY} textAnchor="end" fontSize={m.px} fontWeight={700} fontStyle="italic" fontFamily={FONT} fill={pal.ink}>{s}</text>;
      })}
    </>
  );
}
