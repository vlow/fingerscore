import { asCtx, FakeAudioContext, type FakeBuffer, type FakeNode } from '../test/fakeAudio';
import { outputFor, REVERB_SECONDS, REVERB_WET } from './output';

it('builds one output per context', () => {
  const ctx = new FakeAudioContext();
  expect(outputFor(asCtx(ctx))).toBe(outputFor(asCtx(ctx)));
  expect(ctx.of('convolver')).toHaveLength(1);
  expect(ctx.of('compressor')).toHaveLength(1);
});

it('routes dry and reverb into a limiter on the destination', () => {
  const ctx = new FakeAudioContext();
  const out = outputFor(asCtx(ctx)) as unknown as FakeNode;
  const [limiter] = ctx.of('compressor');
  const [reverb] = ctx.of('convolver');
  expect(limiter.outputs).toEqual([ctx.destination]);
  expect(out.outputs).toContain(limiter);
  const wet = out.outputs.find(n => n !== limiter) as FakeNode;
  expect(wet.gain.value).toBe(REVERB_WET);
  expect(wet.outputs).toEqual([reverb]);
  expect(reverb.outputs).toEqual([limiter]);
});

it('the reverb impulse is stereo and decays over 1.2 s', () => {
  const ctx = new FakeAudioContext();
  outputFor(asCtx(ctx));
  const ir = ctx.of('convolver')[0].buffer as FakeBuffer;
  expect(REVERB_SECONDS).toBe(1.2);
  expect(ir.length).toBe(Math.round(1.2 * 48000));
  expect(ir.numberOfChannels).toBe(2);
  const tenth = Math.floor(ir.length / 10);
  const mean = (a: Float32Array) => a.reduce((s, x) => s + Math.abs(x), 0) / a.length;
  const data = ir.getChannelData(0);
  const head = mean(data.subarray(0, tenth));
  expect(head).toBeGreaterThan(0);
  expect(mean(data.subarray(ir.length - tenth))).toBeLessThan(0.05 * head);
});
