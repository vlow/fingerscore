import { create } from 'zustand';
import { inst, ORDER } from '../domain/instruments';
import { DEFAULT_PREFS, rankShifts, scoringPitches, type Prefs } from '../domain/transpose';
import type { Doc, InstId } from '../domain/types';
import type { ParsedSong } from '../import/types';
import { readJSON, remove, writeJSON } from './storage';

const KEY_INST = 'fingerscore.inst';
const KEY_PREFS = 'fingerscore.prefs';
const KEY_SONG = 'fingerscore.song';
const KEY_DOC = 'fingerscore.doc';

export interface AppState {
  instId: InstId; prefs: Prefs; song: ParsedSong | null; doc: Doc | null;
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

export const useApp = create<AppState>()((set, get) => ({
  instId: 'asax',
  prefs: DEFAULT_PREFS,
  song: null,
  doc: null,

  setInstrument(id) {
    writeJSON('local', KEY_INST, id);
    const { doc, prefs } = get();
    if (!doc) { set({ instId: id }); return; }
    set({ instId: id, doc: { ...doc, inst: id, shift: bestShift(doc, id, prefs), fingering: {} } });
  },

  setPrefs(p) {
    const prev = get();
    const prefs = { ...prev.prefs, ...p };
    writeJSON('local', KEY_PREFS, prefs);
    const { doc } = prev;
    if (doc && doc.shift === bestShift(doc, doc.inst, prev.prefs)) {
      set({ prefs, doc: { ...doc, shift: bestShift(doc, doc.inst, prefs) } });
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
    set({ doc: d });
  },

  setShift(shift) {
    const { doc } = get();
    if (!doc || !Number.isFinite(shift)) return;
    const clamped = Math.max(-24, Math.min(24, Math.round(shift)));
    set({ doc: { ...doc, shift: clamped, fingering: {} } });
  },

  patchDoc(p) {
    const { doc } = get();
    if (doc) set({ doc: { ...doc, ...p } });
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
  const patch: Partial<AppState> = {};
  if (storedInst && ORDER.includes(storedInst)) patch.instId = storedInst;
  if (storedPrefs && typeof storedPrefs === 'object') {
    patch.prefs = {
      easyRegister: typeof storedPrefs.easyRegister === 'boolean' ? storedPrefs.easyRegister : DEFAULT_PREFS.easyRegister,
      fewAccidentals: typeof storedPrefs.fewAccidentals === 'boolean' ? storedPrefs.fewAccidentals : DEFAULT_PREFS.fewAccidentals,
    };
  }
  if (isSong(song)) patch.song = song;
  if (isDoc(doc)) { patch.doc = doc; patch.instId = doc.inst; }
  useApp.setState(patch);
}
