import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo } from '../domain/timeAgo';
import { deleteWithUndo } from '../state/deleteWithUndo';
import { listEntries } from '../state/library';
import s from './Gallery.module.css';

const SHOWN = 4;

interface Props {
  /** Changes when the library was changed outside the gallery (a sheet dropped on the drop zone). */
  version?: number;
  /** Where focus goes when the last sheet is deleted and the gallery disappears. */
  emptyFocus?(): HTMLElement | null;
}

/** "Your sheets" on the start page (design 4.6). Hidden while the library is empty. */
export default function Gallery({ version = 0, emptyFocus }: Props) {
  const [changed, setChanged] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A card whose link takes focus after the next render (a revealed or restored card).
  const [focusId, setFocusId] = useState<string | null>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const headingId = useId();
  // The time-ago text is computed when the library is read: on mount and after each change.
  const { entries, now } = useMemo(() => ({ entries: listEntries(), now: new Date() }), [version, changed]);

  // A change from outside (a drop-zone import) is a successful library write: the storage alert is stale.
  useEffect(() => { setError(null); }, [version]);

  useEffect(() => {
    if (focusId === null) return;
    links.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const shown = showAll ? entries : entries.slice(0, SHOWN);

  function remove(id: string) {
    // The neighbour that keeps focus once this card is gone: the next card, else the previous one.
    const at = shown.findIndex(e => e.id === id);
    const neighbour = shown[at + 1] ?? shown[at - 1];
    deleteWithUndo(id, {
      onChanged: () => setChanged(n => n + 1),
      // Focus moves before the toast appears; the toast returns focus here when it goes away.
      onDeleted: () => {
        setError(null);
        const target = neighbour ? links.current.get(neighbour.id) : emptyFocus?.();
        target?.focus();
      },
      onRestored: entry => {
        setError(null);
        if (listEntries().findIndex(e => e.id === entry.id) >= SHOWN) setShowAll(true);
        setFocusId(entry.id);
      },
      onFailed: setError,
    });
  }

  function revealAll() {
    setShowAll(true);
    setFocusId(entries[SHOWN].id);
  }

  const alert = error && <p role="alert" className={s.error}>{error}</p>;
  if (entries.length === 0) return alert || null;

  const count = `${entries.length} ${entries.length === 1 ? 'sheet' : 'sheets'}`;

  return (
    <section aria-labelledby={headingId} className={s.gallery}>
      <div className={s.header}>
        <h2 id={headingId} className={s.heading}>Your sheets</h2>
        <span className={s.count}>{count} · saved in this browser</span>
      </div>
      {alert}
      <ul className={s.grid}>
        {shown.map(e => (
          <li key={e.id} className={s.card}>
            <Link
              to={`/sheet?id=${encodeURIComponent(e.id)}`} className={s.open}
              ref={el => { if (el) links.current.set(e.id, el); else links.current.delete(e.id); }}
            >
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
        <button type="button" className={s.more} onClick={revealAll}>Show all {entries.length}</button>
      )}
    </section>
  );
}
