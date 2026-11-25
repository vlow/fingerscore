import { readFileSync } from 'node:fs';
import { writeMidi, type MidiEvent } from 'midi-file';
import { DEFAULT_PREFS } from '../domain/transpose';
import { expectValidBars } from '../test/validBars';
import { buildDoc } from './buildDoc';
import { parseFile } from './index';
import { parseMidi } from './midi';
import { ImportError } from './types';

const demo = () => parseMidi('Auld_Lang_Syne.mid', new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid')));

type Ev = Record<string, unknown>;
const meta = (type: string, rest: Ev = {}) => ({ deltaTime: 0, meta: true, type, ...rest });
const note = (channel: number, noteNumber: number, dt = 0, len = 480): Ev[] => [
  { deltaTime: dt, type: 'noteOn', channel, noteNumber, velocity: 80 },
  { deltaTime: len, type: 'noteOff', channel, noteNumber, velocity: 0 },
];
const track = (...parts: Ev[][]): MidiEvent[] => [...parts.flat(), meta('endOfTrack')] as MidiEvent[];
const midiBytes = (tracks: MidiEvent[][]) =>
  new Uint8Array(writeMidi({ header: { format: 1, numTracks: tracks.length, ticksPerBeat: 480 }, tracks }));
const bareMidi = () => midiBytes([track(note(0, 60), note(0, 62))]);

describe('parseMidi', () => {
  it('reads the demo', () => {
    const s = demo();
    expect(s).toMatchObject({ format: 'MIDI', timeSig: [4, 4], tempo: 100, key: { tonicPc: 5, mode: 'major' }, pickup: 1 });
    expect(s.tracks.map(t => t.name)).toEqual(['Melody', 'Chords', 'Bass', 'Drums']);
    expect(s.tracks[3].percussion).toBe(true);
    expect(s.tracks[0].notes).toHaveLength(56);
    expect(s.tracks[0].lyrics[0]).toEqual({ at: 0, text: 'Should' });
  });

  it('demo becomes a 17-bar sheet', () => {
    const doc = buildDoc(demo(), { trackId: demo().tracks[0].id, keep: 'top', lyricsFrom: demo().tracks[0].id, chordsFrom: null, instId: 'asax', prefs: DEFAULT_PREFS });
    expect(doc.score).toHaveLength(17);
    expect(doc.score[0].cap).toBe(12);
    expect(doc.score[1].ev.map(e => e.d)).toEqual([18, 6, 12, 12]);
    expect(doc.title).toBe('Auld Lang Syne');
    expect(doc.source.simplified).toBe(false);
  });

  it('keeps the demo lyrics on their notes', () => {
    const t = demo().tracks[0];
    expect(t.lyrics.slice(0, 5).map(l => l.text)).toEqual(['Should', 'auld', 'ac-', 'quain-', 'tance']);
    expect(t.lyrics[1].at).toBe(1);
    expect(t.lyrics.every(l => t.notes.some(n => Math.abs(n.start - l.at) < 1e-9))).toBe(true);
  });

  it('three notes at exact thirds of a quarter become a triplet', () => {
    const bytes = midiBytes([track(note(0, 60, 0, 160), note(0, 62, 0, 160), note(0, 64, 0, 160), note(0, 65, 0, 480 * 3))]);
    const s = parseMidi('t.mid', bytes);
    const doc = buildDoc(s, { trackId: s.tracks[0].id, keep: 'top', lyricsFrom: null, chordsFrom: null, instId: 'asax', prefs: DEFAULT_PREFS });
    expectValidBars(doc.score, doc.timeSig);
    expect(doc.score[0].ev.map(e => e.d)).toEqual([4, 4, 4, 36]);
    expect(doc.source.simplified).toBe(false);
  });

  it('reads the title from the name of a note-less first track', () => {
    const named = midiBytes([track([meta('trackName', { text: 'Greensleeves' })]), track([meta('trackName', { text: 'Flute' })], note(0, 60))]);
    expect(parseMidi('x.mid', named).title).toBe('Greensleeves');
  });

  it('a first track with notes names an instrument, not the song', () => {
    expect(demo().title).toBe('');
    expect(parseMidi('x.mid', bareMidi()).title).toBe('');
  });

  it('garbage bytes give a readable error', () => {
    expect(() => parseMidi('notes.mid', new TextEncoder().encode('hello'))).toThrowError(ImportError);
    try { parseMidi('notes.mid', new TextEncoder().encode('hello')); } catch (e) {
      expect((e as ImportError).userMessage).toBe('"notes.mid" could not be read as a MIDI file.');
    }
  });

  it('bare MIDI without meta events gets defaults', () => {
    const s = parseMidi('bare.mid', bareMidi());
    expect(s).toMatchObject({ tempo: 120, timeSig: [4, 4], key: null, pickup: 0 });
    expect(s.tracks[0].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 1, dur: 1, midi: 62 }]);
  });

  it('reads a minor key signature with its minor tonic', () => {
    const ks = (key: number) => midiBytes([track([meta('keySignature', { key, scale: 1 })], note(0, 60))]);
    expect(parseMidi('am.mid', ks(0)).key).toEqual({ tonicPc: 9, mode: 'minor' });
    expect(parseMidi('em.mid', ks(1)).key).toEqual({ tonicPc: 4, mode: 'minor' });
    expect(parseMidi('dm.mid', ks(-1)).key).toEqual({ tonicPc: 2, mode: 'minor' });
    expect(parseMidi('g.mid', midiBytes([track([meta('keySignature', { key: 1, scale: 0 })], note(0, 60))])).key).toEqual({ tonicPc: 7, mode: 'major' });
  });

  it('refuses 5/4', () => {
    const bytes = midiBytes([track([meta('timeSignature', { numerator: 5, denominator: 4, metronome: 24, thirtyseconds: 8 })], note(0, 60))]);
    expect(() => parseMidi('five.mid', bytes)).toThrowError(ImportError);
    try { parseMidi('five.mid', bytes); } catch (e) {
      expect((e as ImportError).userMessage).toBe('five.mid is in 5/4. fingerscore reads 4/4, 3/4, 2/4, 6/8 and 2/2 for now.');
    }
  });

  it('refuses a time signature change', () => {
    const ts = (n: number, d: number, dt = 0) => meta('timeSignature', { deltaTime: dt, numerator: n, denominator: d, metronome: 24, thirtyseconds: 8 });
    const bytes = midiBytes([track([ts(4, 4)], note(0, 60), [ts(3, 4, 0)], note(0, 62))]);
    try { parseMidi('chg.mid', bytes); expect.unreachable(); } catch (e) {
      expect((e as ImportError).userMessage).toBe('chg.mid changes its time signature. fingerscore reads one time signature per song for now.');
    }
  });

  it('refuses a drums-only file', () => {
    const bytes = midiBytes([track(note(9, 36), note(9, 38))]);
    try { parseMidi('d.mid', bytes); expect.unreachable(); } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).userMessage).toBe('"d.mid" has no melody track.');
    }
  });

  it('reads 6/8 and flags a pickup', () => {
    // 6/8 bar = 3 quarters; first note at 2 quarters leaves 1 quarter (<= half a bar) before the bar ends.
    const bytes = midiBytes([track([meta('timeSignature', { numerator: 6, denominator: 8, metronome: 24, thirtyseconds: 8 })], note(0, 60, 960), note(0, 62))]);
    const s = parseMidi('six.mid', bytes);
    expect(s.timeSig).toEqual([6, 8]);
    expect(s.pickup).toBe(1);
    expect(s.tracks[0].notes[0].start).toBe(0);
  });

  it('falls back to text events that sit on note onsets', () => {
    const txt = (text: string, dt: number) => meta('text', { deltaTime: dt, text });
    const bytes = midiBytes([track(
      [txt('la', 0)], [{ deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 80 }, { deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 }],
      [txt('di', 0)], [{ deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 62, velocity: 80 }, { deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: 62, velocity: 0 }],
    )]);
    expect(parseMidi('t.mid', bytes).tracks[0].lyrics).toEqual([{ at: 0, text: 'la' }, { at: 1, text: 'di' }]);
  });

  it('ignores text events that do not sit on note onsets', () => {
    const bytes = midiBytes([track([meta('text', { text: 'Written by someone' })], note(0, 60, 240))]);
    expect(parseMidi('t.mid', bytes).tracks[0].lyrics).toEqual([]);
  });
});

