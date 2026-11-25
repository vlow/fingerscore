import { chunkLoader } from './chunkLoader';

export const ALT_LOAD_FAILED = 'The alternate fingerings could not be loaded. Click the pill to try again.';

/** The alternate-fingering popover is its own chunk, requested at the first click on a pill. */
export const useAltPopoverLoad = chunkLoader(() => import('../../ui/AltFingeringPopover').then(m => m.default));
