import s from './UndoRedo.module.css';

/** Apple keyboards name the modifier ⌘; everyone else Ctrl. */
function modifier(): string {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const platform = (nav as (Navigator & { userAgentData?: { platform?: string } }) | null)?.userAgentData?.platform ?? nav?.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl';
}

interface Props { canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void }

/** ↶ ↷ in the page bar (design 4.6): 44 × 44, disabled at 40% opacity, the shortcut in the tooltip. */
export function UndoRedo(p: Props): JSX.Element {
  const mod = modifier();
  return (
    <div role="group" aria-label="History" className={s.group}>
      <button type="button" className={s.button} aria-label="Undo" title={`Undo (${mod}+Z)`} disabled={!p.canUndo} onClick={p.onUndo}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" />
        </svg>
      </button>
      <button type="button" className={s.button} aria-label="Redo" title={`Redo (${mod}+Shift+Z)`} disabled={!p.canRedo} onClick={p.onRedo}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" />
        </svg>
      </button>
    </div>
  );
}
