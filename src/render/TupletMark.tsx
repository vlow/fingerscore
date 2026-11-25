import type { DerivedEvent } from '../domain/derive';
import { notatedLength } from '../domain/triplets';
import { glyphInk } from './Glyph';
import { SHEET, type BeamGroup, type TupletMark } from './layout';
import { ACCIDENTAL_GAP, FONT, STEM, stemUp, yOfPos } from './NoteView';
import { usePalette } from './palette';

export interface Placed { ev: DerivedEvent; x: number; y: number }

interface Box { x1: number; x2: number; y1: number; y2: number }
interface BeamGeo { up: boolean; tip: number }

/** Stem direction of a beam group (by its average staff position) and the y of its stem tips. */
export function beamGeometry(notes: Placed[]): BeamGeo {
  const up = notes.reduce((s, n) => s + n.ev.pos, 0) / notes.length < 4;
  const ys = notes.map(n => n.y);
  return { up, tip: up ? Math.min(...ys) - 30 : Math.max(...ys) + 30 };
}

const FONT_PX = 12;
const GAP = 6;            // clear space between the group's ink and the mark
const HOOK = 4;           // bracket end hooks point at the notes
const DIGIT_H = 9;        // ink height of the 3 at FONT_PX
const NUMBER_HALF_W = 5;
const HALF_GAP = 8;       // half width of the bracket's opening around the number
const CLEAR = 3;          // least distance to the ink of the neighbouring events
const STEP = 3;           // how far a mark moves out to find clear space
const MAX_STEPS = 14;
const REST_HALF_H = 12;
const CHART_LIMIT = SHEET.chartY - CLEAR;
const STAFF_LINES = [0, 1, 2, 3, 4].map(i => SHEET.staffTop + 10 * i + 0.5);

/** Ink of one event: head, accidental, ledger lines, stem, flags (a beamed event's stem reaches its beam tip). */
export function eventInk(n: Placed, beam: BeamGeo | undefined): Box[] {
  const { x, y, ev } = n;
  if (ev.rest) return [{ x1: x - 7, x2: x + 7, y1: y - REST_HALF_H, y2: y + REST_HALF_H }];
  const out: Box[] = [{ x1: x - 6, x2: x + 6, y1: y - 5, y2: y + 5 }];
  if (ev.accidental) {
    const ink = glyphInk(ev.accidental);
    const x2 = x - ACCIDENTAL_GAP;
    out.push({ x1: x2 - (ink.right - ink.left), x2, y1: y - 10, y2: y + 10 });
  }
  for (let q = -2; q >= ev.pos; q -= 2) out.push({ x1: x - 10, x2: x + 10, y1: yOfPos(q), y2: yOfPos(q) + 1.3 });
  for (let q = 10; q <= ev.pos; q += 2) out.push({ x1: x - 10, x2: x + 10, y1: yOfPos(q), y2: yOfPos(q) + 1.3 });
  const d = notatedLength(ev.d);
  if (d >= 48) return out;
  const up = beam ? beam.up : stemUp(ev);
  const sx = x + (up ? STEM.upDx : STEM.downDx);
  const end = beam ? beam.tip : up ? y - STEM.length : y + STEM.length;
  out.push({ x1: sx, x2: sx + STEM.width, y1: Math.min(y, end), y2: Math.max(y, end) });
  const flags = beam ? 0 : d === 3 ? 2 : d === 6 || d === 9 ? 1 : 0;
  if (flags > 0) {
    const reach = 15 + 7 * (flags - 1);
    out.push(up
      ? { x1: x + 5, x2: x + 13, y1: y - STEM.length, y2: y - STEM.length + reach }
      : { x1: x - 6.5, x2: x + 2.5, y1: y + STEM.length - reach, y2: y + STEM.length });
  }
  return out;
}

/** Ink of a beam group: stems are in eventInk; this is the bars across their tips (two levels, to be safe). */
export function beamInk(notes: Placed[], geo: BeamGeo): Box {
  const sx = (n: Placed) => n.x + (geo.up ? STEM.upDx : STEM.downDx);
  return {
    x1: sx(notes[0]), x2: sx(notes[notes.length - 1]) + STEM.width,
    y1: geo.up ? geo.tip : geo.tip - 10, y2: geo.up ? geo.tip + 10 : geo.tip,
  };
}

const union = (boxes: Box[]): Box => ({
  x1: Math.min(...boxes.map(b => b.x1)), x2: Math.max(...boxes.map(b => b.x2)),
  y1: Math.min(...boxes.map(b => b.y1)), y2: Math.max(...boxes.map(b => b.y2)),
});

export interface TupletProps {
  mark: TupletMark;
  /** The beam group of each beamed event and every placed event of the system; the marks and ids of the mark's bar. */
  beamOf: Map<string, BeamGroup>; byId: Map<string, Placed>; marks: TupletMark[]; barIds: string[];
  volta: boolean;
}

export interface Candidate { side: 'above' | 'below'; x1: number; x2: number; line: number; baseline: number; y1: number; y2: number }

/**
 * The 3 of a triplet group, with a bracket unless one beam joins all members.
 *
 * Side, in order of preference. A beamed group: at its beam, on the stem side. A bracketed group: above.
 * When that position is taken (above: it would reach the ending bracket line, or the lyric band without one;
 * below: it would enter the fingering chart row) the other side is tried; when neither is free the preferred
 * side is used: above it gives up the upper limit, below it rises to the chart limit and gives up the clearance
 * from its neighbours; it never enters the chart row.
 * Within a side the mark moves out in steps until it keeps CLEAR units from the ink of the events next to the
 * group (its bracket ends shorten to the heads first).
 */
