import { inst } from '../domain/instruments';
import type { Family } from '../domain/instruments';
import { ticksToSeconds, type Schedule } from '../domain/playback';
import type { Doc } from '../domain/types';

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
      const delay = (t: number) => Math.max(0, (t - c.currentTime) * 1000);
      eventTimers.push(setTimeout(() => { if (playing) onEvent(n.evId); }, delay(start)));
      eventTimers.push(setTimeout(() => { if (playing) onEvent(null); }, delay(end)));
    }

    function pump() {
      while (next < s.notes.length && t0 + secs(s.notes[next].start) < c.currentTime + LOOKAHEAD) {
        schedule(s.notes[next++]);
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
