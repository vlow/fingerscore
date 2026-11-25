import type { Doc } from '../domain/types';
import { createPlayer, previewTrack, stopPreview } from './player';

class FakeNode {
  stop = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  type = '';
  frequency = { value: 0 };
  gain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  onended: (() => void) | null = null;
  connect<T>(next: T): T { return next; }
}

const oscillators: FakeNode[] = [];

class FakeAudioContext {
  currentTime = 0;
  destination = new FakeNode();
  resume = vi.fn(async () => undefined);
  createOscillator() { const o = new FakeNode(); oscillators.push(o); return o; }
  createGain() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
}

beforeAll(() => vi.stubGlobal('AudioContext', FakeAudioContext));
afterAll(() => vi.unstubAllGlobals());

const notes = [{ start: 1, dur: 1, midi: 60 }, { start: 2, dur: 1, midi: 62 }, { start: 30, dur: 1, midi: 64 }];

it('previewTrack plays the notes inside the window and a second call stops the first', () => {
  previewTrack(notes, 120, 8);           // 0.5 s per quarter: the note at 30 starts after 14.5 s
  const first = oscillators.splice(0);
  expect(first).toHaveLength(2);
  expect(first[0].frequency.value).toBeCloseTo(261.63, 2);
  expect(first[0].start).toHaveBeenCalledWith(0.05);   // leading silence skipped: first note starts right away
  first.forEach(o => expect(o.disconnect).not.toHaveBeenCalled());

  previewTrack(notes, 120, 8);
  first.forEach(o => expect(o.disconnect).toHaveBeenCalled());
  oscillators.forEach(o => expect(o.disconnect).not.toHaveBeenCalled());
  expect(oscillators).toHaveLength(2);
});

it('previewTrack reports its natural end once, and not when it is stopped', () => {
  vi.useFakeTimers();
  try {
    oscillators.splice(0);
    const done = vi.fn();
    previewTrack(notes, 120, 8, done);      // last sounding note ends 1 s after the start
    vi.advanceTimersByTime(900);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(done).toHaveBeenCalledTimes(1);

    const stopped = vi.fn();
    previewTrack(notes, 120, 8, stopped);
    stopPreview();
    vi.advanceTimersByTime(5000);
    expect(stopped).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it('plays every highlight mark and then ends, also when the end timer runs before the scheduler queued the last marks', () => {
  vi.useFakeTimers();
  try {
    // The audio clock stands still, as on a machine that is too busy to run the scheduler: it queues only the first
    // mark, and the end timer is due before the others would have been queued.
    const notes = [0, 24, 48].map((start, i) => ({ evId: `e${i}`, start, dur: 12, midi: 60 + i }));
    const marks = [0, 24, 48].map((start, i) => ({ evId: `e${i}`, start }));
    const seen: (string | null)[] = [];
    const player = createPlayer();
    player.play({ notes, marks, totalTicks: 60 }, { inst: 'asax', tempo: 100 } as Doc, id => seen.push(id));
    vi.advanceTimersByTime(3500);       // past the end timer (3.0 s of music plus 100 ms)
    expect(seen).toEqual(['e0', 'e1', 'e2', null]);
    expect(player.playing).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
