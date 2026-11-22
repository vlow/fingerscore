import { useEffect, useId, useRef, useState } from 'react';
import { clearChords, clearLyrics, editCount, fillLyrics, hasImported, restoreFromFile } from '../domain/editText';
import type { Doc } from '../domain/types';
import s from './BulkCard.module.css';

interface Props {
  doc: Doc;
  /** Fill lyrics starts here (or at the next note that can carry a syllable); without a selection at the first note. */
  selectedId: string | null;
  /** Each action is one history step. */
  onEdit(next: Doc | null): void;
}

/** Body of the "Lyrics & chords" card (design 4.4). The verse is not part of the sheet, so it keeps the browser's own undo. */
export default function BulkCard({ doc, selectedId, onEdit }: Props) {
  const [verse, setVerse] = useState('');
  const fieldId = useId();
  const edits = editCount(doc);
  const imported = hasImported(doc);
  const verseRef = useRef<HTMLTextAreaElement | null>(null);

  // Clear and Restore disable themselves once used; a focused button that did so hands the focus to the verse field.
  const watch = useRef(false);
  useEffect(() => {
    if (!watch.current) return;
    watch.current = false;
    const a = document.activeElement;
    if (a === null || a === document.body || (a instanceof HTMLButtonElement && a.disabled)) verseRef.current?.focus();
  });
  const run = (next: Doc | null) => { watch.current = true; onEdit(next); };

  return (
    <div className={s.body}>
      <label htmlFor={fieldId} className={s.label}>Type or paste a verse</label>
      <textarea ref={verseRef} id={fieldId} rows={4} className={s.verse} value={verse} data-native-undo="" onChange={e => setVerse(e.target.value)} />
      <div className={s.row}>
        <button type="button" className={s.primary} disabled={verse.trim() === ''}
          onClick={() => onEdit(fillLyrics(doc, verse, selectedId))}>Fill lyrics</button>
        <button type="button" className={s.button} disabled={clearLyrics(doc) === null} onClick={() => run(clearLyrics(doc))}>
          Clear lyrics
        </button>
        <button type="button" className={s.button} disabled={Object.keys(doc.chords).length === 0} onClick={() => run(clearChords(doc))}>
          Clear chords
        </button>
      </div>
      <div className={s.edits}>
        <span role="status">
          {!imported ? 'Nothing was imported with this sheet.' : edits === 1 ? '1 edit to lyrics and chords' : `${edits} edits to lyrics and chords`}
        </span>
        <button type="button" className={s.small} disabled={!imported || edits === 0} onClick={() => run(restoreFromFile(doc))}>
          Restore from file
        </button>
      </div>
    </div>
  );
}
