import { SHEET, type SystemLayout } from '../render/layout';
import { TPQ } from './time';
import type { Doc } from './types';

/** Play mode (SPEC §11a): paper zoom and auto-scroll speed factor, both in percent. */
export const ZOOM = { min: 75, max: 200, step: 25, initial: 125 } as const;
/** 100 % is the pace of the music. Players slow the scroll down far more often than they speed it up. */
export const SPEED = { min: 25, max: 150, step: 5, initial: 100 } as const;
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

/** Seconds one line takes at this tempo and speed factor (percent). */
export function lineSeconds(beats: number, tempo: number, speed: number): number {
  return (beats * 60) / tempo / (speed / 100);
}

/**
 * Auto-scroll speed in CSS pixels per second: one zoomed system per line time. `systemHeight` is the layout's
 * (`SheetLayout.systemHeight`: a sheet with jump marks has taller systems).
 */
export function scrollSpeed(beats: number, tempo: number, speed: number, zoom: number, systemHeight: number = SHEET.systemHeight): number {
  if (beats <= 0) return 0;
  return (systemHeight * zoom) / 100 / lineSeconds(beats, tempo, speed);
}

export function pageCount(scrollHeight: number, clientHeight: number): number {
  const page = TURN * clientHeight;
  if (page <= 0) return 1;
  return Math.max(1, Math.ceil((scrollHeight - clientHeight) / page) + 1);
}

export function pageNumber(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const page = TURN * clientHeight;
  if (page <= 0) return 1;
  return Math.min(Math.floor(scrollTop / page + 0.05) + 1, pageCount(scrollHeight, clientHeight));
}

/** The scrollTop a page turn ends at; dir 1 is forward. */
export function turnTarget(scrollTop: number, scrollHeight: number, clientHeight: number, dir: 1 | -1): number {
  return Math.max(0, Math.min(scrollHeight - clientHeight, scrollTop + dir * TURN * clientHeight));
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

function inRange(v: unknown, r: { min: number; max: number; initial: number }): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max ? v : r.initial;
}

/** A stored zoom, or the default when it is not a number in range. */
export const clampZoom = (v: unknown): number => inRange(v, ZOOM);
/** A stored speed factor, or the default when it is not a number in range. */
export const clampSpeed = (v: unknown): number => inRange(v, SPEED);

/** The readout next to the speed slider: "100% · 1 line / 10 s", or "100% · starts in 8 s" while auto-scroll waits. */
export function speedLabel(beats: number, tempo: number, speed: number, startsIn: number | null = null): string {
  if (startsIn !== null) return `${speed}% · starts in ${Math.ceil(startsIn)} s`;
  return `${speed}% · 1 line / ${Math.round(lineSeconds(beats, tempo, speed))} s`;
}
