import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleDoc } from '../domain/fixture';
import { mod12 } from '../domain/keys';
import { inst } from '../domain/instruments';
import { DEFAULT_PREFS, rankShifts, scoringPitches } from '../domain/transpose';
import type { ParsedSong } from '../import/types';
import { readJSON } from './storage';
import { BLOCKED_MESSAGE, deleteEntry, listEntries } from './library';
import { hydrate, saveStatus, useApp } from './store';

const best = (d: ReturnType<typeof sampleDoc>, prefs = DEFAULT_PREFS) =>
  rankShifts(scoringPitches(d.score), inst(d.inst), d.originalTonicPc, d.originalMode, prefs)[0].shift;

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  useApp.setState({ instId: 'asax', prefs: DEFAULT_PREFS, song: null, doc: null, libraryId: null, savedSnapshot: null, saveError: null });
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

  it('a re-picked shift from setPrefs clears overrides', () => {
    const base = sampleDoc('asax');
    const prefs = { easyRegister: false, fewAccidentals: false };
    expect(best(base, prefs)).not.toBe(best(base));
    useApp.getState().setDoc({ ...base, shift: best(base), fingering: { e3: 1 } });
    useApp.getState().setPrefs(prefs);
    expect(useApp.getState().doc!.fingering).toEqual({});
  });

  it('switching the recorder system clears overrides; other patches keep them', () => {
    useApp.getState().setDoc({ ...sampleDoc('rs'), fingering: { e3: 1 } });
    useApp.getState().patchDoc({ title: 'T', recorderSystem: 'baroque' });
    expect(useApp.getState().doc!.fingering).toEqual({ e3: 1 });
    useApp.getState().patchDoc({ recorderSystem: 'german' });
    expect(useApp.getState().doc!.fingering).toEqual({});
  });

  it('any instrument change clears overrides, even with an unchanged shift; the same instrument keeps them', () => {
    const base = sampleDoc('asax');
    const clBest = rankShifts(scoringPitches(base.score), inst('cl'), base.originalTonicPc, base.originalMode, DEFAULT_PREFS)[0].shift;
    useApp.getState().setDoc({ ...base, shift: clBest, fingering: { e3: 1 } });
    useApp.getState().setInstrument('cl');
    expect(useApp.getState().doc!.shift).toBe(clBest);
    expect(useApp.getState().doc!.fingering).toEqual({});

    useApp.getState().setDoc({ ...base, shift: best(base), fingering: { e3: 1 } });
    useApp.getState().setInstrument('asax');
    expect(useApp.getState().doc!.fingering).toEqual({ e3: 1 });
  });

  it('setShift to another shift clears overrides', () => {
    useApp.getState().setDoc({ ...sampleDoc('asax'), fingering: { e3: 1 } });
    useApp.getState().setShift(useApp.getState().doc!.shift + 1);
    expect(useApp.getState().doc!.fingering).toEqual({});
  });

  it('a prefs change that keeps the shift keeps overrides', () => {
    const base = sampleDoc('asax');
    useApp.getState().setDoc({ ...base, shift: best(base) + 1, fingering: { e3: 1 } });   // manual shift: not re-picked
    useApp.getState().setPrefs({ easyRegister: false, fewAccidentals: false });
    expect(useApp.getState().doc!.shift).toBe(best(base) + 1);
    expect(useApp.getState().doc!.fingering).toEqual({ e3: 1 });
  });

  it('setShift to the same shift keeps overrides', () => {
    useApp.getState().setDoc({ ...sampleDoc('asax'), fingering: { e3: 1 } });
    useApp.getState().setShift(useApp.getState().doc!.shift);
    expect(useApp.getState().doc!.fingering).toEqual({ e3: 1 });
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

  it('a failed write removes the stale value, so a reload cannot mix two files', () => {
    useApp.getState().setDoc(sampleDoc('xc'));
    expect(readJSON('session', 'fingerscore.doc')).not.toBeNull();
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (v.length > 2000) throw new DOMException('full', 'QuotaExceededError');
      real.call(this, k, v);
    });
    useApp.getState().setDoc({ ...sampleDoc('fl'), title: 'File B' });
    expect(sessionStorage.getItem('fingerscore.doc')).toBeNull();
    const song: ParsedSong = { file: 'b.mid', format: 'MIDI', timeSig: [4, 4], tempo: 100, key: null, pickup: 0, marks: [],
      tracks: [{ id: 't0', name: 'x'.repeat(3000), instrument: '', channel: 1, percussion: false, notes: [], lyrics: [], chords: [] }] };
    sessionStorage.setItem('fingerscore.song', '{"old":true}');
    useApp.getState().setSong(song);
    expect(sessionStorage.getItem('fingerscore.song')).toBeNull();
  });

  it('corrupt stored JSON is ignored', () => {
    sessionStorage.setItem('fingerscore.doc', '{oops');
    expect(() => hydrate()).not.toThrow();
    expect(useApp.getState().doc).toBeNull();
  });
});

