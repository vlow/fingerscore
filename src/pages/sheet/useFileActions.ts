import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { Player } from '../../audio/player';
import { fileName, importMessage, readSheet, serializeFile } from '../../domain/persistence';
import type { Doc } from '../../domain/types';
import { deleteWithUndo } from '../../state/deleteWithUndo';
import { listEntries } from '../../state/library';
import { saveStatus, useApp } from '../../state/store';
import { requestSheetPdf } from '../../pdf/request';
import { downloadText } from '../../ui/download';
import { usePdfJob } from '../../ui/usePdfJob';

const MISSING = 'That sheet is no longer saved in this browser.';

/** The page bar's file actions: save, print, download as PDF or JSON, open a file or a saved sheet, delete, and the error line. */
export function useFileActions(doc: Doc, playerRef: RefObject<Player | null>, announce: (line: string) => void) {
  const libraryId = useApp(st => st.libraryId);
  const savedSnapshot = useApp(st => st.savedSnapshot);

  function print() {
    playerRef.current?.stop();
    window.print();
  }

  const pdf = usePdfJob();
  // Opening or importing another sheet stops a PDF of the old one. The job reports nothing after that.
  const sheetGen = useApp(st => st.sheetGen);
  const abortPdf = pdf.abort;
  useEffect(() => abortPdf, [sheetGen, abortPdf]);
  async function downloadPdf() {
    playerRef.current?.stop();
    setFileError(null);
    const done = await pdf.start(o => requestSheetPdf(doc, o), announce);
    if (done?.error) setFileError(done.error);
  }

  // Saving and files (design 4.4). fileError is the line under the page bar; the next successful action clears it.
  const status = useMemo(() => saveStatus({ doc, libraryId, savedSnapshot }), [doc, libraryId, savedSnapshot]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [libraryChanged, setLibraryChanged] = useState(0);
  // The menu reads the library each time it opens, and again after a save, open, delete or undo here.
  const entries = useMemo(() => listEntries(), [libraryId, savedSnapshot, libraryChanged]);

  const save = useCallback(() => {
    if (useApp.getState().saveSheet()) setFileError(null);
  }, []);

  function download() {
    downloadText(fileName(doc.title), serializeFile(doc));
    setFileError(null);
  }

  async function openFile(file: File) {
    const r = await readSheet(file);
    if (!r.ok) { setFileError(importMessage(file.name, r.reason)); return; }
    const opened = useApp.getState().openImported(r.doc, file.name);
    setFileError(opened.saved ? null : opened.message);
  }

  function openSaved(id: string) {
    if (useApp.getState().openEntry(id)) { setFileError(null); return; }
    setFileError(MISSING);
    setLibraryChanged(n => n + 1);
  }

  function deleteSaved(id: string) {
    deleteWithUndo(id, {
      onChanged: () => setLibraryChanged(n => n + 1),
      onDeleted: () => setFileError(null),
      onFailed: setFileError,
    });
  }

  return { libraryId, status, fileError, entries, setLibraryChanged, save, print, pdfBusy: pdf.busy, downloadPdf, download, openFile, openSaved, deleteSaved };
}
