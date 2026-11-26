import { PRESETS, PREVIEW_PRESET, type Preset } from './presets';

const all: [string, Preset][] = [...Object.entries(PRESETS), ['Preview', PREVIEW_PRESET]];

it.each(all)('%s keeps pitch clear: vibrato at most 15 cents, not before 0.25 s', (_, p) => {
  expect(p.vibrato.depth).toBeLessThanOrEqual(15);
  if (p.vibrato.depth > 0) expect(p.vibrato.delay).toBeGreaterThanOrEqual(0.25);
});

it('clarinet, recorder and the preview have no vibrato', () => {
  expect(PRESETS.Clarinet.vibrato.depth).toBe(0);
  expect(PRESETS.Recorder.vibrato.depth).toBe(0);
  expect(PREVIEW_PRESET.vibrato.depth).toBe(0);
});

it('clarinet favours odd harmonics', () => {
  const h = PRESETS.Clarinet.harmonics;
  expect(h[2]).toBeGreaterThan(h[1]);
  expect(h[4]).toBeGreaterThan(h[3]);
});

it.each(all)('%s is well-formed', (_, p) => {
  expect(p.harmonics[0]).toBe(1);
  expect(p.filter.peak).toBeGreaterThanOrEqual(p.filter.base);
  expect(p.attack).toBeGreaterThan(0);
  expect(p.release).toBeGreaterThan(0);
  expect(p.gain).toBeGreaterThan(0);
  expect(p.gain).toBeLessThanOrEqual(0.3);
});
