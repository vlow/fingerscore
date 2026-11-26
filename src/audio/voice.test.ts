import { asCtx, FakeAudioContext, FakeNode, type FakeParam } from '../test/fakeAudio';
import { PRESETS } from './presets';
import { playVoice } from './voice';

function setup() {
  const ctx = new FakeAudioContext();
  const out = new FakeNode('gain');
  const play = (preset = PRESETS.Saxophone, start = 1, end = 3, connected = false, midi = 60) =>
    playVoice(asCtx(ctx), out as unknown as AudioNode, preset, midi, start, end, connected);
  const main = () => ctx.of('oscillator').filter(o => o.wave !== null);
  const lfos = () => ctx.of('oscillator').filter(o => o.wave === null);
  const lowpass = () => ctx.of('biquad').filter(b => b.type === 'lowpass');
  return { ctx, out, play, main, lfos, lowpass };
}

it('plays the pitch with the preset waveform, built once per preset and context', () => {
  const { ctx, play, main } = setup();
  play();
  play(PRESETS.Saxophone, 3, 4);
  expect(main()).toHaveLength(2);
  expect(main()[0].frequency.value).toBeCloseTo(261.63, 2);
  expect(main()[0].start).toHaveBeenCalledWith(1);
  expect(ctx.waves).toHaveLength(1);
  expect(Array.from(ctx.waves[0].imag.subarray(1, 4))).toEqual(PRESETS.Saxophone.harmonics.slice(0, 3).map(Math.fround));
});

it('is tone only: no breath noise', () => {
  const { ctx, play } = setup();
  play(PRESETS.Flute);
  expect(ctx.of('source')).toHaveLength(0);
  expect(ctx.of('biquad').map(b => b.type)).toEqual(['lowpass']);
});

describe('vibrato', () => {
  it('fades in on a long saxophone note, on the pitch, from the preset delay', () => {
    const { play, main, lfos } = setup();
    play();
    expect(lfos()).toHaveLength(1);
    const depth = lfos()[0].outputs.find(n => (n as FakeNode).outputs?.includes(main()[0].detune)) as FakeNode;
    const { delay, fade, depth: cents } = PRESETS.Saxophone.vibrato;
    expect(depth.gain.log).toContainEqual(['set', 0, 1 + delay]);
    expect(depth.gain.log).toContainEqual(['linear', cents, 1 + delay + fade]);
  });

  it('scales the level instead of adding to it, so the release still reaches silence', () => {
    const { play, lfos } = setup();
    play();
    const targets = lfos()[0].outputs.flatMap(g => (g as FakeNode).outputs) as FakeParam[];
    const tremolo = targets.find(t => t.log !== undefined && t.connectedFrom.length > 0 && t.log.length === 0 && t.value === 1);
    expect(tremolo).toBeDefined();
    // Nothing from the LFO lands on a param that carries the note's envelope.
    for (const t of targets) expect(t.log.some(([m, v]) => m === 'linear' && v === 0)).toBe(false);
  });

  it('is left out on a short note', () => {
    const { play, lfos } = setup();
    play(PRESETS.Saxophone, 1, 1.3);
    expect(lfos()).toHaveLength(0);
  });

  it('is left out for a preset without it', () => {
    const { play, lfos } = setup();
    play(PRESETS.Clarinet);
    expect(lfos()).toHaveLength(0);
  });
});

it('a connected note starts softer: a darker filter', () => {
  const free = setup();
  free.play(PRESETS.Saxophone, 1, 3, false);
  const tied = setup();
  tied.play(PRESETS.Saxophone, 1, 3, true);
  expect(tied.lowpass()[0].frequency.log[0][1]).toBeLessThan(free.lowpass()[0].frequency.log[0][1]);
});

it('stop silences every source and node of the note, and may be called twice', () => {
  const { ctx, play } = setup();
  const v = play();
  v.stop();
  for (const n of ctx.created) expect(n.disconnect).toHaveBeenCalled();
  for (const n of [...ctx.of('oscillator'), ...ctx.of('source')]) expect(n.stop).toHaveBeenCalled();
  expect(() => v.stop()).not.toThrow();
});

it('a very short note keeps every automation time finite, ordered and not before its start', () => {
  const { ctx, play } = setup();
  play(PRESETS.Flute, 1, 1.01);
  const params = ctx.created.flatMap(n => [n.gain, n.frequency, n.detune]);
  for (const p of params) {
    const times = p.log.map(c => c[2]);
    for (const t of times) {
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThanOrEqual(1);
    }
    expect(times).toEqual([...times].sort((a, b) => a - b));
  }
});

it('keeps the filter below half the sample rate on a high note', () => {
  const { ctx, play, lowpass } = setup();
  ctx.sampleRate = 8000;
  play(PRESETS.Flute, 1, 3, false, 100);
  for (const v of lowpass()[0].frequency.values()) expect(v).toBeLessThanOrEqual(4000);
});

it('reports the end of the note', () => {
  const ctx = new FakeAudioContext();
  const ended = vi.fn();
  playVoice(asCtx(ctx), new FakeNode('gain') as unknown as AudioNode, PRESETS.Flute, 60, 1, 2, false, ended);
  ctx.of('oscillator').find(o => o.wave !== null)?.onended?.();
  expect(ended).toHaveBeenCalledTimes(1);
});
