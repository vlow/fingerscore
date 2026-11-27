import { FakeAudioContext, type FakeNode } from '../test/fakeAudio';
import { ACCENT_HZ, BEAT_HZ, createMetronome } from './metronome';

let ctx: FakeAudioContext | null = null;
class RecordingContext extends FakeAudioContext {
  constructor() { super(); ctx = this; }
}

beforeEach(() => {
  ctx = null;
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', RecordingContext);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Plays `seconds` of audio-clock time in steps of 5 ms, timers included. */
function advance(seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.005) {
    ctx!.currentTime += 0.005;
    vi.advanceTimersByTime(5);
  }
}
const clicks = (): FakeNode[] => ctx!.of('oscillator');
const startsAt = () => clicks().map(o => Number((o.start.mock.calls[0][0] as number).toFixed(3)));
const pitches = () => clicks().map(o => o.frequency.value);

describe('metronome', () => {
  it('clicks every beat, accenting the first of each bar', () => {
    const m = createMetronome();
    m.start(120, [3, 4]);
    expect(m.running).toBe(true);
    advance(1.5);
    expect(startsAt()).toEqual([0.05, 0.55, 1.05, 1.55]);
    expect(pitches()).toEqual([ACCENT_HZ, BEAT_HZ, BEAT_HZ, ACCENT_HZ]);
  });

  it('clicks dotted quarters in 6/8', () => {
    createMetronome().start(120, [6, 8]);
    advance(1.6);
    expect(startsAt()).toEqual([0.05, 0.8, 1.55]);
    expect(pitches()).toEqual([ACCENT_HZ, BEAT_HZ, ACCENT_HZ]);
  });

  it('clicks halves in 2/2', () => {
    createMetronome().start(120, [2, 2]);
    advance(2.1);
    expect(startsAt()).toEqual([0.05, 1.05, 2.05]);
  });

  it('takes a new tempo at the next beat without catching up', () => {
    const m = createMetronome();
    m.start(120, [4, 4]);
    advance(0.6);
    expect(startsAt()).toEqual([0.05, 0.55]);
    m.setTempo(60);
    advance(1.6);
    expect(startsAt()).toEqual([0.05, 0.55, 1.55]);
    expect(pitches()[2]).toBe(BEAT_HZ);
  });

  it('starts the next beat soon when the new interval is already over', () => {
    const m = createMetronome();
    m.start(60, [4, 4]);
    advance(0.9);   // clicks at 0.05, next due at 1.05
    m.setTempo(240); // 0.05 + 0.25 is past: the next click comes shortly
    advance(0.1);
    expect(startsAt()[1]).toBeCloseTo(0.95, 2);
  });

  it('falls silent at once when stopped', () => {
    const m = createMetronome();
    m.start(120, [4, 4]);
    advance(0.52);   // 0.55 is already queued
    const queued = clicks().length;
    m.stop();
    expect(m.running).toBe(false);
    for (const o of clicks()) expect(o.stop).toHaveBeenCalledWith();
    advance(2);
    expect(clicks()).toHaveLength(queued);
  });

  it('starts again on beat 1 after a stop', () => {
    const m = createMetronome();
    m.start(120, [4, 4]);
    advance(0.6);
    m.stop();
    const before = clicks().length;
    m.start(120, [4, 4]);
    advance(0.01);
    expect(clicks()[before].frequency.value).toBe(ACCENT_HZ);
  });

  it('lets go of its audio context when disposed', () => {
    const m = createMetronome();
    m.start(120, [4, 4]);
    advance(0.2);
    m.dispose();
    expect(m.running).toBe(false);
    expect(ctx!.close).toHaveBeenCalledTimes(1);
    for (const o of clicks()) expect(o.stop).toHaveBeenCalledWith();
  });

  it('disposes without ever having made a context', () => {
    expect(() => createMetronome().dispose()).not.toThrow();
    expect(ctx).toBeNull();
  });
});
