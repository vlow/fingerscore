import { useCallback, useState } from 'react';
import { lazyModule, useLazy } from '../../shell/lazy';

export const FINGERING_LOAD_FAILED = 'The fingering panel could not be loaded. Click the chart to try again.';

/**
 * The Fingering panel (design 4.3) is its own chunk, with the instrument drawings: requested at the first click on a
 * chart or on "Show on instrument", and shown once it has arrived.
 */
export const fingeringPanelModule = lazyModule(() => import('../../ui/fingering/FingeringPanel').then(m => m.default));

/** Open or closed, and the panel's code. Its open state is not stored: the panel opens from a chart. */
export function useFingeringPanel() {
  const [wanted, setWanted] = useState(false);
  const { value: Panel, failed, request } = useLazy(fingeringPanelModule);
  const open = useCallback(() => { setWanted(true); request(); }, [request]);
  const close = useCallback(() => setWanted(false), []);
  return { open: wanted && Panel !== null, Panel, failed, show: open, close };
}