/** Build a track from absolute ticks; noteOff sorts before noteOn at the same tick. */
const absTrack = (events: { tick: number; ev: Ev; order?: number }[]): MidiEvent[] => {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || (a.order ?? 1) - (b.order ?? 1));
  let last = 0;
  return track(sorted.map(e => { const d = e.tick - last; last = e.tick; return [{ ...e.ev, deltaTime: d }]; }).flat() as unknown as Ev[]);
};
const nt = (tick: number, n: number, ch = 0, len = 480) => [
  { tick, ev: { type: 'noteOn', channel: ch, noteNumber: n, velocity: 80 } },
  { tick: tick + len, ev: { type: 'noteOff', channel: ch, noteNumber: n, velocity: 0 }, order: 0 },
];
const ly = (tick: number, text: string, type = 'lyrics') => ({ tick, ev: meta(type, { text }), order: 0 });
const sig = (n: number, d: number) => ({ tick: 0, ev: meta('timeSignature', { numerator: n, denominator: d, metronome: 24, thirtyseconds: 8 }), order: -1 });
const tempo = { tick: 0, ev: meta('setTempo', { microsecondsPerBeat: 500000 }), order: -1 };

describe('lyric attachment', () => {
  it('finds lyrics behind an empty conductor track', () => {
    const bytes = midiBytes([
      absTrack([tempo, sig(4, 4)]),
      absTrack([...nt(0, 60), ...nt(480, 62), ly(0, 'la'), ly(480, 'di')]),
    ]);
    const s = parseMidi('c.mid', bytes);
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0].lyrics).toEqual([{ at: 0, text: 'la' }, { at: 1, text: 'di' }]);
  });

  it('attaches lyrics stored in the conductor track to the melody', () => {
    const bytes = midiBytes([
      absTrack([tempo, ly(0, 'la'), ly(480, 'di')]),
      absTrack([...nt(0, 60), ...nt(480, 62)]),
    ]);
    const s = parseMidi('c.mid', bytes);
    expect(s.tracks[0].lyrics.map(l => l.text)).toEqual(['la', 'di']);
  });

  it('attaches lyrics to the matching channel of a split track', () => {
    const bytes = midiBytes([absTrack([
      ...nt(0, 60, 0), ...nt(480, 62, 0), ...nt(240, 72, 1), ...nt(720, 74, 1), ly(0, 'la'), ly(480, 'di'),
    ])]);
    const s = parseMidi('two.mid', bytes);
    expect(s.tracks).toHaveLength(2);
    const low = s.tracks.find(t => t.notes[0].midi === 60)!;
    const high = s.tracks.find(t => t.notes[0].midi === 72)!;
    expect(low.lyrics.map(l => l.text)).toEqual(['la', 'di']);
    expect(high.lyrics).toEqual([]);
  });

  it('drops a lyric list that matches no onsets', () => {
    const bytes = midiBytes([absTrack([...nt(0, 60), ly(200, 'x')])]);   // 5 ticks of 12 away: beyond the reach
    expect(parseMidi('n.mid', bytes).tracks[0].lyrics).toEqual([]);
  });

  it('matches lyrics within a sixteenth of an onset, like buildDoc', () => {
    const bytes = midiBytes([absTrack([...nt(0, 60), ...nt(480, 62), ly(30, 'la'), ly(580, 'di')])]);   // 0.75 and 2.5 ticks late
    const s = parseMidi('late.mid', bytes);
    expect(s.tracks[0].lyrics.map(l => l.text)).toEqual(['la', 'di']);
    const doc = buildDoc(s, { trackId: s.tracks[0].id, keep: 'top', lyricsFrom: s.tracks[0].id, chordsFrom: null, instId: 'asax', prefs: DEFAULT_PREFS });
    expect(doc.score[0].ev.filter(e => !e.r).map(e => e.l)).toEqual(['la', 'di']);
  });

  it('cleans karaoke text: skips @ headers, strips / and \\ and line ends, drops empty syllables', () => {
    const bytes = midiBytes([absTrack([
      ...nt(0, 60), ...nt(480, 62), ...nt(960, 64), ...nt(1440, 65),
      ly(0, '@KMIDI KARAOKE FILE', 'text'), ly(0, '@LENGLISH', 'text'),
      ly(0, 'la ', 'text'), ly(480, '/di', 'text'), ly(960, '\\da\r\n', 'text'), ly(1440, '/', 'text'),
    ])]);
    expect(parseMidi('k.kar', bytes).tracks[0].lyrics).toEqual([{ at: 0, text: 'la' }, { at: 1, text: 'di' }, { at: 2, text: 'da' }]);
  });

  it('cleans lyric events the same way', () => {
    const bytes = midiBytes([absTrack([...nt(0, 60), ...nt(480, 62), ly(0, 'la\r'), ly(480, ' ')])]);
    expect(parseMidi('l.mid', bytes).tracks[0].lyrics).toEqual([{ at: 0, text: 'la' }]);
  });
});

