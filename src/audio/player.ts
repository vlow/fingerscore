import { inst } from '../domain/instruments';
import type { Family } from '../domain/instruments';
import { ticksToSeconds, type Schedule } from '../domain/playback';
import type { Doc } from '../domain/types';
import type { RawNote } from '../import/types';

export interface Player {
  play(s: Schedule, doc: Doc, onEvent: (evId: string | null) => void): void;
  stop(): void;
  readonly playing: boolean;
}

const TIMBRE: Record<Family, { type: OscillatorType; cutoff: number }> = {
  Saxophone: { type: 'sawtooth', cutoff: 2200 },
  Xaphoon: { type: 'sawtooth', cutoff: 1500 },
  Clarinet: { type: 'square', cutoff: 1500 },
  Flute: { type: 'sine', cutoff: 4000 },
  Recorder: { type: 'triangle', cutoff: 3000 },
};

const ATTACK = 0.025;
const RELEASE = 0.06;
const PEAK = 0.22;
const LOOKAHEAD = 0.5;  // seconds scheduled ahead
const TICK_MS = 100;    // scheduler interval

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export function createPlayer(): Player {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let eventTimers: ReturnType<typeof setTimeout>[] = [];
  let nodes: OscillatorNode[] = [];
  let playing = false;
  let notify: ((evId: string | null) => void) | null = null;

  function clear() {
    if (timer) clearInterval(timer);
    timer = null;
    eventTimers.forEach(clearTimeout);
    eventTimers = [];
    for (const o of nodes) {
      try { o.stop(); } catch { /* already stopped */ }
      o.disconnect();
    }
    nodes = [];
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
    const { type, cutoff } = TIMBRE[inst(doc.inst).group];
    const t0 = c.currentTime + 0.08;
    const secs = (ticks: number) => ticksToSeconds(ticks, doc.tempo);
    const endAt = t0 + secs(s.totalTicks);
    let next = 0;
    let nextMark = 0;
    playing = true;
    notify = onEvent;

    function schedule(n: Schedule['notes'][number]) {
      const start = t0 + secs(n.start);
      const end = start + secs(n.dur);
      const osc = c.createOscillator();
      const lp = c.createBiquadFilter();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = hz(n.midi);
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(PEAK, start + ATTACK);
      gain.gain.setValueAtTime(PEAK, Math.max(start + ATTACK, end - RELEASE));
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(lp).connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(end + 0.02);
      nodes.push(osc);
      osc.onended = () => { nodes = nodes.filter(x => x !== osc); };
    }

    // Marks cover the whole timeline (every note chain and every rest), so the highlight moves
    // from one to the next without gaps; the song-end timer clears the last one.
    function scheduleMark(m: Schedule['marks'][number]) {
      const at = t0 + secs(m.start);
      eventTimers.push(setTimeout(() => { if (playing) onEvent(m.evId); }, Math.max(0, (at - c.currentTime) * 1000)));
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
    eventTimers.push(setTimeout(() => {
      if (!playing) return;
      playing = false;
      clear();
      notify?.(null);
      notify = null;
    }, Math.max(0, (endAt - c.currentTime) * 1000 + 100)));
  }

  return { play, stop, get playing() { return playing; } };
}

// Track preview on the Tracks page: one shared context, one preview at a time.
let previewCtx: AudioContext | null = null;
let previewNodes: OscillatorNode[] = [];
let previewTimer: ReturnType<typeof setTimeout> | null = null;

/** Stops the running track preview, if any. */
export function stopPreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = null;
  for (const o of previewNodes) {
    try { o.stop(); } catch { /* already stopped */ }
    o.disconnect();
  }
  previewNodes = [];
}

/**
 * Plays the first `seconds` of a track (positions in quarter notes) with a neutral timbre. Replaces any running preview.
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
  const peak = PEAK / 2;                               // chords add up
  let lastEnd = t0;
  for (const n of notes) {
    const start = t0 + (n.start - from) * secPerQuarter;
    if (start >= t0 + seconds) continue;
    const end = Math.min(start + n.dur * secPerQuarter, t0 + seconds);
    if (end - start < ATTACK) continue;
    lastEnd = Math.max(lastEnd, end);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = hz(n.midi);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + ATTACK);
    gain.gain.setValueAtTime(peak, Math.max(start + ATTACK, end - RELEASE));
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(end + 0.02);
    osc.onended = () => { previewNodes = previewNodes.filter(x => x !== osc); };
    previewNodes.push(osc);
  }
  previewTimer = setTimeout(() => { previewTimer = null; onDone?.(); }, Math.max(0, (lastEnd - c.currentTime) * 1000 + 50));
}
