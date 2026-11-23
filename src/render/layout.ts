import type { Derived, DerivedEvent } from '../domain/derive';
import { barCap, beatTicks } from '../domain/time';
import { notatedLength, tripletGroups, type TripletGroup } from '../domain/triplets';
import type { Doc } from '../domain/types';

export const SHEET = { width: 940, pad: 40, systemWidth: 860, systemHeight: 290, staffTop: 75, staffBottom: 115, chordY: 2, lyricY: 22, voltaY: 46, chartY: 166, altButtonDy: 90, minPitch: 20, barPad: 16, barPadAfterRepeat: 26, barTail: 14 } as const;

/**
 * System header pieces, left to right: clef, key-signature accidentals, time signature (first system only), gap.
 * Bravura clef ink is 26.8px wide, drawn from clefInset; key-signature sharps are 10px wide, flats 9px.
 */
export const HEADER = { clef: 34, clefInset: 4, accidental: 11, timeSig: 26, gap: 8 } as const;

export interface EvLayout { id: string; x: number; y: number }            // y = notehead centre; rests: staff middle
export interface BarLayout { bar: number; x: number; width: number; events: EvLayout[] }
export interface SystemLayout { index: number; y: number; headerWidth: number; showTimeSig: boolean; barNumber: number | null; bars: BarLayout[] }
export interface BeamGroup { ids: string[]; beams: 1 | 2 | 'mixed' }
/** One triplet group: its number (and bracket unless `beamed`: one beam joins all members). */
export interface TupletMark { bar: number; ids: string[]; beamed: boolean }
export interface SheetLayout { systems: SystemLayout[]; height: number; beams: BeamGroup[]; tuplets: TupletMark[] }

const MAX_BARS_PER_SYSTEM = 4;
const STAFF_MIDDLE = (SHEET.staffTop + SHEET.staffBottom) / 2;
const BEAMABLE = new Set([3, 6, 9]);
const EPS = 1e-9;

export function headerWidth(sig: number, first: boolean): number {
  return HEADER.clef + Math.abs(sig) * HEADER.accidental + (first ? HEADER.timeSig : 0) + HEADER.gap;
}

function barPad(doc: Doc, bar: number): number {
  return doc.score[bar].rs ? SHEET.barPadAfterRepeat : SHEET.barPad;
}

/** Bars whose shortest event is at least an eighth always take a quarter of the system, as in the prototype. */
const EIGHTH = 6;

/** Layout weight of a bar: a quarter of the system, or more when sixteenths need minPitch each. */
function barWeight(doc: Doc, bar: number, avail: number): number {
  const quarter = avail / MAX_BARS_PER_SYSTEM;
  const { cap, ev } = doc.score[bar];
  const shortest = Math.min(...ev.map(e => e.d));
  if (shortest >= EIGHTH) return quarter;
  const need = barPad(doc, bar) + SHEET.barTail + (cap / shortest) * SHEET.minPitch;
  return Math.min(avail, Math.max(need, quarter));
}

/** Greedy line breaking: up to 4 bars per system while their weights fit the space after the header. */
function breakSystems(doc: Doc, sig: number): { bars: number[]; widths: number[] }[] {
  const out: { bars: number[]; widths: number[] }[] = [];
  let next = 0;
  while (next < doc.score.length) {
    const avail = SHEET.systemWidth - headerWidth(sig, out.length === 0);
    const bars: number[] = [];
    const weights: number[] = [];
    let sum = 0;
    while (next < doc.score.length && bars.length < MAX_BARS_PER_SYSTEM) {
      const weight = barWeight(doc, next, avail);
      if (bars.length > 0 && sum + weight > avail + EPS) break;
      bars.push(next); weights.push(weight); sum += weight; next++;
    }
    const last = next >= doc.score.length;
    const widths = last && sum < avail ? weights : weights.map(w => (w * avail) / sum);
    out.push({ bars, widths });
  }
  return out;
}

