import { lazyModule, useLazy } from '../../shell/lazy';

export const ALT_LOAD_FAILED = 'The alternate fingerings could not be loaded. Click the pill to try again.';

/** The alternate-fingering popover is its own chunk, requested at the first click on a pill. */
export const altPopoverModule = lazyModule(() => import('../../ui/AltFingeringPopover').then(m => m.default));

export const useAltPopoverLoad = (onReady: () => void) => useLazy(altPopoverModule, onReady);
