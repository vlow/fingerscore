import { vi } from 'vitest';

/** An AudioParam that records every value and automation call. */
export class FakeParam {
  value = 0;
  readonly log: [method: string, value: number, time: number][] = [];
  readonly connectedFrom: FakeNode[] = [];
  setValueAtTime = vi.fn((v: number, t: number) => { this.log.push(['set', v, t]); return this; });
  linearRampToValueAtTime = vi.fn((v: number, t: number) => { this.log.push(['linear', v, t]); return this; });
  exponentialRampToValueAtTime = vi.fn((v: number, t: number) => { this.log.push(['exp', v, t]); return this; });
  setTargetAtTime = vi.fn((v: number, t: number, _c: number) => { this.log.push(['target', v, t]); return this; });
  /** Every value this param is set or ramped to, `value` included. */
  values(): number[] { return [this.value, ...this.log.map(c => c[1])]; }
  /** Highest value reached by automation. */
  peak(): number { return Math.max(...this.log.map(c => c[1])); }
}

export type NodeKind = 'oscillator' | 'gain' | 'biquad' | 'source' | 'convolver' | 'compressor' | 'destination';

/** Any audio node: carries every field the code under test may touch. */
export class FakeNode {
  type = '';
  loop = false;
  buffer: unknown = null;
  wave: unknown = null;
  onended: (() => void) | null = null;
  readonly outputs: (FakeNode | FakeParam)[] = [];
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
  readonly gain = new FakeParam();
  readonly Q = new FakeParam();
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
  start = vi.fn();
  stop = vi.fn();
  disconnect = vi.fn();
  setPeriodicWave = vi.fn((w: unknown) => { this.wave = w; });
  constructor(readonly kind: NodeKind) {}
  connect<T extends FakeNode | FakeParam>(next: T): T {
    this.outputs.push(next);
    if (next instanceof FakeParam) next.connectedFrom.push(this);
    return next;
  }
}

export interface FakeBuffer { length: number; numberOfChannels: number; sampleRate: number; getChannelData(ch: number): Float32Array }
export interface FakeWave { real: Float32Array; imag: Float32Array }

/** Records what the code builds; install with `vi.stubGlobal('AudioContext', FakeAudioContext)`. */
export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  readonly destination = new FakeNode('destination');
  readonly created: FakeNode[] = [];
  readonly waves: FakeWave[] = [];
  resume = vi.fn(async () => undefined);
  private make(kind: NodeKind) { const n = new FakeNode(kind); this.created.push(n); return n; }
  createOscillator() { return this.make('oscillator'); }
  createGain() { return this.make('gain'); }
  createBiquadFilter() { return this.make('biquad'); }
  createBufferSource() { return this.make('source'); }
  createConvolver() { return this.make('convolver'); }
  createDynamicsCompressor() { return this.make('compressor'); }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, numberOfChannels: channels, sampleRate, getChannelData: ch => data[ch] };
  }
  createPeriodicWave(real: Float32Array | number[], imag: Float32Array | number[]): FakeWave {
    const w = { real: Float32Array.from(real), imag: Float32Array.from(imag) };
    this.waves.push(w);
    return w;
  }
  of(kind: NodeKind): FakeNode[] { return this.created.filter(n => n.kind === kind); }
}

/** The fake context typed as the real one, for code under test. */
export const asCtx = (c: FakeAudioContext) => c as unknown as AudioContext;
