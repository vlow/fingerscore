import { create } from 'zustand';
import { inst, ORDER } from '../domain/instruments';
import { DEFAULT_PREFS, rankShifts, scoringPitches, type Prefs } from '../domain/transpose';
import type { Doc, InstId } from '../domain/types';
import type { ParsedSong } from '../import/types';
import { canonical } from '../domain/persistence';
import { getEntry, saveEntry } from './library';
import { readJSON, remove, writeJSON } from './storage';

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
  saveSheet(): boolean;
  openEntry(id: string): boolean;
  /** Adds an imported sheet to the library and opens it; when the save fails it opens the sheet unlinked. */
  openImported(doc: Doc, fileName: string): ImportResult;
  /** Opens an imported sheet without a library entry ("Not saved yet"). */
  openUnsaved(doc: Doc, fileName: string): void;
  forgetEntry(id: string): void;
  relinkEntry(id: string): void;
  setInstrument(id: InstId): void;
  setPrefs(p: Partial<Prefs>): void;
  setSong(s: ParsedSong | null): void;
  setDoc(d: Doc | null): void;
  setShift(shift: number): void;
  patchDoc(p: Partial<Pick<Doc, 'title' | 'subtitle' | 'tempo' | 'chartStyle' | 'recorderSystem' | 'show'>>): void;
  setFingering(evId: string, index: number | null): void;
  resetFingerings(): void;
}

function bestShift(doc: Doc, instId: InstId, prefs: Prefs): number {
  return rankShifts(scoringPitches(doc.score), inst(instId), doc.originalTonicPc, doc.originalMode, prefs)[0].shift;
}

export type SaveStatus = 'new' | 'dirty' | 'saved';
export type ImportResult = { saved: true } | { saved: false; message: string };

export function saveStatus(s: Pick<AppState, 'doc' | 'libraryId' | 'savedSnapshot'>): SaveStatus {
  if (!s.libraryId || !s.doc) return 'new';
  return canonical(s.doc) === s.savedSnapshot ? 'saved' : 'dirty';
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

export const useApp = create<AppState>()((set, get) => ({
  instId: 'asax',
  prefs: DEFAULT_PREFS,
  song: null,
  doc: null,
  libraryId: null,
  savedSnapshot: null,
  saveError: null,

  saveSheet() {
    const { doc, libraryId } = get();
    if (!doc) return false;
    const r = saveEntry(doc, libraryId);
    if (!r.ok) { set({ saveError: r.message }); return false; }
    set({ libraryId: r.entry.id, savedSnapshot: canonical(doc), saveError: null });
    return true;
  },

  openEntry(id) {
    const entry = getEntry(id);
    if (!entry) return false;
    const doc = opened(entry.doc, entry.title, 'library');
    remove('session', KEY_SONG);
    set({ doc, instId: doc.inst, song: null, libraryId: entry.id, savedSnapshot: canonical(doc), saveError: null });
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
    set({ doc, instId: doc.inst, song: null, libraryId: r.entry.id, savedSnapshot: canonical(doc), saveError: null });
    return { saved: true };
  },

  openUnsaved(imported, fileName) {
    const doc = opened(imported, fileName, 'file');
    remove('session', KEY_SONG);
    remove('session', KEY_SHEET);
    set({ doc, instId: doc.inst, song: null, libraryId: null, savedSnapshot: null, saveError: null });
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
    if (!doc) { set({ instId: id }); return; }
    set({ instId: id, doc: changed(doc, { inst: id, shift: bestShift(doc, id, prefs) }) });
  },

  setPrefs(p) {
    const prev = get();
    const prefs = { ...prev.prefs, ...p };
    writeJSON('local', KEY_PREFS, prefs);
    const { doc } = prev;
    if (doc && doc.shift === bestShift(doc, doc.inst, prev.prefs)) {
      set({ prefs, doc: changed(doc, { shift: bestShift(doc, doc.inst, prefs) }) });
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
    set({ doc: d, libraryId: null, savedSnapshot: null, saveError: null });
  },

  setShift(shift) {
    const { doc } = get();
    if (!doc || !Number.isFinite(shift)) return;
    const clamped = Math.max(-24, Math.min(24, Math.round(shift)));
    set({ doc: changed(doc, { shift: clamped }) });
  },

  patchDoc(p) {
    const { doc } = get();
    if (doc) set({ doc: changed(doc, p) });
  },

  setFingering(evId, index) {
    const { doc } = get();
    if (!doc) return;
    const fingering = { ...doc.fingering };
    if (index === null) delete fingering[evId];
    else fingering[evId] = index;
    set({ doc: { ...doc, fingering } });
  },

  resetFingerings() {
    const { doc } = get();
    if (doc) set({ doc: { ...doc, fingering: {} } });
  },
}));

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

function isDoc(v: unknown): v is Doc {
  const d = v as Doc | null;
  return !!d && typeof d === 'object' && Array.isArray(d.score) && ORDER.includes(d.inst) && typeof d.shift === 'number';
}

function isSong(v: unknown): v is ParsedSong {
  const s = v as ParsedSong | null;
  return !!s && typeof s === 'object' && Array.isArray(s.tracks) && Array.isArray(s.timeSig);
}

export function hydrate(): void {
  const storedInst = readJSON<InstId>('local', KEY_INST);
  const storedPrefs = readJSON<Partial<Prefs>>('local', KEY_PREFS);
  const song = readJSON<unknown>('session', KEY_SONG);
  const doc = readJSON<unknown>('session', KEY_DOC);
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
  if (isDoc(doc)) {
    patch.doc = doc; patch.instId = doc.inst;
    if (sheet && typeof sheet.libraryId === 'string' && typeof sheet.savedSnapshot === 'string') {
      patch.libraryId = sheet.libraryId; patch.savedSnapshot = sheet.savedSnapshot;
    }
  }
  useApp.setState(patch);
}
