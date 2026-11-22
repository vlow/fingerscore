import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo } from '../domain/timeAgo';
import { deleteEntry, listEntries, restoreEntry } from '../state/library';
import { useApp } from '../state/store';
import { showToast } from './Toast';
import s from './Gallery.module.css';

const SHOWN = 4;

interface Props {
  /** Changes when the library was changed outside the gallery (a sheet dropped on the drop zone). */
  version?: number;
}

/** "Your sheets" on the start page (design 4.6). Hidden while the library is empty. */
export default function Gallery({ version = 0 }: Props) {
  const [changed, setChanged] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const headingId = useId();
  // The time-ago text is computed when the library is read: on mount and after each change.
  const { entries, now } = useMemo(() => ({ entries: listEntries(), now: new Date() }), [version, changed]);

  if (entries.length === 0) return null;

  function remove(id: string) {
    const entry = deleteEntry(id);
    setChanged(n => n + 1);
    if (!entry) return;
    // Edits keep doc.source; loading another sheet replaces it.
    const app = useApp.getState();
    const openSource = app.libraryId === id && app.doc ? app.doc.source : null;
    app.forgetEntry(id);
    const undo = () => {
      if (!restoreEntry(entry)) return;
      // Link the open sheet again only if it is still the one whose entry was deleted.
      const later = useApp.getState();
      if (openSource && later.libraryId === null && later.doc?.source === openSource) later.relinkEntry(id);
      setChanged(n => n + 1);
    };
    showToast({ message: `Deleted "${entry.title}"`, action: { label: 'Undo', run: undo } });
  }

  const shown = showAll ? entries : entries.slice(0, SHOWN);
  const count = `${entries.length} ${entries.length === 1 ? 'sheet' : 'sheets'}`;

  return (
    <section aria-labelledby={headingId} className={s.gallery}>
      <div className={s.header}>
        <h2 id={headingId} className={s.heading}>Your sheets</h2>
        <span className={s.count}>{count} · saved in this browser</span>
      </div>
      <ul className={s.grid}>
        {shown.map(e => (
          <li key={e.id} className={s.card}>
            <Link to={`/sheet?id=${encodeURIComponent(e.id)}`} className={s.open}>
              <svg className={s.staff} viewBox="0 0 100 25" preserveAspectRatio="none" aria-hidden="true">
                {[0.5, 6.5, 12.5, 18.5, 24.5].map(y => (
                  <line key={y} x1="0" x2="100" y1={y} y2={y} vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              <strong className={s.title}>{e.title}</strong>
              <span className={s.inst}>{e.inst}</span>
              <span className={s.ago}>Saved {timeAgo(e.savedAt, now)}</span>
            </Link>
            <button type="button" className={s.delete} aria-label={`Delete ${e.title}`} onClick={() => remove(e.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {!showAll && entries.length > SHOWN && (
        <button type="button" className={s.more} onClick={() => setShowAll(true)}>Show all {entries.length}</button>
      )}
    </section>
  );
}
