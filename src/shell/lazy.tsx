import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { LoadBoundary } from '../ui/LoadBoundary';

/**
 * Code that loads on first use: a route's page, a panel, the PDF engine, a parser. One request at a time; a failed
 * request is forgotten, so the next `load` asks the network again (a dropped connection, a stale hash after a redeploy).
 */
export interface LazyModule<V> {
  load(): Promise<V>;
  /** The value once it has arrived, else null. */
  peek(): V | null;
  /** Starts the load and ignores a failure: the real load retries and reports it. */
  prefetch(): void;
}

export function lazyModule<V>(load: () => Promise<V>): LazyModule<V> {
  let value: V | null = null;
  let pending: Promise<V> | null = null;
  const m: LazyModule<V> = {
    load() {
      if (value !== null) return Promise.resolve(value);
      pending ??= load().then(
        v => { value = v; pending = null; return v; },
        e => { pending = null; throw e; },
      );
      return pending;
    },
    peek: () => value,
    prefetch() { m.load().catch(() => {}); },
  };
  return m;
}

/**
 * For code that arrives on request (play mode, the alternate-fingering popover). `request` loads it, or calls `onReady`
 * at once when it has arrived before; `onReady` runs when the code is there. If the code cannot arrive, `failed` is
 * true until the next request.
 */
export function useLazy<V>(m: LazyModule<V>, onReady?: () => void): { value: V | null; failed: boolean; request(): void } {
  const [failed, setFailed] = useState(false);
  const [, setArrived] = useState(0);
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
    if (m.peek() !== null) { ready.current?.(); return; }
    loading.current = true;
    m.load().then(
      () => { loading.current = false; if (mounted.current) { setArrived(n => n + 1); ready.current?.(); } },
      () => { loading.current = false; if (mounted.current) setFailed(true); },
    );
  }, [m]);

  return { value: m.peek(), failed, request };
}

/**
 * A component that is its own chunk. Once loaded it renders at once, without suspending; before that it suspends with
 * `fallback`, and a failed load shows the reload notice (compact: a small box for a part of a page).
 */
export function lazyView<P extends object>(
  m: LazyModule<ComponentType<P>>,
  opts: { compact?: boolean; fallback?: ReactNode } = {},
): ComponentType<P> {
  // JSX cannot spread a generic P onto a component typed by it; the props pass through unchanged.
  const Pending = lazy(() => m.load().then(c => ({ default: c as ComponentType<object> })));
  return function LazyView(props: P) {
    const Loaded = m.peek() as ComponentType<object> | null;
    if (Loaded) return <Loaded {...props} />;
    return (
      <LoadBoundary compact={opts.compact}>
        <Suspense fallback={opts.fallback ?? null}><Pending {...props} /></Suspense>
      </LoadBoundary>
    );
  };
}

export type IntentProps = { onPointerEnter(): void; onFocus(): void };

/** Handlers that start loading the modules when the pointer enters or focus arrives: the likely next click. */
export function intentProps(...ms: LazyModule<unknown>[]): IntentProps {
  const go = () => { for (const m of ms) m.prefetch(); };
  return { onPointerEnter: go, onFocus: go };
}
