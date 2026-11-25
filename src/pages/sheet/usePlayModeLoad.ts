import { useCallback, useEffect, useRef, useState } from 'react';

type PlayModeView = typeof import('../../ui/PlayMode').default;

export const PLAY_MODE_LOAD_FAILED = 'Play mode could not be loaded. Reload the page and try again.';

/** Set once the code has arrived; the sheet page renders play mode only after that. */
let loaded: PlayModeView | null = null;

/**
 * Play mode is its own chunk, requested the first time it is opened. It is an overlay, so there is no placeholder to
 * show while the code is on its way: the page stays as it is, and `onReady` runs when the code has arrived. If it
 * cannot arrive, `failed` is true until the next request.
 */
export function usePlayModeLoad(onReady: () => void): { View: PlayModeView | null; failed: boolean; request: () => void } {
  const [failed, setFailed] = useState(false);
  const ready = useRef(onReady);
  ready.current = onReady;
  const loading = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const request = useCallback(() => {
    if (loading.current) return;
    setFailed(false);
    if (loaded) { ready.current(); return; }
    loading.current = true;
    import('../../ui/PlayMode').then(
      m => { loaded = m.default; loading.current = false; if (mounted.current) ready.current(); },
      () => { loading.current = false; if (mounted.current) setFailed(true); },
    );
  }, []);

  return { View: loaded, failed, request };
}
