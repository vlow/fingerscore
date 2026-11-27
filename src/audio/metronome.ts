import { beatPattern } from '../domain/playMode';
import type { TimeSig } from '../domain/types';

/** Play mode's metronome: a click on every beat of the bar, the first one higher. */
export interface Metronome {
  start(bpm: number, timeSig: TimeSig): void;
  /** Takes effect at the next beat; the count of the bar carries on. */
  setTempo(bpm: number): void;
  stop(): void;
  /** Stops and lets go of the audio context; a later start makes a new one. */
  dispose(): void;
  readonly running: boolean;
}

export const ACCENT_HZ = 1600;
export const BEAT_HZ = 1000;
export const CLICK_SECONDS = 0.03;
const LEVEL = 0.5;
/** Clicks are queued on the audio clock this far ahead, so a busy page cannot make them late. */
const LOOKAHEAD = 0.1;
const TICK_MS = 25;
/** The first click, and a click after a tempo change that is already overdue, comes this long from now. */
const LEAD = 0.05;
/**
 * On a new audio context the output is still waking up when its clock starts: the first part of the sound is lost,
 * and Bluetooth headphones lose more. Beat 1 waits this long there, so the bar starts on 1. A context that has run
 * before keeps the output awake and starts after LEAD.
 */
export const WARMUP_SECONDS = 0.3;

export function createMetronome(): Metronome {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let bpm = 120;
  let pattern = { perBar: 4, quarters: 1 };
  let beat = 0;          // the beat of the bar the next click falls on, from 0
  let next = 0;          // audio-clock time of the next click
  let last: number | null = null;
  // A new context: beat 1 is placed once its clock has moved past this time, WARMUP_SECONDS later.
  let waitPast: number | null = null;
  let live: OscillatorNode[] = [];

  const interval = () => (60 / bpm) * pattern.quarters;

  function click(c: AudioContext, at: number, accent: boolean) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = accent ? ACCENT_HZ : BEAT_HZ;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(LEVEL, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, at + CLICK_SECONDS);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.onended = () => { live = live.filter(o => o !== osc); gain.disconnect(); };
    osc.start(at);
    osc.stop(at + CLICK_SECONDS);
    live.push(osc);
  }

  function pump() {
    const c = ctx;
    if (!c) return;
    if (waitPast !== null) {
      if (c.currentTime <= waitPast) return;
      next = c.currentTime + WARMUP_SECONDS;
      waitPast = null;
    }
    while (next < c.currentTime + LOOKAHEAD) {
      click(c, next, beat === 0);
      last = next;
      beat = (beat + 1) % pattern.perBar;
      next += interval();
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    for (const o of live) o.stop();
    live = [];
    last = null;
    waitPast = null;
  }

  return {
    start(tempo, timeSig) {
      stop();
      const fresh = ctx === null;
      ctx ??= new AudioContext();
      void ctx.resume();
      bpm = tempo;
      pattern = beatPattern(timeSig);
      beat = 0;
      next = ctx.currentTime + LEAD;
      if (fresh) waitPast = ctx.currentTime;
      pump();
      timer = setInterval(pump, TICK_MS);
    },
    setTempo(tempo) {
      bpm = tempo;
      if (!timer || !ctx || last === null) return;
      next = Math.max(last + interval(), ctx.currentTime + LEAD);
    },
    stop,
    dispose() {
      stop();
      const c = ctx;
      ctx = null;
      void c?.close().catch(() => {});
    },
    get running() { return timer !== null; },
  };
}
