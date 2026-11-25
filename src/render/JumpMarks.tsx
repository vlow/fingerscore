import type { Bar } from '../domain/types';
import { JUMP_TEXT } from '../domain/jumps';
import { Glyph, GLYPH_SCALE, glyphInk } from './Glyph';
import type { BarLayout } from './layout';
import { TEXT_EM_PER_CHAR } from './lyrics';
import { FONT } from './NoteView';
import { usePalette } from './palette';

/** Font size of the texts (px), and the baseline of the row's one line: signs and texts share it. */
export const MARK_FONT_PX = 13;
const TEXT_Y = 19;
/** The signs are drawn at 0.57 of the staff's scale: the Coda, 42px at full size, then fits the 30px row. */
export const SIGN_SCALE = GLYPH_SCALE * 0.57;
const SIGN_BASELINE = 22.5;
const EDGE = 4;           // distance of a mark from its bar's edge
const GAP = 8;            // between two marks of one bar
const SIGN_TEXT_GAP = 5;  // between "To Coda" and its sign

/** Estimated advance of a text in bold italic (px); the page's font is not measured on the sheet. */
export const markTextWidth = (text: string) => text.length * TEXT_EM_PER_CHAR * MARK_FONT_PX;

const TEXT_PROPS = { fontSize: MARK_FONT_PX, fontWeight: 700, fontStyle: 'italic', fontFamily: FONT } as const;

/** The sign's x origin that puts its ink's left (`at: 'left'`) or right edge on x. */
function signOrigin(name: 'segno' | 'coda', x: number, at: 'left' | 'right'): number {
  const ink = glyphInk(name);
  return at === 'left' ? x - ink.left * (SIGN_SCALE / GLYPH_SCALE) : x - ink.right * (SIGN_SCALE / GLYPH_SCALE);
}
const signWidth = (name: 'segno' | 'coda') => {
  const ink = glyphInk(name);
  return (ink.right - ink.left) * (SIGN_SCALE / GLYPH_SCALE);
};

/**
 * The jump marks of one bar, in the row above the system (y from 0 to the row's height, see `markRow`):
 * Segno and Coda at the left edge, the Segno first; Fine, To Coda (text, then the Coda sign) and the jump text
 * right-aligned at the right edge, the jump text last. Every element carries `data-jump` (the PDF keeps it;
 * `data-mark` would be deleted from the PDF and hidden in print).
 */
export function JumpMarks(p: { bar: BarLayout; mark: Bar }): JSX.Element {
  const pal = usePalette();
  const { mark } = p;
  const items: JSX.Element[] = [];

  let left = p.bar.x + EDGE;
  for (const kind of ['segno', 'coda'] as const) {
    if (!mark[kind]) continue;
    items.push(
      <g key={kind} data-jump={kind}>
        <Glyph name={kind} x={signOrigin(kind, left, 'left')} y={SIGN_BASELINE} scale={SIGN_SCALE} fill={pal.ink} />
      </g>,
    );
    left += signWidth(kind) + GAP;
  }

  let right = p.bar.x + p.bar.width - EDGE;
  const text = (kind: string, s: string, x: number) => (
    <text key={kind} data-jump={kind} x={x} y={TEXT_Y} textAnchor="end" {...TEXT_PROPS} fill={pal.ink}>{s}</text>
  );
  if (mark.jump) {
    const s = JUMP_TEXT[mark.jump];
    items.push(text('jump', s, right));
    right -= markTextWidth(s) + GAP;
  }
  if (mark.fine) {
    items.push(text('fine', 'Fine', right));
    right -= markTextWidth('Fine') + GAP;
  }
  if (mark.toCoda) {
    const sign = signOrigin('coda', right, 'right');
    const textEnd = right - signWidth('coda') - SIGN_TEXT_GAP;
    items.push(
      <g key="toCoda" data-jump="toCoda">
        <text x={textEnd} y={TEXT_Y} textAnchor="end" {...TEXT_PROPS} fill={pal.ink}>To Coda</text>
        <Glyph name="coda" x={sign} y={SIGN_BASELINE} scale={SIGN_SCALE} fill={pal.ink} />
      </g>,
    );
  }
  return <>{items}</>;
}
