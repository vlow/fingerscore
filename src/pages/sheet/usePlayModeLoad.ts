import { chunkLoader } from './chunkLoader';

export const PLAY_MODE_LOAD_FAILED = 'Play mode could not be loaded. Reload the page and try again.';

/**
 * Play mode is its own chunk, requested the first time it is opened. It is an overlay, so there is no placeholder to
 * show while the code is on its way: the page stays as it is, and `onReady` runs when the code has arrived.
 */
export const usePlayModeLoad = chunkLoader(() => import('../../ui/PlayMode').then(m => m.default));
