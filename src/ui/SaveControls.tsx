import type { SaveStatus } from '../state/store';
import s from './SaveControls.module.css';

const STATUS: Record<SaveStatus, string> = { new: 'Not saved yet', dirty: 'Unsaved changes', saved: 'Saved' };

interface Props { status: SaveStatus; error: string | null; onSave(): void }

/** Save status and the Save button (design 4.4). The button stays enabled in every status. */
export default function SaveControls({ status, error, onSave }: Props) {
  return (
    <div className={s.controls}>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <span role="status" className={s.status}>{STATUS[status]}</span>
      <button type="button" className={s.save} onClick={onSave}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" />
        </svg>
        Save
      </button>
    </div>
  );
}
