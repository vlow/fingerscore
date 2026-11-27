import { useRef, useState, type MouseEvent } from 'react';
import { noteNameFlat } from '../../domain/instruments';
import { spell } from '../../domain/keys';
import { Glyph } from '../../render/Glyph';
import { SHEET } from '../../render/layout';
import { ACCIDENTAL_GAP, LedgerLines, NoteHead, yOfPos } from '../../render/NoteView';
import { usePalette } from '../../render/palette';
import s from '../Fingerings.module.css';
import { naturalAt, posAt, posOfPitch, shownPositions } from './staff';

const WIDTH = 240;
const NOTE_X = 150;
const GHOST_X = 150;
const WHOLE = 48;
const TAG_PX = 13;

/**
 * A treble staff in written pitch (design 4.2). Pointing at a line or space shows a ghost note with its name; outside
 * the instrument's range the area is shaded and the name says so. A click picks the natural note there; ♭ ♮ ♯ beside
 * it alter it. Like the chart, the staff is pointer-only: the letter buttons do the same from the keyboard.
 */
export function StaffPicker(p: { pitch: number; lo: number; hi: number; onPick(pitch: number): void }) {
  const pal = usePalette();
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { low, high } = shownPositions(p.lo, p.hi);
  const top = yOfPos(high) - 14;
  const bottom = yOfPos(low) + 14;
  const fits = (pos: number) => {
    const n = naturalAt(pos);
    return n >= p.lo && n <= p.hi;
  };

  /** The line or space under the pointer, from the pointer's place in the drawing's own units. */
  const posOfEvent = (e: MouseEvent) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return Math.min(high, Math.max(low, posAt(point.y, SHEET.staffBottom)));
  };

  const current = spell(p.pitch, -1);
  const pos = posOfPitch(p.pitch);
  // Bands for the lines and spaces outside the range: one below the range and one above it.
  const outside: number[] = [];
  for (let q = low; q <= high; q++) if (!fits(q)) outside.push(q);
  const below = outside.filter(q => naturalAt(q) < p.lo);
  const above = outside.filter(q => naturalAt(q) > p.hi);
  // Each band runs to the edge of the drawing, so it reads as an area rather than as another line.
  const shade = (y1: number, y2: number, key: string) => (
    <rect key={key} x={0} width={WIDTH} y={y1} height={y2 - y1} fill={pal.ghostKey} opacity={0.3} />
  );
  const belowBand = below.length === 0 ? null : shade(yOfPos(Math.max(...below)) - 2.5, bottom, 'below');
  const aboveBand = above.length === 0 ? null : shade(top, yOfPos(Math.min(...above)) + 2.5, 'above');
  const ghostName = hover === null ? '' : noteNameFlat(naturalAt(hover));

  return (
    <figure className={s.staff}>
      <svg ref={svg} viewBox={`0 ${top} ${WIDTH} ${bottom - top}`} role="img"
        aria-label={`Staff showing ${noteNameFlat(p.pitch)}. Point at a line or space to see its note; click to choose it.`}>
        {belowBand}
        {aboveBand}
        {[0, 1, 2, 3, 4].map(i => <rect key={i} x={0} y={SHEET.staffTop + 10 * i} width={WIDTH} height={1} fill={pal.staff} />)}
        <Glyph name="trebleClef" x={6} y={SHEET.staffBottom} />
        {hover !== null && hover !== pos && (
          <g opacity={0.45} data-ghost="">
            <LedgerLines pos={hover} x={GHOST_X} />
            <NoteHead d={WHOLE} x={GHOST_X} y={yOfPos(hover)} color={fits(hover) ? pal.ink : pal.muted} />
          </g>
        )}
        <LedgerLines pos={pos} x={NOTE_X} />
        {current.alter !== 0 && <Glyph name={current.alter < 0 ? 'flat' : 'sharp'} x={NOTE_X - 8 - ACCIDENTAL_GAP} y={yOfPos(pos)} />}
        <NoteHead d={WHOLE} x={NOTE_X} y={yOfPos(pos)} color={pal.ink} />
        {hover !== null && (
          <text x={GHOST_X + 14} y={yOfPos(hover) + 4} fontSize={TAG_PX} fontWeight={700} fill={fits(hover) ? pal.text : pal.muted}
            fontFamily="'Atkinson Hyperlegible', system-ui, sans-serif">
            {fits(hover) ? ghostName : `${ghostName} · out of range`}
          </text>
        )}
        <rect data-staff-hit="" x={0} y={top} width={WIDTH} height={bottom - top} fill="transparent" style={{ cursor: 'pointer' }}
          onMouseMove={e => setHover(posOfEvent(e))} onMouseLeave={() => setHover(null)}
          onClick={e => {
            const q = posOfEvent(e);
            if (q !== null && fits(q)) p.onPick(naturalAt(q));
          }} />
      </svg>
      <figcaption className={s.muted}>Point to see a note, click to choose it. Shaded: outside the range of the instrument.</figcaption>
    </figure>
  );
}
