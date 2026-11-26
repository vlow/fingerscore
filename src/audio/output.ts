// The node every playing voice connects to: a dry path and a light reverb, both into a limiter so that several notes
// at once do not distort. Built once per AudioContext.

export const REVERB_SECONDS = 1.2;
export const REVERB_WET = 0.15;
/** The reverb hears only what is below this: like a real room, it swallows the top highs. */
const REVERB_LOWPASS = 5000;

const outputs = new WeakMap<BaseAudioContext, AudioNode>();

/**
 * Fills `data` with white noise in [-1, 1). A seeded generator (xorshift32), not Math.random: the noise needs no
 * unpredictability, and the same seed gives the same sound.
 */
function fillNoise(data: Float32Array, seed: number): void {
  let x = Math.trunc(seed) || 1;   // the shifts below work on its 32-bit integer value
  for (let i = 0; i < data.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    data[i] = (x >>> 0) / 2 ** 31 - 1;
  }
}

/** Stereo noise that dies away over `REVERB_SECONDS`: a small, soft room. */
function impulse(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.round(REVERB_SECONDS * ctx.sampleRate);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    fillNoise(data, 0x9e3779b9 + ch);
    for (let i = 0; i < length; i++) data[i] *= (1 - i / length) ** 3;
  }
  return ir;
}

export function outputFor(ctx: BaseAudioContext): AudioNode {
  const known = outputs.get(ctx);
  if (known) return known;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  limiter.connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx);
  reverb.connect(limiter);
  const darken = ctx.createBiquadFilter();
  darken.type = 'lowpass';
  darken.frequency.value = REVERB_LOWPASS;
  darken.connect(reverb);
  const wet = ctx.createGain();
  wet.gain.value = REVERB_WET;
  wet.connect(darken);

  const input = ctx.createGain();
  input.gain.value = 1;
  input.connect(limiter);
  input.connect(wet);
  outputs.set(ctx, input);
  return input;
}
