import { barCap, newId, splitDuration } from '../domain/time';
import type { Bar, Ev, TimeSig } from '../domain/types';
import type { QNote } from './quantise';
import { findWindows, windowPieces } from './tripletWindows';
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
 * Bars of the meter after a pickup of `pickupTicks`. Triplet windows (see tripletWindows) become groups;
 * elsewhere every start and end is rounded to the sixteenth grid (`rounded` reports when that moved anything).
 * A note is split and tied at window edges and bar lines.
 */
export function toBars(notes: QNote[], ts: TimeSig, pickupTicks: number, marks: ParsedSong['marks']): { bars: Bar[]; rounded: boolean } {
  if (notes.length === 0) return { bars: [], rounded: false };
  const melody = withoutOverlaps(notes);
  const end = melody.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
  const full = barCap(ts);
  const bars: Bar[] = [];
  const placed: { ev: Ev; note: QNote | null }[] = [];   // every event in order, with the note it comes from
  let rounded = false;
  let lastPitch = DEFAULT_REST_PITCH;
  let first = 0;       // index of the first note that may reach into the current bar
  let barStart = 0;

  while (barStart < end) {
    const cap = bars.length === 0 && pickupTicks > 0 ? pickupTicks : full;
    const barEnd = barStart + cap;
    while (first < melody.length && melody[first].start + melody[first].dur <= barStart) first += 1;
    const inBar: QNote[] = [];
    for (let i = first; i < melody.length && melody[i].start < barEnd; i++) inBar.push(melody[i]);

    const ev: Ev[] = [];
    const push = (d: number, note: QNote | null) => {
      const e: Ev = { id: newId(), m: note ? note.midi : lastPitch, d, r: !note, tie: false, l: '' };
      if (note) lastPitch = note.midi;
      ev.push(e);
      placed.push({ ev: e, note });
    };
    /** [a, b) outside any window: starts and ends rounded to sixteenths, then split into plain lengths. */
    const plain = (a: number, b: number) => {
      let cursor = a;
      for (const n of inBar) {
        const stop = n.start + n.dur;
        if (stop <= a || n.start >= b) continue;
        const s = Math.max(n.start, a);
        const e = Math.min(stop, b);
        let rs = round3(s);
        let re = round3(e);
        if (n.start >= a && re < rs + GRID) re = rs + GRID;   // a note keeps at least a sixteenth
        rs = Math.max(rs, cursor);
        re = Math.min(re, b);
        if (rs !== s || re !== e) rounded = true;
        if (re <= rs) continue;
        if (rs > cursor) for (const d of splitDuration(rs - cursor)) push(d, null);
        for (const d of splitDuration(re - rs)) push(d, n);
        cursor = re;
      }
      if (cursor < b) for (const d of splitDuration(b - cursor)) push(d, null);
    };

    let t = barStart;
    for (const w of findWindows(inBar, barStart, cap, full)) {
      if (w.start > t) plain(t, w.start);
      for (const p of windowPieces(inBar, w.start, w.span)!) push(p.len, p.note);   // findWindows checked they tile
      t = w.start + w.span;
    }
    if (t < barEnd) plain(t, barEnd);
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
