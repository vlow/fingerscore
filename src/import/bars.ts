import { barCap, newId } from '../domain/time';
import type { Bar, Ev, TimeSig } from '../domain/types';
import type { QNote } from './quantise';
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
  for (const n of sorted) {
    const start = Math.max(n.start, cursor);
    const stop = n.start + n.dur;
    if (stop <= start) continue;
    out.push({ start, dur: stop - start, midi: n.midi });
    cursor = stop;
  }
  return out;
}

/**
 * Moves every note start and end at `tick` to the nearest sixteenth. A note that shrinks to nothing keeps a sixteenth
 * when the next note leaves room, otherwise it is dropped. Notes are changed in place: their identity marks ties.
 */
function roundPosition(melody: QNote[], tick: number): void {
  const to = round3(tick);
  for (const n of melody) {
    const stop = n.start + n.dur;
    if (n.start === tick) n.start = to;
    n.dur = (stop === tick ? to : stop) - n.start;
  }
  for (let i = 0; i < melody.length; i++) {
    const n = melody[i];
    if (n.dur > 0) continue;
    const next = melody[i + 1];
    n.dur = Math.min(GRID, next ? next.start - n.start : GRID);
    if (n.dur <= 0) { melody.splice(i, 1); i -= 1; }
  }
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
  const lastEnd = () => melody.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
  let end = lastEnd();

  while (barStart < end) {
    const cap = bars.length === 0 && pickupTicks > 0 ? pickupTicks : full;
    const barEnd = barStart + cap;
    while (first < melody.length && melody[first].start + melody[first].dur <= barStart) first += 1;
    const inBar = (): QNote[] => {
      const out: QNote[] = [];
      for (let i = first; i < melody.length && melody[i].start < barEnd; i++) out.push(melody[i]);
      return out;
    };
    let notesHere = inBar();
    let cut = findWindows(notesHere, barStart, cap, full);
    while ('unexplained' in cut) {
      roundPosition(melody, cut.unexplained);
      rounded = true;
      end = lastEnd();
      notesHere = inBar();
      cut = findWindows(notesHere, barStart, cap, full);
    }

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