describe('timing', () => {
  it('rejects SMPTE time division', () => {
    const bytes = new Uint8Array(writeMidi({ header: { format: 1, numTracks: 1, framesPerSecond: 25, ticksPerFrame: 40 }, tracks: [track(note(0, 60))] }));
    try { parseMidi('smpte.mid', bytes); expect.unreachable(); } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).userMessage).toBe('"smpte.mid" could not be read as a MIDI file.');
    }
  });

  it('trims count-in bars when the melody starts on a downbeat', () => {
    const bytes = midiBytes([absTrack([...nt(2 * 1920, 60), ...nt(2 * 1920 + 480, 62)])]);
    const s = parseMidi('b.mid', bytes);
    expect(s.pickup).toBe(0);
    expect(s.tracks[0].notes.map(n => n.start)).toEqual([0, 1]);
  });

  it('trims empty bars before a pickup', () => {
    const bytes = midiBytes([absTrack([...nt(2 * 1920 + 1440, 60), ...nt(3 * 1920, 62)])]);
    const s = parseMidi('b.mid', bytes);
    expect(s.pickup).toBe(1);
    expect(s.tracks[0].notes.map(n => n.start)).toEqual([0, 1]);
  });

  it('drops count-in drum hits', () => {
    const bytes = midiBytes([
      absTrack([...nt(0, 36, 9, 120), ...nt(1920, 36, 9, 120), ...nt(1920, 60, 0), ...nt(2400, 62, 0)]),
    ]);
    const s = parseMidi('d.mid', bytes);
    const drums = s.tracks.find(t => t.percussion)!;
    expect(drums.notes.map(n => n.start)).toEqual([0]);
  });

  it('treats a remainder of exactly half a bar as a pickup', () => {
    const s = parseMidi('h.mid', midiBytes([absTrack(nt(960, 60))]));
    expect(s.pickup).toBe(2);
    expect(s.tracks[0].notes[0].start).toBe(0);
  });

  it('keeps the leading rest when the remainder is over half a bar', () => {
    const s = parseMidi('h.mid', midiBytes([absTrack(nt(900, 60))]));
    expect(s.pickup).toBe(0);
    expect(s.tracks[0].notes[0].start).toBeCloseTo(900 / 480);
  });
});

describe('parseFile', () => {
  it('routes .mid to the MIDI reader', async () => {
    const s = await parseFile(new File([bareMidi()], 'bare.MID'));
    expect(s.format).toBe('MIDI');
  });
});