describe('library state', () => {
  it('save status follows the document', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    expect(saveStatus(useApp.getState())).toBe('new');
    expect(useApp.getState().saveSheet()).toBe(true);
    expect(saveStatus(useApp.getState())).toBe('saved');
    useApp.getState().patchDoc({ tempo: 90 });
    expect(saveStatus(useApp.getState())).toBe('dirty');
    useApp.getState().patchDoc({ tempo: sampleDoc('asax').tempo });
    expect(saveStatus(useApp.getState())).toBe('saved');
    useApp.getState().saveSheet();
    expect(listEntries()).toHaveLength(1);
  });

  it('a failed save keeps the sheet and reports it', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(useApp.getState().saveSheet()).toBe(false);
    spy.mockRestore();
    expect(useApp.getState().saveError).toBe(BLOCKED_MESSAGE);
    expect(saveStatus(useApp.getState())).toBe('new');
    expect(useApp.getState().doc).not.toBeNull();
    expect(useApp.getState().saveSheet()).toBe(true);
    expect(useApp.getState().saveError).toBeNull();
  });

  it('opening an entry replaces the sheet, clears the song and is saved', () => {
    useApp.getState().setDoc({ ...sampleDoc('cl'), title: 'Mine' });
    useApp.getState().saveSheet();
    const id = useApp.getState().libraryId!;
    useApp.setState({ song: {} as any });
    useApp.getState().setDoc(sampleDoc('fl'));
    expect(useApp.getState().openEntry(id)).toBe(true);
    expect(useApp.getState()).toMatchObject({ song: null, libraryId: id, instId: 'cl' });
    expect(useApp.getState().doc!.source).toMatchObject({ format: 'library', file: 'Mine' });
    expect(saveStatus(useApp.getState())).toBe('saved');
    expect(useApp.getState().openEntry('nope')).toBe(false);
  });

  it('opening an entry keeps its shift and overrides', () => {
    const d = sampleDoc('cl');
    useApp.getState().setDoc({ ...d, shift: d.shift + 2 });
    useApp.getState().saveSheet();
    const id = useApp.getState().libraryId!;
    useApp.getState().openEntry(id);
    expect(useApp.getState().doc!.shift).toBe(d.shift + 2);
  });

  it('an imported file is added and opened', () => {
    expect(useApp.getState().openImported({ ...sampleDoc('xc'), title: 'Dropped' }, 'dropped.fingerscore.json')).toBe(true);
    expect(listEntries()[0].title).toBe('Dropped');
    expect(useApp.getState().doc!.source).toMatchObject({ format: 'file', file: 'dropped.fingerscore.json' });
    expect(saveStatus(useApp.getState())).toBe('saved');
  });

  it('a failed import keeps the current sheet', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(useApp.getState().openImported(sampleDoc('xc'), 'a.fingerscore.json')).toBe(false);
    spy.mockRestore();
    expect(useApp.getState().doc!.inst).toBe('asax');
    expect(useApp.getState().saveError).toBe(BLOCKED_MESSAGE);
  });

  it('forgetting the current entry makes the sheet new again', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    useApp.getState().saveSheet();
    const id = useApp.getState().libraryId!;
    deleteEntry(id);
    useApp.getState().forgetEntry(id);
    expect(saveStatus(useApp.getState())).toBe('new');
  });

  it('forgetting another entry changes nothing', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    useApp.getState().saveSheet();
    useApp.getState().forgetEntry('other');
    expect(saveStatus(useApp.getState())).toBe('saved');
  });

  it('library link survives a reload', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    useApp.getState().saveSheet();
    const id = useApp.getState().libraryId;
    useApp.setState({ doc: null, libraryId: null, savedSnapshot: null });
    hydrate();
    expect(useApp.getState().libraryId).toBe(id);
    expect(saveStatus(useApp.getState())).toBe('saved');
  });

  it('a new sheet from an import is not linked', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    useApp.getState().saveSheet();
    useApp.getState().setDoc(sampleDoc('fl'));
    expect(useApp.getState().libraryId).toBeNull();
    expect(useApp.getState().savedSnapshot).toBeNull();
  });
});
