import { create } from 'zustand';
import { inst, ORDER } from '../domain/instruments';
import { DEFAULT_PREFS, rankShifts, scoringPitches, type Prefs } from '../domain/transpose';
import type { Doc, InstId } from '../domain/types';
import type { ParsedSong } from '../import/types';
import { canonical, validateDoc } from '../domain/persistence';
import { getEntry, saveEntry } from './library';
import { adoptUnsavedTempo, forgetUnsavedTempo } from './playTempos';
import { readJSON, remove, writeJSON } from '../shell/storage';

const KEY_INST = 'fingerscore.inst';
const KEY_PREFS = 'fingerscore.prefs';
const KEY_SONG = 'fingerscore.song';
const KEY_DOC = 'fingerscore.doc';
const KEY_SHEET = 'fingerscore.sheet';

export interface AppState {
  instId: InstId; prefs: Prefs; song: ParsedSong | null; doc: Doc | null;
  libraryId: string | null;
  savedSnapshot: string | null;                    // canonical(doc) at the last save or open
  saveError: string | null;
  /** Earlier and undone documents, oldest first; in memory only, never persisted. */
  past: Doc[]; future: Doc[];
  /** Raised whenever another sheet is opened or imported: the "same sheet" test. */
  sheetGen: number;
  undo(): void;
  redo(): void;
  /** Applies an edited document as one history step; false when there is none or it is the current one. */
  applyEdit(next: Doc | null, coalesceKey?: string): boolean;
  saveSheet(): boolean;
  openEntry(id: string): boolean;
  /** Adds an imported sheet to the library and opens it; when the save fails it opens the sheet unlinked. */
  openImported(doc: Doc, fileName: string): ImportResult;
  /** Opens an imported sheet without a library entry ("Not saved yet"). */
  openUnsaved(doc: Doc, fileName: string): void;
  forgetEntry(id: string): void;
  relinkEntry(id: string): void;
  /** Changes the open sheet's instrument (sheet page). */
  setInstrument(id: InstId): void;
  /** The instrument new sheets are built for (start page); the open sheet is not touched. */
  setPreferredInstrument(id: InstId): void;
  setPrefs(p: Partial<Prefs>): void;
  setSong(s: ParsedSong | null): void;
  setDoc(d: Doc | null): void;
  setShift(shift: number): void;
  patchDoc(p: Partial<Pick<Doc, 'title' | 'subtitle' | 'tempo' | 'chartStyle' | 'recorderSystem' | 'show'>>, coalesceKey?: string): void;
  setFingering(evId: string, index: number | null): void;
  resetFingerings(): void;
}

function bestShift(doc: Doc, instId: InstId, prefs: Prefs): number {
  return rankShifts(scoringPitches(doc.score), inst(instId), doc.originalTonicPc, doc.originalMode, prefs)[0].shift;
}

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 1500;

export function canUndo(s: Pick<AppState, 'past'>): boolean { return s.past.length > 0; }
export function canRedo(s: Pick<AppState, 'future'>): boolean { return s.future.length > 0; }

let now: () => number = Date.now;
/** Test hook: the clock that decides whether changes coalesce. */
export function setClock(fn: () => number): void { now = fn; }

// The key and time of the last committed change, for coalescing; undo, redo and opening a sheet end a step.
let lastKey: string | null = null;
let lastAt = 0;
const endStep = () => { lastKey = null; };

export type SaveStatus = 'new' | 'dirty' | 'saved';
export type ImportResult = { saved: true } | { saved: false; message: string };

export function saveStatus(s: Pick<AppState, 'doc' | 'libraryId' | 'savedSnapshot'>): SaveStatus {
  if (!s.libraryId || !s.doc) return 'new';
  return canonical(s.doc) === s.savedSnapshot ? 'saved' : 'dirty';
}

/** True when every patched field already has that value (show compared flag by flag). */
function samePatch(doc: Doc, p: Partial<Doc>): boolean {
  return (Object.keys(p) as (keyof Doc)[]).every(k => {
    if (k !== 'show') return p[k] === doc[k];
    const show = p.show!;
    return (Object.keys(show) as (keyof Doc['show'])[]).every(f => show[f] === doc.show[f]);
  });
}

/** The sheet as opened from storage: it is no parsed song any more. */
function opened(doc: Doc, file: string, format: 'file' | 'library'): Doc {
  return { ...doc, source: { file, format, track: '', trackCount: 0, simplified: false } };
}

/** The one place that applies a doc change: a new shift, instrument or recorder system clears fingering overrides. */
function changed(doc: Doc, patch: Partial<Doc>): Doc {
  const next = { ...doc, ...patch };
  if (next.shift !== doc.shift || next.inst !== doc.inst || next.recorderSystem !== doc.recorderSystem) next.fingering = {};
  return next;
}

