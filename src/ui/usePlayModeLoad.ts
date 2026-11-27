import { lazyModule, useLazy } from '../shell/lazy';

export const PLAY_MODE_LOAD_FAILED = 'Play mode could not be loaded. Reload the page and try again.';

/**
 * Play mode is its own chunk, requested the first time it is opened. It is an overlay, so there is no placeholder to
 * show while the code is on its way: the page stays as it is, and `onReady` runs when the code has arrived.
 */
export const playModeModule = lazyModule(() => import('./PlayMode').then(m => m.default));

export const usePlayModeLoad = (onReady: () => void) => useLazy(playModeModule, onReady);
