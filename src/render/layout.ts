import type { Derived, DerivedEvent } from '../domain/derive';
import { barLabelOf } from '../domain/bars';
import { hasJumpMarks } from '../domain/jumps';
import { barCap, beatTicks } from '../domain/time';
import { notatedLength, tripletGroups, type TripletGroup } from '../domain/triplets';
import type { Doc } from '../domain/types';

export const SHEET = { width: 940, pad: 40, systemWidth: 860, staffTop: 75, staffBottom: 115, chartY: 166, altButtonDy: 90, minPitch: 20, barPad: 16, barPadAfterRepeat: 26, barTail: 14 } as const;

/**
 * Heights (px) of the bands above the staff, from the lanes of the layout before bands could be absent: the chord band
 * runs from the system's top to the lyric lane (22), the lyric band to the ending lane (24), the ending band holds the
 * bracket and its hook (14), and the jump marks have a row of their own (30). What is left down to the staff is the
 * minimum headroom (15). The chord band's first 2 px are empty.
 */
export const BAND_HEIGHT = { marks: 30, chords: 22, lyrics: 24, endings: 14 } as const;
export const MIN_HEADROOM = 15;
/** Clear space (px) between the highest thing a note draws and the lowest band. */
export const HEADROOM_MARGIN = 4;
/** Where the chord symbols' lane starts inside the chord band: its top 2 px stay empty. */
const CHORD_INSET = 2;

/** From the top staff line to the bottom of a system: the staff, the charts and the alternate-fingering pill (290 - 75 before bands could collapse). */
export const BELOW_STAFF = 215;

/** The system height of a sheet that uses every band but the marks and has no high note: the height the stylesheet gives `.system`. */
export const FULL_HEIGHT = SHEET.staffTop + BELOW_STAFF;

/**
 * The bar number at the left of every system but the first: baseline `y` in the staff frame, font size `px`, and `rise`,
 * the height of the text's cell above the baseline in em (what the browser reports as its box, a little more than the digits). SystemView draws it from these, and the stack reads its top from them.
 */
export const BAR_NUMBER = { y: 65, px: 11, rise: 0.92 } as const;
const BAR_NUMBER_TOP = BAR_NUMBER.y - BAR_NUMBER.px * BAR_NUMBER.rise;

/** The bands a sheet stacks above its staff. Heights in px; 0 for a band the sheet does not use. */
export interface Bands { marks: number; chords: number; lyrics: number; endings: number; headroom: number }

/** Which bands a sheet uses (see `bandsUsed`). */
export interface BandUse { marks: boolean; chords: boolean; lyrics: boolean; endings: boolean }

/**
 * The one description of what a system stacks, the same for every system of a sheet. Systems are drawn in two frames:
 * the staff frame, in which the top staff line is at `SHEET.staffTop` (notes, ties, charts, barlines, and the chord,
 * lyric and ending lanes, all given in it by `frame`), and the system's own coordinates, from the top of its svg. The
 * staff frame is moved down by `shift` (negative when bands are absent). Distances below the staff do not depend on the stack.
 */
export interface Stack {
  bands: Bands;
  /** Where the top staff line stands in the system: the sum of the bands. */
  staffTop: number;
  /** How far the staff frame is moved: `staffTop - SHEET.staffTop`. */
  shift: number;
  /** The system's whole height. */
  systemHeight: number;
  /** In the staff frame: top of the click columns' area (the chord band's top), and the lanes' tops. */
  frame: { columnTop: number; chordY: number; lyricY: number; voltaY: number };
  /** In the system's coordinates: top of the fingering charts, and the alternate-fingering pill below them. */
  chartTop: number; pillY: number;
}

/** True when a sheet draws a chord symbol or a lyric by the flags of `show` (the renderer's own test). */
function drawsContent(events: DerivedEvent[], show: Doc['show']) {
  return {
    chords: events.some(ev => show.chords && ev.chord !== null),
    lyrics: events.some(ev => show.lyrics && !ev.rest && ev.lyric !== ''),
  };
}

/**
 * The bands a sheet uses. Chords and lyrics: drawn anywhere on the sheet (the content exists and its Show switch is on),
 * or forced by the editing mode (`force`). Endings: some bar has one. Marks: some bar has a jump mark.
 */
export function bandsUsed(doc: Doc, events: DerivedEvent[], force: { chords?: boolean; lyrics?: boolean } = {}): BandUse {
  const drawn = drawsContent(events, doc.show);
  return {
    marks: hasJumpMarks(doc),
    chords: drawn.chords || !!force.chords,
    lyrics: drawn.lyrics || !!force.lyrics,
    endings: doc.score.some(b => b.volta !== ''),
  };
}

/**
 * The stack for the bands in use. `inkTop` is the highest y of anything the notes draw, in the staff frame (Infinity
 * when there is none). Headroom: the ink's height above the top staff line plus a margin, never below the minimum.
 * `numbered`: some system draws a bar number.
 */