export const useApp = create<AppState>()((set, get) => {
  /**
   * The one way a document change enters the store: the previous document goes onto the history,
   * unless the change extends the previous step (same coalescing key within COALESCE_MS).
   */
  function commit(next: Doc, coalesceKey?: string, extra: Partial<AppState> = {}): boolean {
    const { doc, past } = get();
    if (!doc || next === doc) { if (Object.keys(extra).length > 0) set(extra); return false; }
    const t = now();
    const extend = coalesceKey !== undefined && coalesceKey === lastKey && t - lastAt < COALESCE_MS && past.length > 0;
    lastKey = coalesceKey ?? null;
    lastAt = t;
    const pushed = extend ? past : [...past, doc].slice(-HISTORY_LIMIT);
    set({ ...extra, doc: next, past: pushed, future: [] });
    return true;
  }

  /** A sheet was opened or imported: history starts afresh. */
  const fresh = () => { endStep(); forgetUnsavedTempo(); return { past: [], future: [], sheetGen: get().sheetGen + 1 }; };

  return {
    instId: 'asax',
    prefs: DEFAULT_PREFS,
    song: null,
    doc: null,
    libraryId: null,
    savedSnapshot: null,
    saveError: null,
    past: [],
    future: [],
    sheetGen: 0,

    undo() {
      const { doc, past, future } = get();
      if (!doc || past.length === 0) return;
      const prev = past[past.length - 1];
      endStep();
      set({ doc: prev, instId: prev.inst, past: past.slice(0, -1), future: [...future, doc] });
    },

    redo() {
      const { doc, past, future } = get();
      if (!doc || future.length === 0) return;
      const next = future[future.length - 1];
      endStep();
      set({ doc: next, instId: next.inst, past: [...past, doc], future: future.slice(0, -1) });
    },

    applyEdit(next, coalesceKey) {
      return next !== null && commit(next, coalesceKey);
    },

    saveSheet() {
      const { doc, libraryId } = get();
      if (!doc) return false;
      const r = saveEntry(doc, libraryId);
      if (!r.ok) { set({ saveError: r.message }); return false; }
      if (libraryId === null) adoptUnsavedTempo(r.entry.id);
      set({ libraryId: r.entry.id, savedSnapshot: canonical(doc), saveError: null });
      return true;
    },

    openEntry(id) {
      const entry = getEntry(id);
      if (!entry) return false;
      const doc = opened(entry.doc, entry.title, 'library');
      remove('session', KEY_SONG);
      set({ ...fresh(), doc, instId: doc.inst, song: null, libraryId: entry.id, savedSnapshot: canonical(doc), saveError: null });
      return true;
    },

    openImported(imported, fileName) {
      const r = saveEntry(imported, null);
      if (!r.ok) {
        get().openUnsaved(imported, fileName);
        return { saved: false, message: r.message };
      }
      const doc = opened(r.entry.doc, fileName, 'file');
      remove('session', KEY_SONG);
      set({ ...fresh(), doc, instId: doc.inst, song: null, libraryId: r.entry.id, savedSnapshot: canonical(doc), saveError: null });
      return { saved: true };
    },

    openUnsaved(imported, fileName) {
      const doc = opened(imported, fileName, 'file');
      remove('session', KEY_SONG);
      remove('session', KEY_SHEET);
      set({ ...fresh(), doc, instId: doc.inst, song: null, libraryId: null, savedSnapshot: null, saveError: null });
    },

    forgetEntry(id) {
      if (get().libraryId !== id) return;
      remove('session', KEY_SHEET);
      set({ libraryId: null, savedSnapshot: null });
    },

    /** Links the open sheet to an entry again (undo of a delete): saved when the sheet equals the entry, else dirty. */
    relinkEntry(id) {
      const entry = getEntry(id);
      if (!entry) return;
      const { doc } = get();
      const snapshot = canonical(doc ? { ...entry.doc, source: doc.source } : entry.doc);
      set({ libraryId: entry.id, savedSnapshot: snapshot });
    },

    setInstrument(id) {
      writeJSON('local', KEY_INST, id);
      const { doc, prefs } = get();
      if (!doc || doc.inst === id) { set({ instId: id }); return; }
      commit(changed(doc, { inst: id, shift: bestShift(doc, id, prefs) }), undefined, { instId: id });
    },

    setPreferredInstrument(id) {
      writeJSON('local', KEY_INST, id);
      set({ instId: id });
    },

    setPrefs(p) {
      const prev = get();
      const prefs = { ...prev.prefs, ...p };
      writeJSON('local', KEY_PREFS, prefs);
      const { doc } = prev;
      const repicked = doc && doc.shift === bestShift(doc, doc.inst, prev.prefs) ? bestShift(doc, doc.inst, prefs) : null;
      if (doc && repicked !== null && repicked !== doc.shift) {
        commit(changed(doc, { shift: repicked }), undefined, { prefs });
      } else {
        set({ prefs });
      }
    },

    setSong(s) {
      if (s === null) remove('session', KEY_SONG);
      set({ song: s });
    },

    setDoc(d) {
      if (d === null) remove('session', KEY_DOC);
      remove('session', KEY_SHEET);
      set({ ...fresh(), doc: d, libraryId: null, savedSnapshot: null, saveError: null });
    },

    setShift(shift) {
      const { doc } = get();
      if (!doc || !Number.isFinite(shift)) return;
      const clamped = Math.max(-24, Math.min(24, Math.round(shift)));
      if (clamped === doc.shift) return;
      commit(changed(doc, { shift: clamped }));
    },

    patchDoc(p, coalesceKey) {
      const { doc } = get();
      if (doc && !samePatch(doc, p)) commit(changed(doc, p), coalesceKey);
    },

    setFingering(evId, index) {
      const { doc } = get();
      if (!doc || (index === null ? !(evId in doc.fingering) : doc.fingering[evId] === index)) return;
      const fingering = { ...doc.fingering };
      if (index === null) delete fingering[evId];
      else fingering[evId] = index;
      commit({ ...doc, fingering });
    },

    resetFingerings() {
      const { doc } = get();
      if (doc && Object.keys(doc.fingering).length > 0) commit({ ...doc, fingering: {} });
    },
  };
});

