import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { lazyModule, useLazy } from '../../shell/lazy';
// Its own stylesheet: the page bar loads with the page, the panel's styles only with the panel.
import s from './FingeringButton.module.css';

export const FINGERING_LOAD_FAILED = 'The fingering panel could not be loaded. Press Fingering or I to try again.';

/** Keys typed here are text: I does not toggle the panel. */
const TEXT_FIELDS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * The Fingering panel (design 4.3, 4.4) is its own chunk, with the instrument drawings: requested the first time it
 * opens, and shown once it has arrived.
 */
export const fingeringPanelModule = lazyModule(() => import('./FingeringPanel').then(m => m.default));

/** Open or closed, and the panel's code. Its open state is not stored: the panel opens from a chart or the button. */
export function useFingeringPanel() {
  const [wanted, setWanted] = useState(false);
  const { value: Panel, failed, request } = useLazy(fingeringPanelModule);
  const show = useCallback(() => { setWanted(true); request(); }, [request]);
  const close = useCallback(() => setWanted(false), []);
  return { open: wanted && Panel !== null, wanted, Panel, failed, show, close };
}

/**
 * I toggles the panel from anywhere on the page but a text field (design 4.6), while `active`: the page is not covered
 * by Play mode. Holds the latest toggle, so the listener is added once.
 */
export function useFingeringKey(active: boolean, onToggle: () => void) {
  const live = useRef({ active, onToggle });
  live.current = { active, onToggle };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'i' && e.key !== 'I') || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!live.current.active || (e.target instanceof Element && e.target.closest(TEXT_FIELDS))) return;
      e.preventDefault();
      live.current.onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** "Fingering" in the page bar: opens or closes the panel; I does the same. */
export const FingeringButton = forwardRef<HTMLButtonElement, { open: boolean; onToggle(): void }>(function FingeringButton(p, ref) {
  return (
    <button ref={ref} type="button" className={s.toggle} aria-expanded={p.open} aria-keyshortcuts="I"
      title="Show the fingering on the instrument (I)" onClick={p.onToggle}>
      Fingering
    </button>
  );
});
