import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A hook for a component that is its own chunk, requested the first time it is needed (play mode, the alternate-fingering
 * popover). `request` loads it, or calls `onReady` at once when it has arrived before; `onReady` runs when the code is
 * there. If the code cannot arrive, `failed` is true until the next request.
 */
export function chunkLoader<V>(load: () => Promise<V>) {
  let loaded: V | null = null;
  return function useChunk(onReady: () => void): { View: V | null; failed: boolean; request: () => void } {
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
      load().then(
        v => { loaded = v; loading.current = false; if (mounted.current) ready.current(); },
        () => { loading.current = false; if (mounted.current) setFailed(true); },
      );
    }, []);

    return { View: loaded, failed, request };
  };
}