// Mirror song and doc to sessionStorage. A null value is not written here: it also appears
// when state is reset outside the actions, and the actions remove the keys themselves.
// A failed write (storage full) removes the key, so a reload never pairs a new doc with an old song.
const mirror = (key: string, value: unknown) => {
  if (!writeJSON('session', key, value)) remove('session', key);
};
useApp.subscribe((state, prev) => {
  if (state.song && state.song !== prev.song) mirror(KEY_SONG, state.song);
  if (state.doc && state.doc !== prev.doc) mirror(KEY_DOC, state.doc);
  if (state.libraryId && (state.libraryId !== prev.libraryId || state.savedSnapshot !== prev.savedSnapshot)) {
    mirror(KEY_SHEET, { libraryId: state.libraryId, savedSnapshot: state.savedSnapshot });
  }
});

/** A stored session document, validated like a sheet file; its source is kept as stored. Null when damaged. */
function sessionDoc(v: unknown): Doc | null {
  const doc = validateDoc(v);
  if (!doc) return null;
  const source = (v as { source?: unknown }).source;
  return typeof source === 'object' && source !== null ? { ...doc, source: source as Doc['source'] } : doc;
}

function isSong(v: unknown): v is ParsedSong {
  const s = v as ParsedSong | null;
  return !!s && typeof s === 'object' && Array.isArray(s.tracks) && Array.isArray(s.timeSig);
}

export function hydrate(): void {
  const storedInst = readJSON<InstId>('local', KEY_INST);
  const storedPrefs = readJSON<Partial<Prefs>>('local', KEY_PREFS);
  const song = readJSON<unknown>('session', KEY_SONG);
  const stored = readJSON<unknown>('session', KEY_DOC);
  const doc = stored === null ? null : sessionDoc(stored);
  if (stored !== null && !doc) { remove('session', KEY_DOC); remove('session', KEY_SHEET); }
  const sheet = readJSON<{ libraryId?: unknown; savedSnapshot?: unknown }>('session', KEY_SHEET);
  const patch: Partial<AppState> = {};
  if (storedInst && ORDER.includes(storedInst)) patch.instId = storedInst;
  if (storedPrefs && typeof storedPrefs === 'object') {
    patch.prefs = {
      easyRegister: typeof storedPrefs.easyRegister === 'boolean' ? storedPrefs.easyRegister : DEFAULT_PREFS.easyRegister,
      fewAccidentals: typeof storedPrefs.fewAccidentals === 'boolean' ? storedPrefs.fewAccidentals : DEFAULT_PREFS.fewAccidentals,
    };
  }
  if (isSong(song)) patch.song = song;
  if (doc) {
    patch.doc = doc; patch.instId = doc.inst;
    if (sheet && typeof sheet.libraryId === 'string' && typeof sheet.savedSnapshot === 'string') {
      patch.libraryId = sheet.libraryId; patch.savedSnapshot = sheet.savedSnapshot;
    }
  }
  useApp.setState(patch);
}
