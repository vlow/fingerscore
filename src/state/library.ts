import { displayName, inst, type Family } from '../domain/instruments';
import { keyName, mod12 } from '../domain/keys';
import { validateDoc, type ImportedSheet } from '../domain/persistence';
import type { Doc } from '../domain/types';
import { probe, readJSON, writeJSON } from '../shell/storage';

/** `inst` is the instrument's display name, `key` the written key ("G major"), `fam` the instrument family. */
export interface LibraryEntry { id: string; title: string; inst: string; key: string; fam: Family; savedAt: string; doc: Doc }
export type SaveResult = { ok: true; entry: LibraryEntry } | { ok: false; message: string };
export type AddResult = { ok: true; entries: LibraryEntry[] } | { ok: false; message: string };

export const BLOCKED_MESSAGE = 'This browser blocks local storage. Use "Download JSON" instead.';
export const FULL_MESSAGE = "Couldn't save — the browser storage may be full.";
export const INCONSISTENT_MESSAGE = "This sheet can't be saved: its data is inconsistent.";

const KEY = 'fingerscore.library.v1';
const PROBE_KEY = 'fingerscore.library.probe';

function newId(now: Date): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** What the library lists about a document. Always computed from the document, so it cannot go stale. */
function describe(doc: Doc): Pick<LibraryEntry, 'title' | 'inst' | 'key' | 'fam'> {
  const i = inst(doc.inst);
  return {
    title: doc.title.trim() || 'Untitled sheet',
    inst: displayName(i),
    key: keyName(mod12(doc.originalTonicPc + doc.shift + i.off), doc.originalMode),
    fam: i.group,
  };
}

function toEntry(raw: unknown): LibraryEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.title !== 'string' || typeof e.savedAt !== 'string') return null;
  const doc = validateDoc(e.doc);
  return doc ? { ...describe(doc), id: e.id, title: e.title, savedAt: e.savedAt, doc } : null;
}

/** Newest first. Invalid entries are skipped; corrupt or blocked storage gives an empty list. */
export function listEntries(): LibraryEntry[] {
  const raw = readJSON<unknown>('local', KEY);
  if (!Array.isArray(raw)) return [];
  const entries: LibraryEntry[] = [];
  for (const item of raw) {
    const e = toEntry(item);
    if (e) entries.push(e);
  }
  return entries;
}

export function getEntry(id: string): LibraryEntry | null {
  return listEntries().find(e => e.id === id) ?? null;
}

export function saveEntry(doc: Doc, id: string | null, now: Date = new Date()): SaveResult {
  // Never write an entry that listEntries would skip on the next read.
  if (!validateDoc(JSON.parse(JSON.stringify(doc)))) return { ok: false, message: INCONSISTENT_MESSAGE };
  if (!probe('local', PROBE_KEY)) return { ok: false, message: BLOCKED_MESSAGE };
  const all = listEntries();
  const known = id !== null && all.some(e => e.id === id);
  const entry: LibraryEntry = { ...describe(doc), id: known ? id : newId(now), savedAt: now.toISOString(), doc };
  const next = [entry, ...all.filter(e => e.id !== entry.id)];
  return writeJSON('local', KEY, next) ? { ok: true, entry } : { ok: false, message: FULL_MESSAGE };
}

/**
 * Adds the sheets of a library export in one write, each under a new id. A sheet keeps the time it was saved
 * unless the file gives none or one in the future; the list stays newest first. All sheets are added or none.
 */
export function addSheets(sheets: ImportedSheet[], now: Date = new Date()): AddResult {
  if (!probe('local', PROBE_KEY)) return { ok: false, message: BLOCKED_MESSAGE };
  const all = listEntries();
  const taken = new Set(all.map(e => e.id));
  const added = sheets.map(({ doc, savedAt }): LibraryEntry => {
    let id = newId(now);
    while (taken.has(id)) id = newId(now);
    taken.add(id);
    const at = savedAt === null ? now : new Date(savedAt);
    return { ...describe(doc), id, savedAt: (at > now ? now : at).toISOString(), doc };
  });
  // The sort is stable: sheets saved at the same time keep the file's order, ahead of the entries already stored.
  const next = [...added, ...all].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  return writeJSON('local', KEY, next) ? { ok: true, entries: added } : { ok: false, message: FULL_MESSAGE };
}

/** Returns the removed entry so the caller can offer undo; null when the id is unknown or the write fails. */
export function deleteEntry(id: string): LibraryEntry | null {
  const all = listEntries();
  const removed = all.find(e => e.id === id);
  if (!removed) return null;
  return writeJSON('local', KEY, all.filter(e => e.id !== id)) ? removed : null;
}

/** The message for a library write that just failed: blocked storage, else full storage. */
export function writeFailureMessage(): string {
  return probe('local', PROBE_KEY) ? FULL_MESSAGE : BLOCKED_MESSAGE;
}

/** Puts an entry back, ordered by savedAt (newest first). */
export function restoreEntry(entry: LibraryEntry): boolean {
  const all = listEntries().filter(e => e.id !== entry.id);
  const at = all.findIndex(e => e.savedAt < entry.savedAt);
  all.splice(at === -1 ? all.length : at, 0, entry);
  return writeJSON('local', KEY, all);
}
