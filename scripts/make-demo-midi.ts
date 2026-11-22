/** Writes public/demo/Auld_Lang_Syne.mid: the built-in demo song (public domain). Run with `npm run demo`. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeMidi, type MidiEvent } from 'midi-file';

const PPQ = 480;
const BAR = 4 * PPQ;
const OUT = 'public/demo/Auld_Lang_Syne.mid';

const Q = PPQ, E = PPQ / 2, DQ = Q + E, DH = 3 * Q;
const NAME: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pitch = (s: string) => NAME[s[0]] + 12 * (Number(s[1]) + 1);

// [pitch, duration, lyric]; '' = no lyric event for that note
type Step = [string, number, string];
const melody: Step[] = [
  ['C4', Q, 'Should'],
  ['F4', DQ, 'auld'], ['F4', E, 'ac-'], ['F4', Q, 'quain-'], ['A4', Q, 'tance'],
  ['G4', DQ, 'be'], ['F4', E, 'for-'], ['G4', Q, 'got'], ['A4', Q, 'and'],
  ['F4', DQ, 'nev-'], ['F4', E, 'er'], ['A4', Q, 'brought'], ['C5', Q, 'to'],
  ['D5', DH, 'mind'], ['D5', Q, 'Should'],
  ['C5', DQ, 'auld'], ['A4', E, 'ac-'], ['A4', Q, 'quain-'], ['F4', Q, 'tance'],
  ['G4', DQ, 'be'], ['F4', E, 'for-'], ['G4', Q, 'got'], ['A4', Q, 'and'],
  ['F4', DQ, ''], ['D4', E, ''], ['D4', Q, 'auld'], ['C4', Q, 'lang'],
  ['F4', DH, 'syne'], ['D5', Q, 'For'],
  ['C5', DQ, 'auld'], ['A4', E, 'lang'], ['A4', Q, 'syne'], ['F4', Q, 'my'],
  ['G4', DQ, 'jo'], ['F4', E, ''], ['G4', Q, 'for'], ['D5', Q, 'auld'],
  ['C5', DQ, 'lang'], ['A4', E, ''], ['A4', Q, 'syne'], ['C5', Q, "we'll"],
  ['D5', DH, 'tak'], ['D5', Q, 'a'],
  ['C5', DQ, 'cup'], ['A4', E, "o'"], ['A4', Q, 'kind-'], ['F4', Q, 'ness'],
  ['G4', DQ, 'yet'], ['F4', E, ''], ['G4', Q, ''], ['A4', Q, 'for'],
  ['F4', DQ, ''], ['D4', E, ''], ['D4', Q, 'auld'], ['C4', Q, 'lang'],
  ['F4', DH, 'syne'],
];

// Harmony: one chord per half bar, 16 bars from the first downbeat after the pickup.
const CHORDS = {
  F: { notes: ['F3', 'A3', 'C4'], root: 'F2' },
  C7: { notes: ['E3', 'G3', 'Bb3', 'C4'], root: 'C3' },
  Bb: { notes: ['D3', 'F3', 'Bb3'], root: 'Bb2' },
  Dm: { notes: ['D3', 'F3', 'A3'], root: 'D3' },
} as const;
type ChordName = keyof typeof CHORDS;
const harmony: ChordName[] = [
  'F', 'F', 'C7', 'C7', 'F', 'F', 'Bb', 'Bb',
  'F', 'F', 'C7', 'C7', 'F', 'Dm', 'F', 'F',
  'F', 'F', 'C7', 'C7', 'F', 'F', 'Bb', 'Bb',
  'F', 'F', 'C7', 'C7', 'F', 'Dm', 'F', 'F',
];
const FLAT: Record<string, number> = { Bb: 10 };
const midiOf = (s: string) => (s[1] === 'b' ? FLAT[s.slice(0, 2)] + 12 * (Number(s[2]) + 1) : pitch(s));

type Abs = { tick: number; order: number; ev: Omit<MidiEvent, 'deltaTime'> };
const toTrack = (events: Abs[], end: number): MidiEvent[] => {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  let last = 0;
  const out = sorted.map(e => {
    const ev = { ...e.ev, deltaTime: e.tick - last } as MidiEvent;
    last = e.tick;
    return ev;
  });
  out.push({ deltaTime: Math.max(0, end - last), meta: true, type: 'endOfTrack' } as MidiEvent);
  return out;
};
const on = (tick: number, channel: number, n: number, velocity: number): Abs =>
  ({ tick, order: 1, ev: { type: 'noteOn', channel, noteNumber: n, velocity } as MidiEvent });
const off = (tick: number, channel: number, n: number): Abs =>
  ({ tick, order: 0, ev: { type: 'noteOff', channel, noteNumber: n, velocity: 0 } as MidiEvent });
const metaAt = (tick: number, ev: Record<string, unknown>): Abs => ({ tick, order: -1, ev: { meta: true, ...ev } as unknown as MidiEvent });
const head = (name: string, channel: number, program?: number): Abs[] => [
  metaAt(0, { type: 'trackName', text: name }),
  ...(program === undefined ? [] : [{ tick: 0, order: -1, ev: { type: 'programChange', channel, programNumber: program } as MidiEvent }]),
];

const START = BAR;                                   // pickup bar: three quarters of silence in every track
const musicStart = START;                            // first full downbeat
const songEnd = musicStart + 16 * BAR;

// Track 1: melody; the pickup note sits on beat 4 of the first bar.
const mel: Abs[] = [
  ...head('Melody', 0, 73),
  metaAt(0, { type: 'setTempo', microsecondsPerBeat: 600000 }),     // 100 bpm
  metaAt(0, { type: 'timeSignature', numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 }),
  metaAt(0, { type: 'keySignature', key: -1, scale: 0 }),            // F major
];
let t = 3 * Q;
for (const [p, d, lyric] of melody) {
  const n = pitch(p);
  if (lyric) mel.push(metaAt(t, { type: 'lyrics', text: lyric }));
  mel.push(on(t, 0, n, 90), off(t + d, 0, n));
  t += d;
}

const chords: Abs[] = head('Chords', 1, 0);
const bass: Abs[] = head('Bass', 2, 32);
harmony.forEach((name, i) => {
  const at = musicStart + i * 2 * Q;
  for (const s of CHORDS[name].notes) chords.push(on(at, 1, midiOf(s), 60), off(at + 2 * Q, 1, midiOf(s)));
  const root = midiOf(CHORDS[name].root);
  bass.push(on(at, 2, root, 80), off(at + Q + E, 2, root));
});

const drums: Abs[] = head('Drums', 9);
for (let beat = 0; beat < 64; beat++) {
  const at = musicStart + beat * Q;
  const hit = (n: number, v: number) => drums.push(on(at, 9, n, v), off(at + E, 9, n));
  if (beat % 4 === 0 || beat % 4 === 2) hit(36, 70);   // kick on 1 and 3
  if (beat % 4 === 1 || beat % 4 === 3) hit(42, 50);   // closed hat on 2 and 4
}

const tracks = [mel, chords, bass, drums].map(e => toTrack(e, songEnd));
const bytes = writeMidi({ header: { format: 1, numTracks: tracks.length, ticksPerBeat: PPQ }, tracks });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Uint8Array.from(bytes));
console.log(`${OUT}: ${bytes.length} bytes`);
