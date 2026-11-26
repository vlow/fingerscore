import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { incipit, INCIPIT_HEIGHT, INCIPIT_LINES, type IncipitNote } from '../domain/incipit';
import type { Family } from '../domain/instruments';
import { familyCounts, SORTS, viewEntries, type SortBy, type ViewOptions } from '../domain/libraryView';
import { importedMessage, importMessage, LIBRARY_FILE_NAME, readImport, serializeLibrary } from '../domain/persistence';
import { timeAgo } from '../domain/timeAgo';
import { routeIntent } from '../shell/routes';
import { deleteWithUndo } from '../state/deleteWithUndo';
import { addSheets, listEntries, saveEntry, type LibraryEntry } from '../state/library';
import { downloadText } from './download';
import RightsNotice from './RightsNotice';
import s from './Gallery.module.css';

/** The strip is one line of music: five bars, one sheet each. */
const BARS = 5;

interface Props {
  /** Changes when the library was changed outside the gallery (a sheet dropped on the drop zone). */
  version?: number;
  /** Where focus goes when the last sheet is deleted and the gallery disappears. */
  emptyFocus?(): HTMLElement | null;
  /** True shows the library view in place of the strip. */
  open?: boolean;
  onOpenChange?(open: boolean): void;
}

const sheetUrl = (id: string) => `/sheet?id=${encodeURIComponent(id)}`;
const playUrl = (id: string) => `${sheetUrl(id)}&mode=play`;

// Titles and instrument lines are cut with an ellipsis when they do not fit; their tooltip shows the whole text.
// In the strip the title's tooltip covers the whole bar link, so it also shows over the incipit.

/** The mini staff: a sheet's incipit, or an empty bar with a whole rest. */
function Staff({ notes }: { notes: IncipitNote[] | null }) {
  return (
    <svg className={s.staff} data-empty={notes === null || undefined} width="100%" height={INCIPIT_HEIGHT} aria-hidden="true">
      {INCIPIT_LINES.map(y => <line key={y} x1="0" x2="100%" y1={y} y2={y} />)}
      {notes === null && <rect x="50%" y={INCIPIT_LINES[1]} width="14" height="3.5" transform="translate(-7 0)" />}
      {notes?.map((n, k) => (
        <svg key={k} x={`${n.x}%`} y={n.y} overflow="visible">
          <ellipse rx="4" ry="3" transform="rotate(-20)" />
          <line x1={n.stemDown ? -3.5 : 3.5} x2={n.stemDown ? -3.5 : 3.5} y1="0" y2={n.stemDown ? 19 : -19} />
        </svg>
      ))}
    </svg>
  );
}

function Incipit({ entry }: { entry: LibraryEntry }) {
  const notes = useMemo(() => incipit(entry.doc, entry.id), [entry.doc, entry.id]);
  return <Staff notes={notes} />;
}

/** "Delete? [Delete] [Keep]" in place of a sheet's controls. Takes focus when it appears; Escape keeps the sheet. */
function ConfirmDelete({ title, onDelete, onKeep }: { title: string; onDelete(): void; onKeep(): void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <span
      role="group" aria-label={`Delete ${title}?`} className={s.confirm}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onKeep(); } }}
    >
      <span className={s.ask} aria-hidden="true">Delete?</span>
      <button ref={first} type="button" className={s.confirmDelete} onClick={onDelete}>Delete</button>
      <button type="button" className={s.keep} onClick={onKeep}>Keep</button>
    </span>
  );
}

interface ActionsProps {
  entry: LibraryEntry;
  confirming: boolean;
  binRef: Ref<HTMLButtonElement>;
  onAsk(): void;
  onKeep(): void;
  onDelete(): void;
}

/** Open · Play · delete. Delete asks first. */
function Actions({ entry, confirming, binRef, onAsk, onKeep, onDelete }: ActionsProps) {
  if (confirming) return <ConfirmDelete title={entry.title} onDelete={onDelete} onKeep={onKeep} />;
  return (
    <>
      <Link to={sheetUrl(entry.id)} {...routeIntent('/sheet')} className={s.openLink} aria-label={`Open ${entry.title}`}>Open</Link>
      <Link to={playUrl(entry.id)} {...routeIntent('/sheet')} className={s.playLink} aria-label={`Play ${entry.title}`} title="Open in Play mode">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
        Play
      </Link>
      <span className={s.spacer} />
      <button ref={binRef} type="button" className={s.bin} aria-label={`Delete ${entry.title}`} title="Delete" onClick={onAsk}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
        </svg>
      </button>
    </>
  );
}