function layoutEvents(doc: Doc, bar: number, x: number, width: number, events: DerivedEvent[]): EvLayout[] {
  const { cap } = doc.score[bar];
  const pad = barPad(doc, bar);
  const wholeRest = events.length === 1 && events[0].rest && events[0].d === cap;
  return events.map(ev => ({
    id: ev.id,
    x: wholeRest ? x + width / 2 : x + pad + (ev.tick * (width - pad - SHEET.barTail)) / cap,
    y: ev.rest ? STAFF_MIDDLE : SHEET.staffBottom - 5 * ev.pos,
  }));
}

/** Beam kind of a run by notated lengths: all eighths, all sixteenths, or both. */
function beamKind(run: DerivedEvent[]): BeamGroup['beams'] {
  const lengths = run.map(e => notatedLength(e.d));
  return lengths.every(d => d === 6) ? 1 : lengths.every(d => d === 3) ? 2 : 'mixed';
}

/**
 * Beam runs of 16ths/8ths/dotted 8ths inside one beat window; a lone short note keeps its flag.
 * A triplet group beams by group instead: notated eighths and sixteenths join across the whole group,
 * beat boundaries inside it do not matter, a rest or longer member ends the run, and no run crosses the
 * group's edge. A plain note never beams with a triplet member.
 */
function beamGroups(barEvents: DerivedEvent[], beat: number, groups: TripletGroup[]): BeamGroup[] {
  const out: BeamGroup[] = [];
  const groupOfId = new Map(groups.flatMap(g => g.ids.map(id => [id, g] as const)));
  let run: DerivedEvent[] = [];
  let window = -1;
  let current: TripletGroup | null = null;
  const flush = () => {
    if (run.length >= 2) out.push({ ids: run.map(e => e.id), beams: beamKind(run) });
    run = [];
  };
  for (const ev of barEvents) {
    const g = groupOfId.get(ev.id) ?? null;
    if (g !== current) { flush(); current = g; }
    if (g) {
      if (ev.rest || !BEAMABLE.has(notatedLength(ev.d))) flush(); else run.push(ev);
      continue;
    }
    const w = Math.floor(ev.tick / beat);
    const fits = !ev.rest && BEAMABLE.has(ev.d) && ev.tick + ev.d <= (w + 1) * beat;
    if (!fits || w !== window) flush();
    if (fits) { run.push(ev); window = w; }
  }
  flush();
  return out;
}

export function layoutSheet(doc: Doc, d: Derived): SheetLayout {
  const byBar: DerivedEvent[][] = doc.score.map(() => []);
  for (const ev of d.events) byBar[ev.bar].push(ev);

  // Bars count from 1 at the first full bar; a pickup is bar 0.
  const firstNumber = doc.score.length > 0 && doc.score[0].cap < barCap(doc.timeSig) ? 0 : 1;

  const systems: SystemLayout[] = breakSystems(doc, d.sig).map(({ bars, widths }, index) => {
    const first = index === 0;
    const hw = headerWidth(d.sig, first);
    let x = hw;
    const barLayouts = bars.map((bar, j) => {
      const width = widths[j];
      const layout: BarLayout = { bar, x, width, events: layoutEvents(doc, bar, x, width, byBar[bar]) };
      x += width;
      return layout;
    });
    return {
      index, y: index * SHEET.systemHeight, headerWidth: hw, showTimeSig: first,
      barNumber: first ? null : bars[0] + firstNumber, bars: barLayouts,
    };
  });

  const beat = beatTicks(doc.timeSig);
  const full = barCap(doc.timeSig);
  const beams: BeamGroup[] = [];
  const tuplets: TupletMark[] = [];
  byBar.forEach((evs, bar) => {
    const groups = tripletGroups(doc.score[bar], full) ?? [];
    const barBeams = beamGroups(evs, beat, groups);
    beams.push(...barBeams);
    for (const g of groups) {
      tuplets.push({ bar, ids: g.ids, beamed: barBeams.some(b => b.ids.length === g.ids.length && b.ids[0] === g.ids[0]) });
    }
  });
  return { systems, height: systems.length * SHEET.systemHeight, beams, tuplets };
}
