import { showToast } from '../ui/Toast';
import { deleteEntry, getEntry, restoreEntry, writeFailureMessage, type LibraryEntry } from './library';
import { useApp } from './store';

export interface DeleteOptions {
  /** The library changed: after the delete attempt, and after Undo put the entry back. */
  onChanged?(): void;
  /** The entry is gone; runs before the toast appears, so focus can be moved while the toast remembers it. */
  onDeleted?(entry: LibraryEntry): void;
  /** Undo put the entry back. */
  onRestored?(entry: LibraryEntry): void;
  /** A library write failed, on delete or on Undo. */
  onFailed?(message: string): void;
}

/**
 * Deletes a saved sheet and shows the toast "Deleted "{title}"" with Undo (design 4.6, call 7).
 * Deleting the open sheet's entry unlinks the open sheet; Undo links it again if it is still that sheet.
 * Returns false when nothing was deleted.
 */
export function deleteWithUndo(id: string, opts: DeleteOptions = {}): boolean {
  const entry = deleteEntry(id);
  opts.onChanged?.();
  if (!entry) {
    // Still listed means the write failed; an unknown id needs no message.
    if (getEntry(id)) opts.onFailed?.(writeFailureMessage());
    return false;
  }
  // Edits keep doc.source; loading another sheet replaces it.
  const app = useApp.getState();
  const openSource = app.libraryId === id && app.doc ? app.doc.source : null;
  app.forgetEntry(id);
  opts.onDeleted?.(entry);
  const undo = () => {
    if (!restoreEntry(entry)) { opts.onFailed?.(writeFailureMessage()); return; }
    const now = useApp.getState();
    if (openSource && now.libraryId === null && now.doc?.source === openSource) now.relinkEntry(id);
    opts.onChanged?.();
    opts.onRestored?.(entry);
  };
  showToast({ message: `Deleted "${entry.title}"`, action: { label: 'Undo', run: undo } });
  return true;
}
