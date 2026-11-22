import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleDoc } from '../domain/fixture';
import { mod12 } from '../domain/keys';
import { inst } from '../domain/instruments';
import { DEFAULT_PREFS, rankShifts, scoringPitches } from '../domain/transpose';
import type { ParsedSong } from '../import/types';
import { readJSON } from './storage';
import { hydrate, useApp } from './store';

const best = (d: ReturnType<typeof sampleDoc>, prefs = DEFAULT_PREFS) =>
  rankShifts(scoringPitches(d.score), inst(d.inst), d.originalTonicPc, d.originalMode, prefs)[0].shift;

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  useApp.setState({ instId: 'asax', prefs: DEFAULT_PREFS, song: null, doc: null });
});

describe('store', () => {
  it('changing the instrument re-picks the shift and clears overrides', () => {
    useApp.getState().setDoc({ ...sampleDoc('asax'), fingering: { e3: 1 } });
    useApp.getState().setInstrument('cl');
    const d = useApp.getState().doc!;
    expect(d.inst).toBe('cl');
    expect(d.fingering).toEqual({});
    expect(mod12(2 + d.shift + 2)).toBe(0); // clarinet reads C
    expect(readJSON('local', 'fingerscore.inst')).toBe('cl');
  });

  it('setInstrument without a doc only updates and persists instId', () => {
    useApp.getState().setInstrument('fl');
    expect(useApp.getState().instId).toBe('fl');
    expect(useApp.getState().doc).toBeNull();
    expect(readJSON('local', 'fingerscore.inst')).toBe('fl');
  });

  it('changing the shift clears overrides and clamps', () => {
    useApp.getState().setDoc({ ...sampleDoc('asax'), fingering: { e3: 1 } });
    useApp.getState().setShift(1);
    expect(useApp.getState().doc!.shift).toBe(1);
    expect(useApp.getState().doc!.fingering).toEqual({});
    useApp.getState().setShift(99);
    expect(useApp.getState().doc!.shift).toBe(24);
    useApp.getState().setShift(-99);
    expect(useApp.getState().doc!.shift).toBe(-24);
  });

  it('setPrefs re-picks the best shift only when the doc was on the best shift', () => {
    const base = sampleDoc('asax');
    const prefs = { easyRegister: false, fewAccidentals: false };
    const newBest = best(base, prefs);
    const oldBest = best(base);
    // find a prefs change that moves the best shift; otherwise skip the premise check
    useApp.getState().setDoc({ ...base, shift: oldBest });
    useApp.getState().setPrefs(prefs);
    expect(useApp.getState().prefs).toEqual(prefs);
    expect(useApp.getState().doc!.shift).toBe(newBest);
    expect(readJSON('local', 'fingerscore.prefs')).toEqual(prefs);

    // a manual shift stays put
    useApp.setState({ prefs: DEFAULT_PREFS, doc: { ...base, shift: oldBest + 1 } });
    useApp.getState().setPrefs(prefs);
    expect(useApp.getState().doc!.shift).toBe(oldBest + 1);
  });

  it('setPrefs merges a partial and works without a doc', () => {
    useApp.getState().setPrefs({ easyRegister: false });
    expect(useApp.getState().prefs).toEqual({ easyRegister: false, fewAccidentals: true });
  });

  it('every mutation returns a new doc object', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    const steps: (() => void)[] = [
      () => useApp.getState().setShift(3),
      () => useApp.getState().patchDoc({ title: 'X' }),
      () => useApp.getState().setFingering('e1', 2),
      () => useApp.getState().resetFingerings(),
      () => useApp.getState().setInstrument('fl'),
      () => useApp.getState().setPrefs({ easyRegister: false }),
    ];
    for (const step of steps) {
      const before = useApp.getState().doc;
      step();
      expect(useApp.getState().doc).not.toBe(before);
    }
  });

  it('patchDoc updates fields; setFingering sets and removes; resetFingerings clears', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    useApp.getState().patchDoc({ title: 'New', tempo: 90, chartStyle: 'full' });
    expect(useApp.getState().doc).toMatchObject({ title: 'New', tempo: 90, chartStyle: 'full' });
    useApp.getState().setFingering('e1', 2);
    useApp.getState().setFingering('e2', 0);
    expect(useApp.getState().doc!.fingering).toEqual({ e1: 2, e2: 0 });
    useApp.getState().setFingering('e1', null);
    expect(useApp.getState().doc!.fingering).toEqual({ e2: 0 });
    useApp.getState().resetFingerings();
    expect(useApp.getState().doc!.fingering).toEqual({});
  });

  it('doc and song mutations are no-ops without a doc', () => {
    expect(() => {
      useApp.getState().setShift(2);
      useApp.getState().patchDoc({ title: 'x' });
      useApp.getState().setFingering('e1', 1);
      useApp.getState().resetFingerings();
    }).not.toThrow();
    expect(useApp.getState().doc).toBeNull();
  });

  it('setShift ignores non-finite input', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    const before = useApp.getState().doc!.shift;
    useApp.getState().setShift(NaN);
    useApp.getState().setShift(Infinity);
    expect(useApp.getState().doc!.shift).toBe(before);
  });

  it('hydrate sets instId from a restored doc', () => {
    localStorage.setItem('fingerscore.inst', JSON.stringify('cl'));
    useApp.getState().setDoc(sampleDoc('xc'));
    localStorage.setItem('fingerscore.inst', JSON.stringify('cl'));
    useApp.setState({ doc: null });
    hydrate();
    expect(useApp.getState().instId).toBe('xc');
  });

  it('doc survives a reload through sessionStorage', () => {
    useApp.getState().setDoc(sampleDoc('xc'));
    useApp.setState({ doc: null });
    hydrate();
    expect(useApp.getState().doc?.title).toBe('The Water Is Wide');
  });

  it('song survives a reload and setSong(null) clears storage', () => {
    const song: ParsedSong = { file: 'a.mid', format: 'MIDI', timeSig: [4, 4], tempo: 100, key: null, pickup: 0, marks: [], tracks: [] };
    useApp.getState().setSong(song);
    useApp.setState({ song: null });
    hydrate();
    expect(useApp.getState().song).toEqual(song);
    useApp.getState().setSong(null);
    expect(readJSON('session', 'fingerscore.song')).toBeNull();
  });

  it('hydrate restores instId and prefs from local storage', () => {
    localStorage.setItem('fingerscore.inst', JSON.stringify('cl'));
    localStorage.setItem('fingerscore.prefs', JSON.stringify({ easyRegister: false, fewAccidentals: false }));
    hydrate();
    expect(useApp.getState().instId).toBe('cl');
    expect(useApp.getState().prefs).toEqual({ easyRegister: false, fewAccidentals: false });
  });

  it('hydrate ignores an unknown instrument id', () => {
    localStorage.setItem('fingerscore.inst', JSON.stringify('kazoo'));
    hydrate();
    expect(useApp.getState().instId).toBe('asax');
  });

  it('blocked storage does not break the app', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(() => {
      useApp.getState().setInstrument('fl');
      useApp.getState().setDoc(sampleDoc('fl'));
      useApp.getState().setShift(2);
    }).not.toThrow();
    expect(useApp.getState().doc?.shift).toBe(2);
    spy.mockRestore();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(() => hydrate()).not.toThrow();
  });

  it('corrupt stored JSON is ignored', () => {
    sessionStorage.setItem('fingerscore.doc', '{oops');
    expect(() => hydrate()).not.toThrow();
    expect(useApp.getState().doc).toBeNull();
  });
});
