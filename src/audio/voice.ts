// One note of a wind instrument: a waveform from the preset's harmonics through a lowpass that starts bright and
// settles, breath noise that is loud on the attack, and a vibrato that fades in on longer notes.
import { fillNoise } from './output';
import type { Preset } from './presets';

export interface Voice {
  /** Stops and disconnects everything the note started. Safe to call more than once. */
  stop(): void;
}

export const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const NOISE_SECONDS = 2;
const TAIL = 0.02;            // sources run this long past the end, so the release reaches zero
const VIBRATO_MIN_HOLD = 0.15; // a note gets vibrato only when it lasts this long past the vibrato delay
const TREMOLO = 0.05;          // the vibrato also moves the level by this share
const CONNECTED_BREATH = 0.4;  // a note that follows another with no gap: share of the breath burst
const CONNECTED_BRIGHT = 0.3;  // ... and share of the filter's attack brightness

const waves = new WeakMap<BaseAudioContext, Map<Preset, PeriodicWave>>();
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

function waveFor(ctx: BaseAudioContext, p: Preset): PeriodicWave {
  let known = waves.get(ctx);
  if (!known) {
    known = new Map();
    waves.set(ctx, known);
  }
  let wave = known.get(p);
  if (!wave) {
    const imag = Float32Array.from([0, ...p.harmonics]);
    wave = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
    known.set(p, wave);
  }
  return wave;
}

function noiseFor(ctx: BaseAudioContext): AudioBuffer {
  let buf = noises.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, NOISE_SECONDS * ctx.sampleRate, ctx.sampleRate);
    fillNoise(buf.getChannelData(0), 0x2545f491);
    noises.set(ctx, buf);
  }
  return buf;
}

export function playVoice(
  ctx: BaseAudioContext, out: AudioNode, p: Preset, midi: number,
  start: number, end: number, connected: boolean, onEnded?: () => void,
): Voice {
  const attackEnd = Math.min(start + p.attack, (start + end) / 2);
  const releaseStart = Math.max(attackEnd, end - p.release);
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];
  const track = <T extends AudioNode>(n: T) => { nodes.push(n); return n; };

  // Tone: waveform → lowpass → level envelope.
  const osc = track(ctx.createOscillator());
  osc.setPeriodicWave(waveFor(ctx, p));
  osc.frequency.value = hz(midi);
  const nyquist = ctx.sampleRate / 2 - 100;
  const base = Math.min(p.filter.base, nyquist);
  const peak = Math.min(connected ? p.filter.base + (p.filter.peak - p.filter.base) * CONNECTED_BRIGHT : p.filter.peak, nyquist);
  const lp = track(ctx.createBiquadFilter());
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(peak, start);
  lp.frequency.setTargetAtTime(base, start, p.filter.settle / 3);
  const amp = track(ctx.createGain());
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(p.gain, attackEnd);
  amp.gain.setValueAtTime(p.gain, releaseStart);
  amp.gain.linearRampToValueAtTime(0, end);
  osc.connect(lp).connect(amp);
  sources.push(osc);

  // Breath: looping noise → bandpass → its own envelope, loud on the attack.
  const noise = track(ctx.createBufferSource());
  noise.buffer = noiseFor(ctx);
  noise.loop = true;
  const bp = track(ctx.createBiquadFilter());
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(p.breath.freq, nyquist);
  bp.Q.value = p.breath.q;
  const breath = track(ctx.createGain());
  const burst = p.breath.attackLevel * (connected ? CONNECTED_BREATH : 1);
  const settled = Math.min(start + p.attack * 2, releaseStart);
  breath.gain.setValueAtTime(0, start);
  breath.gain.linearRampToValueAtTime(burst, attackEnd);
  breath.gain.linearRampToValueAtTime(p.breath.level, settled);
  breath.gain.setValueAtTime(p.breath.level, releaseStart);
  breath.gain.linearRampToValueAtTime(0, end);
  noise.connect(bp).connect(breath).connect(out);
  sources.push(noise);

  // Vibrato: one slow sine on the pitch (cents) and, a little, on the level; it fades in after the delay.
  // The level part scales the envelope's output instead of adding to it, so the release still ends in silence.
  const v = p.vibrato;
  let toneOut: AudioNode = amp;
  if (v.depth > 0 && end - start >= v.delay + VIBRATO_MIN_HOLD) {
    const lfo = track(ctx.createOscillator());
    lfo.type = 'sine';
    lfo.frequency.value = v.rate;
    const fadeIn = (g: GainNode, to: number) => {
      g.gain.setValueAtTime(0, start);
      g.gain.setValueAtTime(0, start + v.delay);
      g.gain.linearRampToValueAtTime(to, Math.min(start + v.delay + v.fade, end));
    };
    const pitch = track(ctx.createGain());
    fadeIn(pitch, v.depth);
    lfo.connect(pitch).connect(osc.detune);
    const tremolo = track(ctx.createGain());
    tremolo.gain.value = 1;
    amp.connect(tremolo);
    toneOut = tremolo;
    const level = track(ctx.createGain());
    fadeIn(level, TREMOLO);
    lfo.connect(level).connect(tremolo.gain);
    sources.push(lfo);
  }
  toneOut.connect(out);

  for (const s of sources) {
    s.start(start);
    s.stop(end + TAIL);
  }
  let stopped = false;
  osc.onended = () => onEnded?.();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const s of sources) {
        try { s.stop(); } catch { /* already stopped */ }
      }
      for (const n of nodes) n.disconnect();
    },
  };
}
