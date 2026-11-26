import type { Doc } from '../domain/types';
import { FakeAudioContext, type FakeNode, type NodeKind } from '../test/fakeAudio';
import { createPlayer, previewTrack, stopPreview } from './player';
import { PRESETS } from './presets';

const contexts: FakeAudioContext[] = [];
class RecordingContext extends FakeAudioContext {
  constructor() { super(); contexts.push(this); }
}

const seen = new Set<FakeNode>();
/** Main oscillators (one per note) created since the last call. */
function newNotes(): FakeNode[] {
  const fresh = contexts.flatMap(c => c.of('oscillator')).filter(o => o.wave !== null && !seen.has(o));
  fresh.forEach(o => seen.add(o));
  return fresh;
}
const all = (kind: NodeKind) => contexts.flatMap(c => c.of(kind));

beforeAll(() => vi.stubGlobal('AudioContext', RecordingContext));
afterAll(() => vi.unstubAllGlobals());

const notes = [{ start: 1, dur: 1, midi: 60 }, { start: 2, dur: 1, midi: 62 }, { start: 30, dur: 1, midi: 64 }];

it('previewTrack plays the notes inside the window and a second call stops the first', () => {
  newNotes();
  previewTrack(notes, 120, 8);           // 0.5 s per quarter: the note at 30 starts after 14.5 s
  const first = newNotes();
  expect(first).toHaveLength(2);
  expect(first[0].frequency.value).toBeCloseTo(261.63, 2);
  expect(first[0].start).toHaveBeenCalledWith(0.05);   // leading silence skipped: first note starts right away
  first.forEach(o => expect(o.disconnect).not.toHaveBeenCalled());

  previewTrack(notes, 120, 8);
  first.forEach(o => expect(o.disconnect).toHaveBeenCalled());
  const second = newNotes();
  second.forEach(o => expect(o.disconnect).not.toHaveBeenCalled());
  expect(second).toHaveLength(2);
});

it('previewTrack reports its natural end once, and not when it is stopped', () => {
  vi.useFakeTimers();
  try {
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

const doc = (inst: string, tempo = 100) => ({ inst, tempo }) as Doc;
const marksOf = (ns: { evId: string; start: number }[]) => ns.map(({ evId, start }) => ({ evId, start }));

it('plays the instrument family preset', () => {
  const player = createPlayer();
  const ns = [{ evId: 'a', start: 0, dur: 12, midi: 60 }];
  player.play({ notes: ns, marks: marksOf(ns), totalTicks: 12 }, doc('cl'), () => undefined);
  const ctx = contexts[contexts.length - 1];
  const imag = ctx.waves[ctx.waves.length - 1].imag;
  expect(Array.from(imag.subarray(1))).toEqual(PRESETS.Clarinet.harmonics.map(Math.fround));
  player.stop();
});

it('a note that follows another with no gap starts softer; one after a rest does not', () => {
  const player = createPlayer();
  const ns = [[0, 12], [12, 12], [30, 12]].map(([start, dur], i) => ({ evId: `n${i}`, start, dur, midi: 60 }));
  const before = all('biquad').length;
  // Fast enough that the scheduler's lookahead queues all three notes at once.
  player.play({ notes: ns, marks: marksOf(ns), totalTicks: 42 }, doc('asax', 1000), () => undefined);
  const breaths = all('biquad').slice(before).filter(b => b.type === 'bandpass').map(b => (b.outputs[0] as FakeNode).gain.peak());
  expect(breaths).toHaveLength(3);
  expect(breaths[1]).toBeLessThan(breaths[0]);
  expect(breaths[2]).toBe(breaths[0]);
  player.stop();
});

it('stop silences the breath noise too', () => {
  const player = createPlayer();
  const ns = [{ evId: 'a', start: 0, dur: 48, midi: 60 }];
  const before = all('source').length;
  player.play({ notes: ns, marks: marksOf(ns), totalTicks: 48 }, doc('fl'), () => undefined);
  const noise = all('source').slice(before);
  expect(noise).toHaveLength(1);
  player.stop();
  expect(noise[0].stop).toHaveBeenCalledWith();
});

it('previewTrack plays every note of a chord', () => {
  newNotes();
  previewTrack([60, 64, 67].map(midi => ({ start: 0, dur: 1, midi })), 120, 8);
  const chord = newNotes();
  expect(chord).toHaveLength(3);
  chord.forEach(o => expect(o.start).toHaveBeenCalledWith(0.05));
  stopPreview();
});

it('highlights a note when it is heard, not when it is rendered: output latency delays marks and the end', () => {
  // 210 ms between rendering a sample and hearing it, as with Bluetooth headphones.
  class LatentContext extends RecordingContext { baseLatency = 0.01; outputLatency = 0.2; }
  vi.stubGlobal('AudioContext', LatentContext);
  vi.useFakeTimers();
  try {
    const ns = [{ evId: 'e0', start: 0, dur: 24, midi: 60 }];
    const seen: (string | null)[] = [];
    createPlayer().play({ notes: ns, marks: marksOf(ns), totalTicks: 24 }, doc('asax'), id => seen.push(id));
    vi.advanceTimersByTime(280);        // the note sounds 80 ms after play; it is heard 210 ms after that
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(20);
    expect(seen).toEqual(['e0']);
    vi.advanceTimersByTime(1280);       // 1.2 s of music, 100 ms of margin, then the latency: the end is due at 1590 ms
    expect(seen).toEqual(['e0']);
    vi.advanceTimersByTime(20);
    expect(seen).toEqual(['e0', null]);
  } finally {
    vi.useRealTimers();
    vi.stubGlobal('AudioContext', RecordingContext);
  }
});
