import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseChord } from '../domain/chords';
import { removeBar } from '../domain/edit';
import { sampleDoc } from '../domain/fixture';
import { mod12 } from '../domain/keys';
import { inst } from '../domain/instruments';
import { DEFAULT_PREFS, rankShifts, scoringPitches } from '../domain/transpose';
import type { ParsedSong } from '../import/types';
import { readJSON } from './storage';
import { BLOCKED_MESSAGE, deleteEntry, listEntries } from './library';
import { canRedo, canUndo, HISTORY_LIMIT, hydrate, saveStatus, setClock, useApp } from './store';

const best = (d: ReturnType<typeof sampleDoc>, prefs = DEFAULT_PREFS) =>
  rankShifts(scoringPitches(d.score), inst(d.inst), d.originalTonicPc, d.originalMode, prefs)[0].shift;

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  useApp.setState({ instId: 'asax', prefs: DEFAULT_PREFS, song: null, doc: null, libraryId: null, savedSnapshot: null, saveError: null, past: [], future: [] });
});

afterEach(() => { setClock(Date.now); });

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

  it('setPreferredInstrument persists instId and leaves the open doc alone', () => {
    useApp.getState().setDoc({ ...sampleDoc('asax'), fingering: { e3: 1 } });
    const before = useApp.getState().doc;
    useApp.getState().setPreferredInstrument('cl');
    expect(useApp.getState().instId).toBe('cl');
    expect(useApp.getState().doc).toBe(before);
    expect(readJSON('local', 'fingerscore.inst')).toBe('cl');
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
      () => useApp.getState().setPrefs({ easyRegister: false, fewAccidentals: false }),   // moves the best shift (see above)
      () => useApp.getState().setShift(3),
      () => useApp.getState().patchDoc({ title: 'X' }),
      () => useApp.getState().setFingering('e1', 2),
      () => useApp.getState().resetFingerings(),
      () => useApp.getState().setInstrument('fl'),
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
    const song: ParsedSong = { file: 'a.mid', format: 'MIDI', timeSig: [4, 4], tempo: 100, key: null, pickup: 0, marks: [], dropped: [], tracks: [] };
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
    const song: ParsedSong = { file: 'b.mid', format: 'MIDI', timeSig: [4, 4], tempo: 100, key: null, pickup: 0, marks: [], dropped: [],
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
  it('relinkEntry links the open sheet to an entry again: saved when equal, dirty when edited', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    useApp.getState().saveSheet();
    const id = useApp.getState().libraryId!;
    deleteEntry(id);
    useApp.getState().forgetEntry(id);
    expect(saveStatus(useApp.getState())).toBe('new');
    useApp.getState().relinkEntry(id);   // not in the library: no change
    expect(useApp.getState()).toMatchObject({ libraryId: null, savedSnapshot: null });
    useApp.getState().setDoc(sampleDoc('asax'));
    useApp.getState().saveSheet();
    const id2 = useApp.getState().libraryId!;
    useApp.getState().forgetEntry(id2);
    useApp.getState().relinkEntry(id2);
    expect(useApp.getState().libraryId).toBe(id2);
    expect(saveStatus(useApp.getState())).toBe('saved');
    useApp.getState().forgetEntry(id2);
    useApp.getState().patchDoc({ tempo: 90 });
    useApp.getState().relinkEntry(id2);
    expect(saveStatus(useApp.getState())).toBe('dirty');
  });

  it('relinkEntry with an unknown id changes nothing', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    useApp.getState().saveSheet();
    const before = useApp.getState();
    useApp.getState().relinkEntry('nope');
    expect(useApp.getState()).toMatchObject({ libraryId: before.libraryId, savedSnapshot: before.savedSnapshot });
  });

  it('relinkEntry ignores the source rewrite of an opened sheet', () => {
    useApp.getState().setDoc({ ...sampleDoc('cl'), title: 'Mine' });
    useApp.getState().saveSheet();
    const id = useApp.getState().libraryId!;
    useApp.getState().openEntry(id);
    useApp.getState().forgetEntry(id);
    useApp.getState().relinkEntry(id);
    expect(saveStatus(useApp.getState())).toBe('saved');
  });

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
    expect(useApp.getState().openImported({ ...sampleDoc('xc'), title: 'Dropped' }, 'dropped.fingerscore.json')).toEqual({ saved: true });
    expect(listEntries()[0].title).toBe('Dropped');
    expect(useApp.getState().doc!.source).toMatchObject({ format: 'file', file: 'dropped.fingerscore.json' });
    expect(saveStatus(useApp.getState())).toBe('saved');
  });

  it('an import that cannot be saved opens anyway, unlinked, and returns the storage message', () => {
    useApp.getState().setDoc(sampleDoc('asax'));
    useApp.getState().saveSheet();
    expect(sessionStorage.getItem('fingerscore.sheet')).not.toBeNull();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(useApp.getState().openImported({ ...sampleDoc('xc'), title: 'Blocked' }, 'a.fingerscore.json')).toEqual({ saved: false, message: BLOCKED_MESSAGE });
    spy.mockRestore();
    const st = useApp.getState();
    expect(st.doc).toMatchObject({ inst: 'xc', title: 'Blocked', source: { format: 'file', file: 'a.fingerscore.json' } });
    expect(st.libraryId).toBeNull();
    expect(saveStatus(st)).toBe('new');
    expect(st.saveError).toBeNull();
    expect(sessionStorage.getItem('fingerscore.sheet')).toBeNull();   // a reload does not link it to the old entry
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

describe('history', () => {
  it('undo and redo restore documents', () => {
    const s = useApp.getState; s().setDoc(sampleDoc('asax')); const d0 = s().doc!;
    s().patchDoc({ tempo: 90 }); s().setShift(d0.shift + 1); expect(s().past).toHaveLength(2); expect(canUndo(s())).toBe(true);
    s().undo(); expect(s().doc!.shift).toBe(d0.shift); expect(s().doc!.tempo).toBe(90); expect(canRedo(s())).toBe(true);
    s().undo(); expect(s().doc).toBe(d0); expect(canUndo(s())).toBe(false);
    s().redo(); s().redo(); expect(s().doc!.shift).toBe(d0.shift + 1); expect(canRedo(s())).toBe(false);
    s().undo(); s().patchDoc({ tempo: 70 }); expect(s().future).toEqual([]);       // a new change clears redo
  });
  it('undo and redo without history change nothing', () => {
    const s = useApp.getState; s().undo(); s().redo(); expect(s().doc).toBeNull();
    s().setDoc(sampleDoc('fl')); const d = s().doc; s().undo(); s().redo(); expect(s().doc).toBe(d);
  });
  it('undo brings back what a structural edit removed (review focus 3)', () => {
    const s = useApp.getState; let d = sampleDoc('asax'); const bar = d.score[2]; const ev = bar.ev[0];
    d = { ...d, fingering: { [ev.id]: 0 }, chords: { ...d.chords, [ev.id]: parseChord('C', 0) } }; s().setDoc(d);
    expect(s().applyEdit(removeBar(d, 2)!.doc)).toBe(true); expect(s().doc!.score).toHaveLength(d.score.length - 1); expect(s().doc!.chords[ev.id]).toBeUndefined();
    s().undo(); expect(s().doc).toBe(d); s().redo(); expect(s().doc!.fingering[ev.id]).toBeUndefined();
  });
  it('applyEdit refuses null and identical documents', () => {
    const s = useApp.getState; s().setDoc(sampleDoc('fl'));
    expect(s().applyEdit(null)).toBe(false); expect(s().applyEdit(s().doc)).toBe(false); expect(s().past).toEqual([]);
  });
  it('every document action is undoable', () => {
    const s = useApp.getState; s().setDoc(sampleDoc('asax'));
    const steps = [() => s().setPrefs({ easyRegister: false, fewAccidentals: false }), () => s().setShift(3), () => s().patchDoc({ title: 'X' }), () => s().setFingering('e1', 2), () => s().resetFingerings(),
      () => s().setInstrument('fl')];
    steps.forEach((step, k) => { step(); expect(s().past).toHaveLength(k + 1); });
  });
  it('coalesces changes to one field within 1.5 s (review focus 4)', () => {
    const s = useApp.getState; let t = 0; setClock(() => t); s().setDoc({ ...sampleDoc('fl'), title: 'A' });
    s().patchDoc({ title: 'Ab' }, 'title'); t += 500; s().patchDoc({ title: 'Abc' }, 'title'); expect(s().past).toHaveLength(1);
    t += 2000; s().patchDoc({ title: 'Abcd' }, 'title'); expect(s().past).toHaveLength(2);
    s().patchDoc({ subtitle: 'x' }, 'subtitle'); expect(s().past).toHaveLength(3);                 // another key starts a new step
    s().undo(); s().undo(); expect(s().doc!.title).toBe('Abc'); s().undo(); expect(s().doc!.title).toBe('A');
    s().patchDoc({ title: 'B' }, 'title'); s().undo(); t += 100; s().patchDoc({ title: 'C' }, 'title'); expect(s().past).toHaveLength(1);   // undo resets coalescing
  });
  it('a change without a key ends a coalescing step', () => {
    const s = useApp.getState; const t = 0; setClock(() => t); s().setDoc(sampleDoc('fl'));
    s().patchDoc({ title: 'a' }, 'title'); s().patchDoc({ tempo: 90 }); s().patchDoc({ title: 'ab' }, 'title'); expect(s().past).toHaveLength(3);
  });
  it('history is capped at 200 steps', () => {
    const s = useApp.getState; s().setDoc(sampleDoc('fl')); for (let i = 0; i < 250; i++) s().patchDoc({ tempo: 40 + (i % 150) });
    expect(s().past.length).toBe(HISTORY_LIMIT);
  });
  it('opening or importing a sheet resets history and raises the generation', () => {
    const s = useApp.getState; s().setDoc(sampleDoc('fl')); s().patchDoc({ tempo: 90 }); const g = s().sheetGen; s().saveSheet(); const id = s().libraryId!;
    s().setDoc(sampleDoc('cl')); expect(s().past).toEqual([]); expect(s().sheetGen).toBe(g + 1);
    s().patchDoc({ tempo: 80 }); s().openEntry(id); expect(s().past).toEqual([]); expect(s().future).toEqual([]); expect(s().sheetGen).toBe(g + 2);
    s().patchDoc({ tempo: 70 }); s().undo(); s().openImported(sampleDoc('asax'), 'a.json'); expect(s().future).toEqual([]); expect(s().sheetGen).toBe(g + 3);
    s().patchDoc({ tempo: 60 }); s().openUnsaved(sampleDoc('asax'), 'b.json'); expect(s().past).toEqual([]); expect(s().sheetGen).toBe(g + 4);
  });
  it('undo to the saved document shows saved', () => {
    const s = useApp.getState; s().setDoc(sampleDoc('fl')); s().saveSheet();
    s().patchDoc({ tempo: 90 }); expect(saveStatus(s())).toBe('dirty'); s().undo(); expect(saveStatus(s())).toBe('saved');
  });
  it('undo of an instrument change restores instrument, shift and fingering choices', () => {
    const s = useApp.getState; const d = { ...sampleDoc('asax'), fingering: { e3: 0 } }; s().setDoc(d); s().setInstrument('cl');
    expect(s().doc!.fingering).toEqual({}); s().undo(); expect(s().doc).toBe(d); expect(s().instId).toBe('asax');
    s().redo(); expect(s().instId).toBe('cl');
  });
  it('history is not written to storage', () => {
    const s = useApp.getState; s().setDoc(sampleDoc('fl')); s().patchDoc({ tempo: 90 });
    expect(Object.keys(sessionStorage).join() + Object.keys(localStorage).join()).not.toMatch(/past|future|history/i);
    useApp.setState({ doc: null, past: [], future: [] }); hydrate(); expect(useApp.getState().past).toEqual([]);
  });
});

describe('no empty undo steps', () => {
  /** Makes one real change, undoes it, runs the action, and checks that neither stack moved. */
  function expectNoStep(prepare: () => void, action: () => void) {
    const s = useApp.getState; prepare();
    s().patchDoc({ title: 'step' }); s().undo();
    const { doc, past, future } = s();
    action();
    expect(s().doc).toBe(doc); expect(s().past).toBe(past); expect(s().future).toBe(future); expect(future).toHaveLength(1);
  }
  const open = (patch: Partial<ReturnType<typeof sampleDoc>> = {}) => () => useApp.getState().setDoc({ ...sampleDoc('asax'), ...patch });

  it('patchDoc with the current values', () => {
    const d = sampleDoc('asax');
    expectNoStep(open(), () => useApp.getState().patchDoc({ tempo: d.tempo, title: d.title, show: { ...d.show } }));
  });
  it('patchDoc with a changed show flag is a step', () => {
    const s = useApp.getState; s().setDoc(sampleDoc('asax')); s().patchDoc({ show: { ...s().doc!.show, lyrics: false } }); expect(s().past).toHaveLength(1);
  });
  it('setFingering with the current value, or removing an absent one', () => {
    expectNoStep(open({ fingering: { e1: 0 } }), () => { useApp.getState().setFingering('e1', 0); useApp.getState().setFingering('e2', null); });
  });
  it('resetFingerings without overrides', () => { expectNoStep(open(), () => useApp.getState().resetFingerings()); });
  it('setInstrument with the current instrument', () => { expectNoStep(open(), () => useApp.getState().setInstrument('asax')); });
  it('setShift to the current shift', () => { expectNoStep(open(), () => useApp.getState().setShift(useApp.getState().doc!.shift)); });
  it('setPrefs that re-picks the same shift updates prefs only', () => {
    expectNoStep(open(), () => useApp.getState().setPrefs({ easyRegister: DEFAULT_PREFS.easyRegister }));
    expect(useApp.getState().prefs).toEqual(DEFAULT_PREFS);
  });
});

describe('session document on load', () => {
  it('a stored document without imported maps and with stray c fields hydrates with empty maps and can be edited', () => {
    const stored: any = JSON.parse(JSON.stringify(sampleDoc('asax')));
    delete stored.imported;
    for (const bar of stored.score) for (const e of bar.ev) e.c = 'C';
    sessionStorage.setItem('fingerscore.doc', JSON.stringify(stored));
    hydrate();
    const doc = useApp.getState().doc!;
    expect(doc.imported).toEqual({ lyrics: {}, chords: {} });
    expect('c' in doc.score[0].ev[0]).toBe(false);
    expect(doc.source).toEqual(stored.source);
    expect(useApp.getState().applyEdit(removeBar(doc, 2)!.doc)).toBe(true);
  });
  it('a stored document that fails validation hydrates to no document and drops the sheet link', () => {
    const stored: any = JSON.parse(JSON.stringify(sampleDoc('asax')));
    stored.score[1].ev[0].d = 5;
    sessionStorage.setItem('fingerscore.doc', JSON.stringify(stored));
    sessionStorage.setItem('fingerscore.sheet', JSON.stringify({ libraryId: 'x', savedSnapshot: 'y' }));
    hydrate();
    expect(useApp.getState().doc).toBeNull();
    expect(useApp.getState().libraryId).toBeNull();
    expect(sessionStorage.getItem('fingerscore.doc')).toBeNull();
    expect(sessionStorage.getItem('fingerscore.sheet')).toBeNull();
  });
});
