import { barCap, newId } from '../domain/time';
import type { Bar, Ev, TimeSig } from '../domain/types';
import { withEdges, type QNote } from './quantise';
import { findWindows, plainPieces, windowPieces, type Piece } from './tripletWindows';
import type { ParsedSong } from './types';

const DEFAULT_REST_PITCH = 60;
const GRID = 3;

const round3 = (tick: number): number => Math.round(tick / GRID) * GRID;

/** Sorted by start; a note that starts while an earlier one still sounds is cut at the earlier one's end. */
function withoutOverlaps(notes: QNote[]): QNote[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const out: QNote[] = [];
  let cursor = 0;
  let cursorRounded = false;
  for (const n of sorted) {
    const stop = n.start + n.dur;
    const cut = n.start < cursor;
    const start = cut ? cursor : n.start;
    if (stop <= start) continue;
    // a start moved to the earlier note's end is as exact as that end
    out.push(withEdges({ start, dur: stop - start, midi: n.midi }, cut ? cursorRounded : n.roundedStart === true, n.roundedEnd === true));
    cursor = stop;
    cursorRounded = n.roundedEnd === true;
  }
  return out;
}

/**
 * Moves every start and end at `tick` among `notes` (one bar's notes, in order; `after` is the note that follows them)
 * to the nearest sixteenth and marks those edges rounded. A note that shrinks to nothing keeps a sixteenth when the
 * next note leaves room, otherwise its length becomes 0 and it is skipped from then on. Notes change in place:
 * their identity marks ties.
 */
function roundPosition(notes: QNote[], after: QNote | undefined, tick: number): void {
  const to = round3(tick);
  for (const n of notes) {
    const stop = n.start + n.dur;
    if (n.start === tick) { n.start = to; n.roundedStart = true; }
    if (stop === tick) n.roundedEnd = true;
    n.dur = (stop === tick ? to : stop) - n.start;
  }
  notes.forEach((n, i) => {
    if (n.dur > 0) return;
    const next = i + 1 < notes.length ? notes[i + 1] : after;
    n.dur = Math.max(0, Math.min(GRID, next ? next.start - n.start : GRID));
  });
}

/** An edge off the sixteenth grid inside (barStart, barEnd) of a note that has a rounded edge; or null. */
function hopeless(notes: QNote[], barStart: number, barEnd: number): number | null {
  const inside = (t: number) => t % GRID !== 0 && t > barStart && t < barEnd;
  for (const n of notes) {
    if (!n.roundedStart && !n.roundedEnd) continue;
    if (inside(n.start)) return n.start;
    if (inside(n.start + n.dur)) return n.start + n.dur;
  }
  return null;
}

/**
 * Bars of the meter after a pickup of `pickupTicks`. Each bar is cut by `findWindows`: triplet windows become groups,
 * the rest is split into plain lengths. A start or end off the sixteenth grid that no cut explains is rounded to it
 * (`rounded` true) and the bar is cut again. A note is split and tied at window edges and bar lines.
 */
export function toBars(notes: QNote[], ts: TimeSig, pickupTicks: number, marks: ParsedSong['marks']): { bars: Bar[]; rounded: boolean } {
  if (notes.length === 0) return { bars: [], rounded: false };
  const melody = withoutOverlaps(notes);
  const full = barCap(ts);
  const bars: Bar[] = [];
  const placed: { ev: Ev; note: QNote | null }[] = [];   // every event in order, with the note it comes from
  let rounded = false;
  let lastPitch = DEFAULT_REST_PITCH;
  let first = 0;       // index of the first note that may reach into the current bar
  let barStart = 0;
  // Notes are sorted and do not overlap, so the song ends where the last note that still sounds ends.
  const lastEnd = () => {
    for (let i = melody.length - 1; i >= 0; i--) if (melody[i].dur > 0) return melody[i].start + melody[i].dur;
    return 0;
  };
  let end = lastEnd();

  while (barStart < end) {
    const cap = bars.length === 0 && pickupTicks > 0 ? pickupTicks : full;
    const barEnd = barStart + cap;
    while (first < melody.length && melody[first].start + melody[first].dur <= barStart) first += 1;
    let stop = first;      // index after the last note that starts in this bar
    while (stop < melody.length && melody[stop].start < barEnd) stop += 1;
    const touched = melody.slice(first, stop);
    const sounding = () => touched.filter(n => n.dur > 0);
    // An off-grid edge of a note with a rounded edge can lie in no window: round it without searching.
    for (let tick = hopeless(sounding(), barStart, barEnd); tick !== null; tick = hopeless(sounding(), barStart, barEnd)) {
      roundPosition(touched, melody[stop], tick);
      rounded = true;
    }
    let notesHere = sounding();
    let cut = findWindows(notesHere, barStart, cap, full);
    while ('unexplained' in cut) {
      roundPosition(touched, melody[stop], cut.unexplained);
      rounded = true;
      notesHere = sounding();
      cut = findWindows(notesHere, barStart, cap, full);
    }
    if (stop === melody.length) end = lastEnd();
    // a start rounded up to the bar line belongs to the next bar
    notesHere = notesHere.filter(n => n.start < barEnd);

    const ev: Ev[] = [];
    const emit = (ps: Piece[] | null) => {
      for (const p of ps!) {   // findWindows checked that every stretch splits
        const e: Ev = { id: newId(), m: p.note ? p.note.midi : lastPitch, d: p.len, r: !p.note, tie: false, l: '' };
        if (p.note) lastPitch = p.note.midi;
        ev.push(e);
        placed.push({ ev: e, note: p.note });
      }
    };
    let t = barStart;
    for (const w of cut.windows) {
      if (w.start > t) emit(plainPieces(notesHere, t, w.start));
      emit(windowPieces(notesHere, w.start, w.span));
      t = w.start + w.span;
    }
    if (t < barEnd) emit(plainPieces(notesHere, t, barEnd));
    bars.push({ cap, rs: false, re: false, volta: '', ev });
    barStart = barEnd;
  }

  // A note event is tied when the next event continues the same note.
  placed.forEach((p, i) => {
    const next = placed[i + 1];
    p.ev.tie = p.note !== null && next !== undefined && next.note === p.note;
  });

  for (const m of marks) {
    const bar = bars[m.bar];
    if (!bar) continue;
    if (m.rs) bar.rs = true;
    if (m.re) bar.re = true;
    if (m.volta) bar.volta = m.volta;
  }
  return { bars, rounded };
}
