import { SHEET, type SystemLayout } from '../render/layout';
import { TPQ } from './time';
import type { Doc, TimeSig } from './types';

/** Play mode (SPEC §11a): paper zoom in percent. */
export const ZOOM = { min: 75, max: 200, step: 25, initial: 125 } as const;
/**
 * Play mode's tempo, as shares of the sheet's tempo and in BPM. Players slow down far more often than they speed
 * up; the floor and ceiling keep a metronome sensible on very slow or very fast sheets.
 */
export const TEMPO = { minShare: 0.25, maxShare: 1.5, floor: 20, ceiling: 300 } as const;
/** A page turn moves by this share of the visible height, so 12 % of the last page stays in view. */
export const TURN = 0.88;

/**
 * Where the player reads, as a share of the visible height. Auto-scroll keeps the music there: it waits until the
 * music has come down from the top to this line, then moves at the music's pace.
 */
export const READ_AT = 0.35;

/** Quarter-note beats on every line of the sheet. Each line scrolls by in its own time. */
export function systemBeats(doc: Doc, systems: SystemLayout[]): number[] {
  return systems.map(sys => sys.bars.reduce((sum, b) => sum + doc.score[b.bar].cap, 0) / TPQ);
}

/** The beats of a full line, for the readout: a short last line or a pickup does not count. */
export function fullLineBeats(beats: number[]): number {
  return beats.length ? Math.max(...beats) : 0;
}

/** The line at height y of the scrolled content: lines start at firstTop and are pitch apart. */
export function systemAt(y: number, firstTop: number, pitch: number, count: number): number {
  if (count <= 0 || pitch <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor((y - firstTop) / pitch)));
}

/** How far the music travels down the screen before auto-scroll starts to move, in CSS pixels. */
export function leadIn(clientHeight: number): number {
  return READ_AT * Math.max(0, clientHeight);
}

/** Seconds one line takes at this tempo (quarter notes per minute). */
export function lineSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}

/**
 * Auto-scroll speed in CSS pixels per second: one zoomed system per line time. `systemHeight` is the layout's
 * (`SheetLayout.systemHeight`: it depends on the bands the sheet uses).
 */
export function scrollSpeed(beats: number, bpm: number, zoom: number, systemHeight: number): number {
  if (beats <= 0) return 0;
  return (systemHeight * zoom) / 100 / lineSeconds(beats, bpm);
}

/** A rest of the sheet shorter than this share of a turn is no page of its own: the page before ends at the end. */
const SNAP = 0.05;
/** A scrollTop this close to a page start is on that page: browsers round scrollTop to whole or half pixels. */
const SLACK = 1;

/**
 * Where the pages start, as scrollTops: one turn apart from the top, and the last page at the end of the scroll.
 * Page count, page number and page turns all read this one list, so a turn always lands on a page start and the
 * rounding of scrollTop cannot add up from turn to turn.
 */
function pageStarts(scrollHeight: number, clientHeight: number): number[] {
  const page = TURN * clientHeight;
  const end = scrollHeight - clientHeight;
  if (page <= 0 || end <= 0) return [0];
  const full = Math.floor(end / page - SNAP);
  if (full < 0) return [0];
  return [...Array.from({ length: full + 1 }, (_, i) => i * page), end];
}

export function pageCount(scrollHeight: number, clientHeight: number): number {
  return pageStarts(scrollHeight, clientHeight).length;
}

/** The page on screen: the last one that starts at or above scrollTop. */
export function pageNumber(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const starts = pageStarts(scrollHeight, clientHeight);
  return Math.max(1, starts.filter(start => start <= scrollTop + SLACK).length);
}

/**
 * The scrollTop a page turn ends at; dir 1 is forward. A turn goes to the next page start in its direction, so a
 * sheet scrolled by hand or by auto-scroll turns to a page start too.
 */
export function turnTarget(scrollTop: number, scrollHeight: number, clientHeight: number, dir: 1 | -1): number {
  const starts = pageStarts(scrollHeight, clientHeight);
  const end = Math.max(0, scrollHeight - clientHeight);
  if (dir === 1) return starts.find(start => start > scrollTop + SLACK) ?? end;
  const before = starts.filter(start => start < scrollTop - SLACK);
  return before.length > 0 ? before[before.length - 1] : 0;
}

/** The scrollTop of the first or the last page: the top, or the end of the scroll. */
export function edgeTarget(scrollHeight: number, clientHeight: number, edge: 'first' | 'last'): number {
  return edge === 'first' ? 0 : Math.max(0, scrollHeight - clientHeight);
}

export function stepZoom(zoom: number, dir: 1 | -1): number {
  return Math.max(ZOOM.min, Math.min(ZOOM.max, zoom + dir * ZOOM.step));
}

/** Space left and right of the paper in play mode, in CSS pixels (both sides together). */
const SIDE_PAD = 24;

/** The largest zoom (percent) at which the paper fits a scroller this wide; no limit while the width is unknown. */
export function fitZoom(clientWidth: number): number {
  return clientWidth > 0 ? ((clientWidth - SIDE_PAD) / SHEET.width) * 100 : Infinity;
}

/** The zoom on screen: the chosen one, or less when the screen is narrower than the paper at that size. */
export function shownZoom(zoom: number, fit: number): number {
  return Math.min(zoom, fit);
}

/** A− from the size on screen: the next size below it on the 25-step grid, never under the minimum. */
export function zoomBelow(shown: number): number {
  return Math.max(ZOOM.min, (Math.ceil(shown / ZOOM.step - 1e-9) - 1) * ZOOM.step);
}

/** A stored zoom, or the default when it is not a number in range. */
export function clampZoom(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= ZOOM.min && v <= ZOOM.max ? v : ZOOM.initial;
}

/** The whole BPMs Play mode offers for a sheet at this tempo. */
export function tempoRange(sheetTempo: number): { min: number; max: number } {
  return {
    min: Math.max(TEMPO.floor, Math.round(sheetTempo * TEMPO.minShare)),
    max: Math.min(TEMPO.ceiling, Math.round(sheetTempo * TEMPO.maxShare)),
  };
}

/** A stored Play mode tempo, rounded and kept in the sheet's range; the sheet's own tempo when there is none. */
export function clampTempo(v: unknown, sheetTempo: number): number {
  const { min, max } = tempoRange(sheetTempo);
  const bpm = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : sheetTempo;
  return Math.max(min, Math.min(max, bpm));
}

/** The Play mode tempo as a share of the sheet's tempo, in whole percent. */
export function percentOf(bpm: number, sheetTempo: number): number {
  return Math.round((bpm / sheetTempo) * 100);
}

/**
 * The readout next to the tempo slider: "♩ = 96 · 80% · 1 line / 10 s", or "♩ = 96 · 80% · starts in 8 s" while
 * auto-scroll waits.
 */
export function speedLabel(beats: number, bpm: number, sheetTempo: number, startsIn: number | null = null): string {
  const head = `♩ = ${bpm} · ${percentOf(bpm, sheetTempo)}%`;
  if (startsIn !== null) return `${head} · starts in ${Math.ceil(startsIn)} s`;
  return `${head} · 1 line / ${Math.round(lineSeconds(beats, bpm))} s`;
}

/**
 * How a metronome counts a bar: beats per bar and quarter notes per beat. Compound 6/8 counts two dotted quarters,
 * cut time 2/2 two halves.
 */
export function beatPattern(timeSig: TimeSig): { perBar: number; quarters: number } {
  const [top, bottom] = timeSig;
  if (bottom === 8) return { perBar: top / 3, quarters: 1.5 };
  return { perBar: top, quarters: 4 / bottom };
}
