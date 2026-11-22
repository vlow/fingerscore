import { readFileSync } from 'node:fs';
import { writeMidi, type MidiEvent } from 'midi-file';
import { DEFAULT_PREFS } from '../domain/transpose';
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

  it('refuses 5/4', () => {
    const bytes = midiBytes([track([meta('timeSignature', { numerator: 5, denominator: 4, metronome: 24, thirtyseconds: 8 })], note(0, 60))]);
    expect(() => parseMidi('five.mid', bytes)).toThrowError(ImportError);
    try { parseMidi('five.mid', bytes); } catch (e) {
      expect((e as ImportError).userMessage).toBe('five.mid is in 5/4. fingerscore reads 4/4, 3/4, 2/4 and 6/8 for now.');
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

describe('parseFile', () => {
  it('refuses other extensions', async () => {
    await expect(parseFile(new File(['x'], 'song.abc'))).rejects.toMatchObject({ userMessage: '"song.abc" is not a format fingerscore reads yet. Use MIDI or MusicXML.' });
  });

  it('routes .mid to the MIDI reader', async () => {
    const s = await parseFile(new File([bareMidi()], 'bare.MID'));
    expect(s.format).toBe('MIDI');
  });
});