export function stackOf(use: BandUse, inkTop: number, numbered = false): Stack {
  // With no band at all the bar numbers (when a system has one) stand in the headroom and must fit under the system's top.
  const none = !(use.marks || use.chords || use.lyrics || use.endings);
  const numberRoom = none && numbered ? Math.ceil(SHEET.staffTop - BAR_NUMBER_TOP) : 0;
  const headroom = Math.max(MIN_HEADROOM, SHEET.staffTop - inkTop + HEADROOM_MARGIN, numberRoom);
  const bands: Bands = {
    marks: use.marks ? BAND_HEIGHT.marks : 0, chords: use.chords ? BAND_HEIGHT.chords : 0,
    lyrics: use.lyrics ? BAND_HEIGHT.lyrics : 0, endings: use.endings ? BAND_HEIGHT.endings : 0, headroom,
  };
  const staffTop = bands.marks + bands.chords + bands.lyrics + bands.endings + bands.headroom;
  const shift = staffTop - SHEET.staffTop;
  const systemHeight = staffTop + BELOW_STAFF;
  return {
    bands, staffTop, shift, systemHeight,
    frame: {
      columnTop: bands.marks - shift, chordY: bands.marks + CHORD_INSET - shift,
      lyricY: bands.marks + bands.chords - shift, voltaY: bands.marks + bands.chords + bands.lyrics - shift,
    },
    chartTop: SHEET.chartY + shift, pillY: SHEET.chartY + SHEET.altButtonDy + shift,
  };
}

/**
 * System header pieces, left to right: clef, key-signature accidentals, time signature (first system only), gap.
 * Bravura clef ink is 26.8px wide, drawn from clefInset; key-signature sharps are 10px wide, flats 9px.
 */
export const HEADER = { clef: 34, clefInset: 4, accidental: 11, timeSig: 26, gap: 8 } as const;

export interface EvLayout { id: string; x: number; y: number }            // y = notehead centre; rests: staff middle
export interface BarLayout { bar: number; x: number; width: number; events: EvLayout[] }
/** A system's bars and header, before the stack (so before its position and height) is known. */
export interface SystemBars { index: number; headerWidth: number; showTimeSig: boolean; barNumber: number | null; bars: BarLayout[] }
/** `height` is the system's whole height and `stack` the sheet's one stack: everything that sizes or positions a system reads them. */
export interface SystemLayout extends SystemBars { y: number; height: number; stack: Stack }
export interface BeamGroup { ids: string[]; beams: 1 | 2 | 'mixed' }
/** One triplet group: its number (and bracket unless `beamed`: one beam joins all members). */
export interface TupletMark { bar: number; ids: string[]; beamed: boolean }
/** What the stack is measured from: the systems' bars, the beam groups and the triplet marks. `beams` and `tuplets` are indexed by bar: a system draws only the entries of its own bars. */
export interface BarsLayout { systems: SystemBars[]; beams: BeamGroup[][]; tuplets: TupletMark[][] }
/** `systemHeight` is the height of every system: everything that sizes a system reads it here (or from `stack`). */
export interface SheetLayout extends BarsLayout { systems: SystemLayout[]; height: number; systemHeight: number; stack: Stack }

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

/** The systems' bars, the beam groups and the triplet marks: all that does not depend on the bands above the staff. */
export function layoutSystems(doc: Doc, d: Derived): BarsLayout {
  const byBar: DerivedEvent[][] = doc.score.map(() => []);
  for (const ev of d.events) byBar[ev.bar].push(ev);

  const systems: SystemBars[] = breakSystems(doc, d.sig).map(({ bars, widths }, index) => {
    const first = index === 0;
    const hw = headerWidth(d.sig, first);
    let x = hw;
    const barLayouts = bars.map((bar, j) => {
      const width = widths[j];
      const layout: BarLayout = { bar, x, width, events: layoutEvents(doc, bar, x, width, byBar[bar]) };
      x += width;
      return layout;
    });
    return { index, headerWidth: hw, showTimeSig: first, barNumber: first ? null : barLabelOf(doc, bars[0]), bars: barLayouts };
  });

  const beat = beatTicks(doc.timeSig);
  const full = barCap(doc.timeSig);
  const beams: BeamGroup[][] = [];
  const tuplets: TupletMark[][] = [];
  byBar.forEach((evs, bar) => {
    const groups = tripletGroups(doc.score[bar], full) ?? [];
    const barBeams = beamGroups(evs, beat, groups);
    beams.push(barBeams);
    tuplets.push(groups.map(g => ({
      bar, ids: g.ids, beamed: barBeams.some(b => b.ids.length === g.ids.length && b.ids[0] === g.ids[0]),
    })));
  });
  return { systems, beams, tuplets };
}
