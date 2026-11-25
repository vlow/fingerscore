import { useId, useState, type ChangeEvent, type DragEvent, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { importedMessage, importMessage, readImport } from '../domain/persistence';
import type { Doc } from '../domain/types';
import { ACCEPT, parseFile } from '../import';
import { ImportError, type ParsedSong } from '../import/types';
import { addSheets, saveEntry, type LibraryEntry } from '../state/library';
import RightsNotice from './RightsNotice';
import s from './DropZone.module.css';

interface Props {
  /** Shown in "new songs become a sheet for your {instrument}". */
  instrumentName: string;
  onSong(song: ParsedSong): void;
  onContinue(): void;
  /** A saved sheet or the sheets of a library export (.json) were added to the library. */
  onSheet?(): void;
  /** "Show library" after a library import. */
  onShowLibrary?(): void;
  /** A saved sheet (.json) could not be added to the library: open it as the current sheet instead. */
  onUnsavedSheet?(doc: Doc, fileName: string): void;
  /** The file input, present while the zone is idle. */
  inputRef?: Ref<HTMLInputElement>;
}

type State =
  | { kind: 'idle' }
  | { kind: 'parsing'; file: string }
  | { kind: 'ready'; file: string; dropped: string[] }
  | { kind: 'sheet'; entry: LibraryEntry }
  | { kind: 'library'; message: string }
  | { kind: 'unsaved'; title: string; message: string }
  | { kind: 'error'; message: string };

export function errorMessage(e: unknown, file: string): string {
  return e instanceof ImportError ? e.userMessage : `"${file}" could not be read.`;
}

const isSheetFile = (name: string) => name.toLowerCase().endsWith('.json');

type Added = { entry: LibraryEntry } | { library: string } | { doc: Doc; message: string } | { error: string };

/**
 * Reads a saved sheet or a library export and adds it to the library. A single sheet whose save fails comes back
 * with the storage message, to be opened unsaved; a library that cannot be stored is an error.
 */
async function addSheet(file: File): Promise<Added> {
  const parsed = await readImport(file);
  if (!parsed.ok) return { error: importMessage(file.name, parsed.reason) };
  if (parsed.kind === 'library') {
    const added = addSheets(parsed.sheets);
    return added.ok ? { library: importedMessage(added.entries.length, parsed.skipped) } : { error: added.message };
  }
  const saved = saveEntry(parsed.doc, null);
  return saved.ok ? { entry: saved.entry } : { doc: parsed.doc, message: saved.message };
}

export default function DropZone({ instrumentName, onSong, onContinue, onSheet, onShowLibrary, onUnsavedSheet, inputRef }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [drag, setDrag] = useState(false);
  const titleId = useId();
  const hintId = useId();

  async function readFile(file: File) {
    setState({ kind: 'parsing', file: file.name });
    if (isSheetFile(file.name)) {
      const r = await addSheet(file);
      if ('error' in r) { setState({ kind: 'error', message: r.error }); return; }
      if ('doc' in r) {
        onUnsavedSheet?.(r.doc, file.name);
        setState({ kind: 'unsaved', title: r.doc.title.trim() || 'Untitled sheet', message: r.message });
        return;
      }
      onSheet?.();
      setState('library' in r ? { kind: 'library', message: r.library } : { kind: 'sheet', entry: r.entry });
      return;
    }
    try {
      const song = await parseFile(file);
      onSong(song);
      setState({ kind: 'ready', file: file.name, dropped: song.dropped });
    } catch (err) {
      setState({ kind: 'error', message: errorMessage(err, file.name) });
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void readFile(file);
  }

  // Drops are handled here in every state, so a file dropped on a result never makes the browser open it.
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDrag(true);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file && state.kind !== 'parsing') void readFile(file);
  }

  const reset = () => setState({ kind: 'idle' });

  return (
    <div
      className={s.zone}
      data-drag={drag || undefined}
      data-testid="drop-zone"
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      {state.kind === 'idle' && (
        <>
          <div className={s.content}>
            <div className={s.uploadIcon}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
              </svg>
            </div>
            <div id={titleId} className={s.title}>Drop a song or a saved sheet here</div>
            <div id={hintId} className={s.hint}>
              or <span className={s.browse}>browse your computer</span> · new songs become a sheet for your {instrumentName}
            </div>
            <div className={s.chips}>
              <span className={s.chip}>MIDI .mid</span>
              <span className={s.chip}>MusicXML .musicxml .mxl</span>
              <span className={s.chip}>MuseScore .mscz</span>
              <span className={s.chip}>ABC .abc</span>
              <span className={`${s.chip} ${s.chipSheet}`}>Saved sheet .json</span>
            </div>
          </div>
          <input
            ref={inputRef} type="file" accept={ACCEPT} className={s.input}
            aria-labelledby={titleId} aria-describedby={hintId}
            onChange={onChange}
          />
        </>
      )}
      {state.kind === 'parsing' && (
        <div className={s.content} role="status">
          <div className={s.result}>Reading {state.file} …</div>
        </div>
      )}
      {state.kind === 'ready' && (
        <div className={s.content}>
          <div className={s.check}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className={s.result} role="status">{state.file} — Ready — next you pick the part to play.{state.dropped.map(d => ` ${d}`).join('')}</p>
          <div className={s.actions}>
            <button type="button" className={s.primary} data-primary="" onClick={onContinue}>Continue →</button>
            <button type="button" className={s.secondary} onClick={reset}>Choose another file</button>
          </div>
        </div>
      )}
      {state.kind === 'sheet' && (
        <div className={s.content}>
          <p className={s.result} role="status">✓ "{state.entry.title}" added to your sheets</p>
          <div className={s.actions}>
            <Link to={`/sheet?id=${encodeURIComponent(state.entry.id)}`} className={s.primary} data-primary="">Open sheet →</Link>
            <button type="button" className={s.secondary} onClick={reset}>Add another</button>
          </div>
        </div>
      )}
      {state.kind === 'library' && (
        <div className={s.content}>
          <p className={s.result} role="status">✓ {state.message}</p>
          <div className={s.actions}>
            <button type="button" className={s.primary} data-primary="" onClick={() => { reset(); onShowLibrary?.(); }}>Show library</button>
            <button type="button" className={s.secondary} onClick={reset}>Add another</button>
          </div>
        </div>
      )}
      {state.kind === 'unsaved' && (
        <div className={s.content}>
          <p className={s.result} role="status">✓ "{state.title}" opened — it could not be saved in this browser.</p>
          <div className={s.actions}>
            <Link to="/sheet" className={s.primary} data-primary="">Open sheet →</Link>
            <button type="button" className={s.secondary} onClick={reset}>Add another</button>
          </div>
          <p className={s.error} role="alert">{state.message}</p>
        </div>
      )}
      {state.kind === 'error' && (
        <div className={s.content} role="alert">
          <p className={s.error}>{state.message}</p>
          <button type="button" className={s.secondary} onClick={reset}>Try another file</button>
        </div>
      )}
      <RightsNotice className={s.notice} />
    </div>
  );
}
