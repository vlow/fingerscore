import { useId, useState, type ChangeEvent } from 'react';
import { ACCEPT, parseFile } from '../import';
import { ImportError, type ParsedSong } from '../import/types';
import s from './DropZone.module.css';

interface Props {
  /** Shown in "new songs become a sheet for your {instrument}". */
  instrumentName: string;
  onSong(song: ParsedSong): void;
  onContinue(): void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'parsing'; file: string }
  | { kind: 'ready'; file: string }
  | { kind: 'error'; message: string };

export function errorMessage(e: unknown, file: string): string {
  return e instanceof ImportError ? e.userMessage : `"${file}" could not be read.`;
}

export default function DropZone({ instrumentName, onSong, onContinue }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [drag, setDrag] = useState(false);
  const titleId = useId();
  const hintId = useId();

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setDrag(false);
    if (!file) return;
    setState({ kind: 'parsing', file: file.name });
    try {
      const song = await parseFile(file);
      onSong(song);
      setState({ kind: 'ready', file: file.name });
    } catch (err) {
      setState({ kind: 'error', message: errorMessage(err, file.name) });
    }
  }

  const reset = () => setState({ kind: 'idle' });

  return (
    <div
      className={s.zone}
      data-drag={drag || undefined}
      onDragEnter={() => setDrag(true)}
      onDragOver={() => setDrag(true)}
      onDragLeave={() => setDrag(false)}
      onDrop={() => setDrag(false)}
    >
      {state.kind === 'idle' && (
        <>
          <div className={s.content}>
            <div className={s.uploadIcon}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
              </svg>
            </div>
            <div id={titleId} className={s.title}>Drop a song here</div>
            <div id={hintId} className={s.hint}>
              or <span className={s.browse}>browse your computer</span> · new songs become a sheet for your {instrumentName}
            </div>
            <div className={s.chips}>
              <span className={s.chip}>MIDI .mid</span>
              <span className={s.chip}>MusicXML .musicxml .mxl</span>
            </div>
          </div>
          <input
            type="file" accept={ACCEPT} className={s.input}
            aria-labelledby={titleId} aria-describedby={hintId}
            onChange={onFile}
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
          <p className={s.result}>{state.file} — Ready — next you pick the part to play.</p>
          <div className={s.actions}>
            <button type="button" className={s.primary} onClick={onContinue}>Continue →</button>
            <button type="button" className={s.secondary} onClick={reset}>Choose another file</button>
          </div>
        </div>
      )}
      {state.kind === 'error' && (
        <div className={s.content} role="alert">
          <p className={s.error}>{state.message}</p>
          <button type="button" className={s.secondary} onClick={reset}>Try another file</button>
        </div>
      )}
    </div>
  );
}
