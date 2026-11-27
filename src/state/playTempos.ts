import { readJSON, writeJSON } from '../shell/storage';

const KEY = 'fingerscore.playtempo';

// Play mode's tempo per sheet (BPM), kept on this device and never in the sheet: Play mode does not change a sheet.
// Saved sheets are keyed by their library id. A sheet that is not saved yet has no id; its tempo lives here, in
// memory, until it is saved or another sheet opens. Callers clamp what they read to the sheet's range.
let unsaved: number | null = null;

function readAll(): Record<string, number> {
  const raw = readJSON<unknown>('local', KEY);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
}

/** The stored tempo of a sheet; `null` id is the open unsaved sheet. Null when there is none. */
export function readPlayTempo(id: string | null): number | null {
  if (id === null) return unsaved;
  return readAll()[id] ?? null;
}

/** Stores a sheet's tempo. Tempos of sheets that are no longer in the library (`known`) go with the write. */
export function writePlayTempo(id: string | null, bpm: number, known: ReadonlySet<string>): void {
  if (id === null) { unsaved = bpm; return; }
  const kept = Object.entries(readAll()).filter(([k]) => known.has(k) && k !== id);
  writeJSON('local', KEY, { ...Object.fromEntries(kept), [id]: bpm });
}

/** The unsaved sheet was saved under `id`: its tempo goes with it. */
export function adoptUnsavedTempo(id: string): void {
  if (unsaved === null) return;
  writeJSON('local', KEY, { ...readAll(), [id]: unsaved });
  unsaved = null;
}

/** Another sheet opened: the unsaved sheet's tempo is gone. */
export function forgetUnsavedTempo(): void {
  unsaved = null;
}