export function placeTuplet(p: TupletProps): { chosen: Candidate; cx: number } {
  const { mark, byId } = p;
  const members = mark.ids.map(id => byId.get(id)!);
  const notesOf = (g: BeamGroup) => g.ids.map(i => byId.get(i)!);
  const geoOf = (id: string): BeamGeo | undefined => {
    const g = p.beamOf.get(id);
    return g && beamGeometry(notesOf(g));
  };
  const own = union(members.flatMap(n => {
    const g = p.beamOf.get(n.ev.id);
    const geo = g && beamGeometry(notesOf(g));
    return [...eventInk(n, geo), ...(g && geo ? [beamInk(notesOf(g), geo)] : [])];
  }));
  const first = members[0];
  const last = members[members.length - 1];
  const cx = (first.x + last.x) / 2;

  // Ink next to the group: previous and next event of the bar, their beams, and the ends of neighbouring brackets.
  const i0 = p.barIds.indexOf(mark.ids[0]);
  const i1 = p.barIds.indexOf(mark.ids[mark.ids.length - 1]);
  const near: Box[] = [];
  for (const id of [p.barIds[i0 - 1], p.barIds[i1 + 1]]) {
    const n = id === undefined ? undefined : byId.get(id);
    if (!n) continue;
    near.push(...eventInk(n, geoOf(id!)));
    const g = p.beamOf.get(id!);
    if (g) near.push(beamInk(notesOf(g), beamGeometry(notesOf(g))));
    const other = p.marks.find(m => m !== mark && m.ids.includes(id!) && !m.beamed);
    if (other) near.push({ x1: n.x - 6, x2: n.x + 7, y1: -1e6, y2: 1e6 });
  }

  const beam = mark.beamed ? p.beamOf.get(mark.ids[0]) : undefined;
  const beamUp = beam ? beamGeometry(notesOf(beam)).up : true;
  const preferred: 'above' | 'below' = mark.beamed ? (beamUp ? 'above' : 'below') : 'above';
  const limit = p.volta ? SHEET.voltaY + 14 : SHEET.voltaY;

  const candidate = (side: 'above' | 'below', k: number): Candidate & { ok: boolean } => {
    const out = side === 'above' ? -1 : 1;
    let line = (side === 'above' ? own.y1 - GAP : own.y2 + GAP) + out * STEP * k;
    if (!mark.beamed && STAFF_LINES.some(l => Math.abs(line - l) < 1.5)) line += out * 2;
    const hook = side === 'above' ? HOOK : -HOOK;
    let baseline: number, y1: number, y2: number;
    if (mark.beamed) {
      const edge = (side === 'above' ? own.y1 - 5 : own.y2 + 5) + out * STEP * k;
      baseline = side === 'above' ? edge : edge + DIGIT_H;
      y1 = baseline - DIGIT_H; y2 = baseline;
    } else {
      baseline = line + DIGIT_H / 2;
      y1 = Math.min(line - DIGIT_H / 2, line + hook); y2 = Math.max(line + DIGIT_H / 2, line + hook);
    }
    let lo = first.x - 6;
    let hi = last.x + 7;
    let ok = true;
    for (const b of near) {
      if (b.y2 < y1 - CLEAR || b.y1 > y2 + CLEAR) continue;
      if (b.x2 + CLEAR > cx - NUMBER_HALF_W && b.x1 - CLEAR < cx + NUMBER_HALF_W) { ok = false; continue; }
      if (b.x2 <= cx) lo = Math.max(lo, b.x2 + CLEAR); else hi = Math.min(hi, b.x1 - CLEAR);
    }
    if (!mark.beamed && (lo > first.x || hi < last.x)) ok = false;
    return { side, x1: lo, x2: hi, line, baseline, y1, y2, ok };
  };
  const place = (side: 'above' | 'below'): Candidate => {
    let c = candidate(side, 0);
    for (let k = 1; !c.ok && k <= MAX_STEPS; k++) c = candidate(side, k);
    return c;
  };
  // Neither side fits: a mark below is lifted to the chart limit, giving up clearance from its neighbours.
  const intoLimit = (c: Candidate): Candidate => {
    const up = c.side === 'below' ? Math.max(0, c.y2 - CHART_LIMIT) : 0;
    return { ...c, line: c.line - up, baseline: c.baseline - up, y1: c.y1 - up, y2: c.y2 - up };
  };
  const fits = (c: Candidate) => (c.side === 'above' ? c.y1 > limit : c.y2 <= CHART_LIMIT);
  const other = preferred === 'above' ? 'below' : 'above';
  const a = place(preferred);
  const b = fits(a) ? a : place(other);
  const chosen = fits(b) ? b : intoLimit(a);

  return { chosen, cx };
}

export function Tuplet(p: TupletProps): JSX.Element {
  const pal = usePalette();
  const { mark } = p;
  const { chosen, cx } = placeTuplet(p);
  const half = Math.max(2, Math.min(HALF_GAP, (chosen.x2 - chosen.x1) / 2 - 2));
  const hook = chosen.side === 'above' ? HOOK : -HOOK;
  const d = `M${chosen.x1} ${chosen.line + hook}V${chosen.line}H${cx - half}M${cx + half} ${chosen.line}H${chosen.x2}V${chosen.line + hook}`;
  return (
    <g data-tuplet="" data-tuplet-side={chosen.side}>
      {!mark.beamed && <path data-tuplet-bracket="" d={d} fill="none" stroke={pal.ink} strokeWidth={1} />}
      <text x={cx} y={chosen.baseline} textAnchor="middle" fontSize={FONT_PX} fontWeight={700} fontStyle="italic" fontFamily={FONT} fill={pal.ink}
        stroke={pal.paper} strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">3</text>
    </g>
  );
}
