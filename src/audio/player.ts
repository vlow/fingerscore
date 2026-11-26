import { inst } from '../domain/instruments';
import { ticksToSeconds, type Schedule } from '../domain/playback';
import type { Doc } from '../domain/types';
import type { RawNote } from '../import/types';
import { outputFor } from './output';
import { PRESETS, PREVIEW_PRESET } from './presets';
import { playVoice, type Voice } from './voice';

export interface Player {
  play(s: Schedule, doc: Doc, onEvent: (evId: string | null) => void): void;
  stop(): void;
  readonly playing: boolean;
}

const LOOKAHEAD = 0.5;  // seconds scheduled ahead
const TICK_MS = 100;    // scheduler interval

export function createPlayer(): Player {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let eventTimers: ReturnType<typeof setTimeout>[] = [];
  let voices: Voice[] = [];
  let playing = false;
  let notify: ((evId: string | null) => void) | null = null;

  function clear() {
    if (timer) clearInterval(timer);
    timer = null;
    eventTimers.forEach(clearTimeout);
    eventTimers = [];
    for (const v of voices) v.stop();
    voices = [];
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clear();
    notify?.(null);
    notify = null;
  }

  function play(s: Schedule, doc: Doc, onEvent: (evId: string | null) => void) {
    stop();
    ctx ??= new AudioContext();
    const c = ctx;
    void c.resume();
    const preset = PRESETS[inst(doc.inst).group];
    const out = outputFor(c);
    const t0 = c.currentTime + 0.08;
    const secs = (ticks: number) => ticksToSeconds(ticks, doc.tempo);
    const endAt = t0 + secs(s.totalTicks);
    let next = 0;
    let nextMark = 0;
    playing = true;
    notify = onEvent;

    // A note that starts where the one before it ends is played as part of the phrase, with a softer attack.
    let prevEnd = -1;
    function schedule(n: Schedule['notes'][number]) {
      const start = t0 + secs(n.start);
      const end = start + secs(n.dur);
      const connected = n.start === prevEnd;
      prevEnd = n.start + n.dur;
      const v = playVoice(c, out, preset, n.midi, start, end, connected, () => { voices = voices.filter(x => x !== v); });
      voices.push(v);
    }

    // Marks cover the whole timeline (every note chain and every rest), so the highlight moves
    // from one to the next without gaps; the song-end timer clears the last one.
    let fired = 0;
    function scheduleMark(m: Schedule['marks'][number], late = false) {
      const at = t0 + secs(m.start);
      const wait = late ? 0 : Math.max(0, (at - c.currentTime) * 1000);
      eventTimers.push(setTimeout(() => { fired++; if (playing) onEvent(m.evId); }, wait));
    }

    function pump() {
      while (next < s.notes.length && t0 + secs(s.notes[next].start) < c.currentTime + LOOKAHEAD) {
        schedule(s.notes[next]);
        next++;
      }
      while (nextMark < s.marks.length && t0 + secs(s.marks[nextMark].start) < c.currentTime + LOOKAHEAD) {
        scheduleMark(s.marks[nextMark]);
        nextMark++;
      }
      if (next >= s.notes.length && nextMark >= s.marks.length && timer) { clearInterval(timer); timer = null; }
    }

    pump();
    timer = setInterval(pump, TICK_MS);
    // The end clears every pending timer. On a busy machine this timer can run before the scheduler has queued the last
    // marks (they are queued shortly before they are due), which would lose their highlights. So marks that have not
    // fired yet are queued first, due at once, and the end follows them.
    function end() {
      if (!playing) return;
      if (fired < s.marks.length) {
        while (nextMark < s.marks.length) scheduleMark(s.marks[nextMark++], true);
        eventTimers.push(setTimeout(end, 0));
        return;
      }
      playing = false;
      clear();
      notify?.(null);
      notify = null;
    }
    eventTimers.push(setTimeout(end, Math.max(0, (endAt - c.currentTime) * 1000 + 100)));
  }

  return { play, stop, get playing() { return playing; } };
}

// Track preview on the Tracks page: one shared context, one preview at a time.
let previewCtx: AudioContext | null = null;
let previewVoices: Voice[] = [];
let previewTimer: ReturnType<typeof setTimeout> | null = null;

/** Stops the running track preview, if any. */
export function stopPreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = null;
  for (const v of previewVoices) v.stop();
  previewVoices = [];
}

/**
 * Plays the first `seconds` of a track (positions in quarter notes) with the neutral preview preset. Replaces any running preview.
 * `onDone` fires when the preview has played to its end; it does not fire when the preview is stopped or replaced.
 */
export function previewTrack(notes: RawNote[], tempo: number, seconds: number, onDone?: () => void): void {
  stopPreview();
  if (notes.length === 0) { onDone?.(); return; }
  previewCtx ??= new AudioContext();
  const c = previewCtx;
  void c.resume();
  const secPerQuarter = 60 / tempo;
  const from = Math.min(...notes.map(n => n.start));   // skip leading silence
  const t0 = c.currentTime + 0.05;
  const out = outputFor(c);
  let lastEnd = t0;
  for (const n of notes) {
    const start = t0 + (n.start - from) * secPerQuarter;
    if (start >= t0 + seconds) continue;
    const end = Math.min(start + n.dur * secPerQuarter, t0 + seconds);
    if (end - start < PREVIEW_PRESET.attack) continue;
    lastEnd = Math.max(lastEnd, end);
    const v = playVoice(c, out, PREVIEW_PRESET, n.midi, start, end, false, () => { previewVoices = previewVoices.filter(x => x !== v); });
    previewVoices.push(v);
  }
  previewTimer = setTimeout(() => { previewTimer = null; onDone?.(); }, Math.max(0, (lastEnd - c.currentTime) * 1000 + 50));
}
