import { barCap, newId, splitDuration } from '../domain/time';
import type { Bar, Ev, TimeSig } from '../domain/types';
import type { QNote } from './quantise';
import type { ParsedSong } from './types';

const DEFAULT_REST_PITCH = 60;

export function toBars(notes: QNote[], ts: TimeSig, pickupTicks: number, marks: ParsedSong['marks']): Bar[] {
  if (notes.length === 0) return [];
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const end = Math.max(...sorted.map(n => n.start + n.dur));
  const full = barCap(ts);
  const bars: Bar[] = [];
  let lastPitch = DEFAULT_REST_PITCH;
  let cursor = 0;      // absolute tick up to which events are written
  let next = 0;        // index of the next note to place
  let barStart = 0;

  while (barStart < end) {
    const cap = bars.length === 0 && pickupTicks > 0 ? pickupTicks : full;
    const barEnd = barStart + cap;
    const ev: Ev[] = [];
    const rest = (len: number) => {
      for (const d of splitDuration(len)) ev.push({ id: newId(), m: lastPitch, d, r: true, tie: false, l: '', c: '' });
    };
    // a note that began in an earlier bar and runs on (carry) is handled by keeping it in `pending`
    for (;;) {
      const n = sorted[next];
      if (!n || n.start >= barEnd) break;
      const start = Math.max(n.start, cursor);   // overlaps are cut at the cursor
      const stop = n.start + n.dur;
      next += 1;
      if (stop <= start) continue;
      if (start > cursor) rest(start - cursor);
      const pieceEnd = Math.min(stop, barEnd);
      const parts = splitDuration(pieceEnd - start);
      const continues = stop > barEnd;
      parts.forEach((d, i) => {
        ev.push({ id: newId(), m: n.midi, d, r: false, tie: i < parts.length - 1 || continues, l: '', c: '' });
      });
      lastPitch = n.midi;
      cursor = pieceEnd;
      if (continues) {
        // the remainder becomes a note starting at the bar line
        sorted.splice(next, 0, { start: barEnd, dur: stop - barEnd, midi: n.midi });
        break;
      }
    }
    if (cursor < barEnd) rest(barEnd - cursor);
    cursor = barEnd;
    bars.push({ cap, rs: false, re: false, volta: '', ev });
    barStart = barEnd;
  }

  for (const m of marks) {
    const bar = bars[m.bar];
    if (!bar) continue;
    if (m.rs) bar.rs = true;
    if (m.re) bar.re = true;
    if (m.volta) bar.volta = m.volta;
  }
  return bars;
}
