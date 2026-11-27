import { useEffect, useRef } from 'react';
import { isApple } from './shortcuts';
import s from './UndoRedo.module.css';

interface Props {
  canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void;
  /** Neither button can take the focus that one of them lost by becoming disabled. */
  onFocusLost(): void;
}

/** ↶ ↷ in the page bar (design 4.6): 44 × 44, disabled at 40% opacity, the shortcut in the tooltip. */
export function UndoRedo(p: Props): JSX.Element {
  const mod = isApple() ? '⌘' : 'Ctrl';
  const undoRef = useRef<HTMLButtonElement | null>(null);
  const redoRef = useRef<HTMLButtonElement | null>(null);
  const lost = p.onFocusLost;

  // A focused button that became disabled (nothing left to undo or redo) hands the focus to the other one, else away.
  const focused = useRef<'undo' | 'redo' | null>(null);
  useEffect(() => {
    const which = focused.current;
    if (which === null) return;
    const [own, other] = which === 'undo' ? [undoRef.current, redoRef.current] : [redoRef.current, undoRef.current];
    const a = document.activeElement;
    if (!own?.disabled || (a !== own && a !== null && a !== document.body)) return;
    focused.current = null;
    if (other && !other.disabled) other.focus();
    else lost();
  }, [p.canUndo, p.canRedo, lost]);
  const watch = (which: 'undo' | 'redo') => ({
    onFocus: () => { focused.current = which; },
    onBlur: (e: { target: HTMLButtonElement }) => { if (!e.target.disabled) focused.current = null; },
  });

  return (
    <div role="group" aria-label="History" className={s.group}>
      <button ref={undoRef} type="button" className={s.button} aria-label="Undo" title={`Undo (${mod}+Z)`}
        aria-keyshortcuts="Control+Z Meta+Z" disabled={!p.canUndo} onClick={p.onUndo} {...watch('undo')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" />
        </svg>
      </button>
      <button ref={redoRef} type="button" className={s.button} aria-label="Redo" title={`Redo (${mod}+Shift+Z)`}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" disabled={!p.canRedo} onClick={p.onRedo} {...watch('redo')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" />
        </svg>
      </button>
    </div>
  );
}
