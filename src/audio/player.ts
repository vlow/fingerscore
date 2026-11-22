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
    playing = true;
    notify = onEvent;

    function schedule(n: Schedule['notes'][number], following: Schedule['notes'][number] | undefined) {
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
      const delay = (t: number) => Math.max(0, (t - c.currentTime) * 1000);
      eventTimers.push(setTimeout(() => { if (playing) onEvent(n.evId); }, delay(start)));
      // The last note's end is signalled by the song-end timer; a note that runs straight into the
      // next one gets no null, so a late timer cannot clear the next note's highlight.
      if (following && following.start > n.start + n.dur) {
        eventTimers.push(setTimeout(() => { if (playing) onEvent(null); }, delay(end)));
      }
    }

    function pump() {
      while (next < s.notes.length && t0 + secs(s.notes[next].start) < c.currentTime + LOOKAHEAD) {
        schedule(s.notes[next], s.notes[next + 1]);
        next++;
      }
      if (next >= s.notes.length && timer) { clearInterval(timer); timer = null; }
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

/** Stops the running track preview, if any. */
export function stopPreview(): void {
  for (const o of previewNodes) {
    try { o.stop(); } catch { /* already stopped */ }
    o.disconnect();
  }
  previewNodes = [];
}

/** Plays the first `seconds` of a track (positions in quarter notes) with a neutral timbre. Replaces any running preview. */
export function previewTrack(notes: RawNote[], tempo: number, seconds: number): void {
  stopPreview();
  if (notes.length === 0) return;
  previewCtx ??= new AudioContext();
  const c = previewCtx;
  void c.resume();
  const secPerQuarter = 60 / tempo;
  const from = Math.min(...notes.map(n => n.start));   // skip leading silence
  const t0 = c.currentTime + 0.05;
  const peak = PEAK / 2;                               // chords add up
  for (const n of notes) {
    const start = t0 + (n.start - from) * secPerQuarter;
    if (start >= t0 + seconds) continue;
    const end = Math.min(start + n.dur * secPerQuarter, t0 + seconds);
    if (end - start < ATTACK) continue;
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
}