/**
 * "Your sheets" on the start page (SPEC §4.4). Hidden while the library is empty.
 * The strip shows the five newest sheets as one line of music; "All N" turns the card into the library view.
 */
export default function Gallery({ version = 0, emptyFocus, open = false, onOpenChange }: Props) {
  const [changed, setChanged] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // What the last import in the library view added.
  const [note, setNote] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // A control that takes focus after the next render: a sheet's link (revealed or restored) or its delete button (kept).
  const [focus, setFocus] = useState<{ id: string; on: 'link' | 'bin' } | null>(null);
  const [query, setQuery] = useState('');
  const [fam, setFam] = useState<Family | null>(null);
  const [sort, setSort] = useState<SortBy>('recent');
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const bins = useRef(new Map<string, HTMLButtonElement>());
  const search = useRef<HTMLInputElement>(null);
  const allButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const headingId = useId();
  // The time-ago text is computed when the library is read: on mount and after each change.
  const { entries, now } = useMemo(() => ({ entries: listEntries(), now: new Date() }), [version, changed]);

  const libOpen = open && entries.length > 0;
  const counts = familyCounts(entries);
  // A family filter whose last sheet is gone no longer applies.
  const options: ViewOptions = { query, fam: fam !== null && counts.some(c => c.fam === fam) ? fam : null, sort };
  const shown = libOpen ? viewEntries(entries, options) : entries.slice(0, BARS);
  // Undo runs later, from the toast: it reads the view as it is then.
  const latest = useRef({ libOpen, options });
  latest.current = { libOpen, options };

  // A change from outside (a drop-zone import) is a successful library write: the storage alert is stale.
  useEffect(() => { setError(null); }, [version]);

  // Deleting the last sheet closes the library view.
  useEffect(() => {
    if (open && entries.length === 0) onOpenChange?.(false);
  }, [open, entries.length, onOpenChange]);

  // Opening the library view moves focus to its search field; closing it, back to "All N".
  const wasOpen = useRef(libOpen);
  useEffect(() => {
    if (wasOpen.current === libOpen) return;
    wasOpen.current = libOpen;
    (libOpen ? search.current : allButton.current)?.focus();
  }, [libOpen]);

  useEffect(() => {
    if (focus === null) return;
    (focus.on === 'link' ? links.current : bins.current).get(focus.id)?.focus();
    setFocus(null);
  }, [focus]);

  function resetView() {
    setQuery('');
    setFam(null);
  }

  function close() {
    resetView();
    setConfirmId(null);
    setNote('');
    onOpenChange?.(false);
  }

  function remove(id: string) {
    // The neighbour that keeps focus once this sheet is gone: the next one, else the previous one.
    const at = shown.findIndex(e => e.id === id);
    const neighbour = shown[at + 1] ?? shown[at - 1];
    setConfirmId(null);
    deleteWithUndo(id, {
      onChanged: () => setChanged(n => n + 1),
      // Focus moves before the toast appears; the toast returns focus here when it goes away.
      onDeleted: () => {
        setError(null);
        const target = neighbour ? links.current.get(neighbour.id) : emptyFocus?.();
        target?.focus();
      },
      // The restored sheet must be on screen to take focus: beyond the strip it opens the library view, and a
      // search or filter that hides it is cleared.
      onRestored: entry => {
        setError(null);
        const all = listEntries();
        const view = latest.current;
        if (view.libOpen) {
          if (!viewEntries(all, view.options).some(e => e.id === entry.id)) resetView();
        } else if (all.findIndex(e => e.id === entry.id) >= BARS) {
          resetView();
          onOpenChange?.(true);
        }
        setFocus({ id: entry.id, on: 'link' });
      },
      onFailed: setError,
    });
  }

  function exportAll() {
    downloadText(LIBRARY_FILE_NAME, serializeLibrary(listEntries()));
  }

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setNote('');
    const parsed = await readImport(file);
    if (!parsed.ok) { setError(importMessage(file.name, parsed.reason)); return; }
    if (parsed.kind === 'sheet') {
      const saved = saveEntry(parsed.doc, null);
      if (!saved.ok) { setError(saved.message); return; }
      setNote(`"${saved.entry.title}" added to your sheets`);
    } else {
      const added = addSheets(parsed.sheets);
      if (!added.ok) { setError(added.message); return; }
      setNote(importedMessage(added.entries.length, parsed.skipped));
    }
    setChanged(n => n + 1);
  }

  const alert = error && <p role="alert" className={s.error}>{error}</p>;
  if (entries.length === 0) return alert || null;

  const linkRef = (id: string) => (el: HTMLAnchorElement | null) => { if (el) links.current.set(id, el); else links.current.delete(id); };
  const actions = (e: LibraryEntry) => (
    <Actions
      entry={e} confirming={confirmId === e.id}
      binRef={el => { if (el) bins.current.set(e.id, el); else bins.current.delete(e.id); }}
      onAsk={() => setConfirmId(e.id)}
      onKeep={() => { setConfirmId(null); setFocus({ id: e.id, on: 'bin' }); }}
      onDelete={() => remove(e.id)}
    />
  );

  if (!libOpen) {
    const pads = Array.from({ length: BARS - shown.length }, (_, k) => k);
    return (
      <section aria-labelledby={headingId} className={s.card}>
        <div className={s.stripHead}>
          <h2 id={headingId} className={s.label}>Your sheets</h2>
          <button ref={allButton} type="button" className={s.textButton} onClick={() => onOpenChange?.(true)}>All {entries.length}</button>
        </div>
        {alert}
        <ul className={s.bars}>
          {shown.map(e => (
            <li key={e.id} className={s.bar}>
              <Link to={sheetUrl(e.id)} {...routeIntent('/sheet')} className={s.barOpen} title={e.title} ref={linkRef(e.id)}>
                <strong className={s.title}>{e.title}</strong>
                <Incipit entry={e} />
                <span className={s.meta} title={`${e.inst} · ${timeAgo(e.savedAt, now)}`}>{e.inst} · {timeAgo(e.savedAt, now)}</span>
              </Link>
              <div className={s.barActions}>{actions(e)}</div>
            </li>
          ))}
          {pads.map(k => (
            <li key={k} className={`${s.bar} ${s.pad}`} aria-hidden="true">
              <span className={s.title}>&nbsp;</span>
              <Staff notes={null} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const count = `${entries.length} ${entries.length === 1 ? 'sheet' : 'sheets'}`;
  const chips: { label: string; fam: Family | null }[] = [
    { label: `All ${entries.length}`, fam: null },
    ...counts.map(c => ({ label: `${c.fam} ${c.count}`, fam: c.fam })),
  ];

  return (
    <section aria-labelledby={headingId} className={`${s.card} ${s.library}`}>
      <div className={s.libHead}>
        <h2 id={headingId} className={s.libTitle}>Your sheets</h2>
        <span className={s.count}>{count} saved in this browser</span>
        <span className={s.spacer} />
        <label className={s.search}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search titles or instruments" aria-label="Search your sheets"
          />
        </label>
        <label className={s.sort}>
          Sort
          <select value={sort} onChange={e => setSort(e.target.value as SortBy)}>
            {SORTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <button type="button" className={s.textButton} onClick={close}>Close</button>
      </div>
      <div role="group" aria-label="Filter by instrument" className={s.chips}>
        {chips.map(c => (
          <button key={c.label} type="button" className={s.chip} aria-pressed={c.fam === options.fam} onClick={() => setFam(c.fam)}>
            {c.label}
          </button>
        ))}
      </div>
      {alert}
      <ul className={s.rows}>
        {shown.map(e => (
          <li key={e.id} className={s.row}>
            <span className={s.rowStaff}><Incipit entry={e} /></span>
            <Link to={sheetUrl(e.id)} className={s.rowTitle} title={e.title} ref={linkRef(e.id)}>{e.title}</Link>
            <span className={s.rowMeta} title={`${e.inst} · ${e.key}`}>{e.inst} · {e.key}</span>
            <span className={s.rowDate}>{timeAgo(e.savedAt, now)}</span>
            <span className={s.rowActions}>{actions(e)}</span>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className={s.none}>No sheets match your search.</p>}
      <div className={s.libFoot}>
        <span>Stored only in this browser.</span>
        <span role="status" className={s.note}>{note && `✓ ${note}`}</span>
        <span className={s.footActions}>
          <button type="button" className={s.footButton} onClick={exportAll}>Export all as JSON</button>
          <span aria-hidden="true">·</span>
          <button type="button" className={s.footButton} onClick={() => fileInput.current?.click()}>Import…</button>
          <input
            ref={fileInput} type="file" accept=".json,application/json" hidden tabIndex={-1}
            aria-label="Import sheets" onChange={e => void importFile(e)}
          />
        </span>
        <RightsNotice />
      </div>
    </section>
  );
}
