import { useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import s from './Toast.module.css';

interface ToastAction { label: string; run(): void }
interface Toast { id: number; message: string; action?: ToastAction; ms: number }

// One toast at a time, shared by every page: a new toast replaces the current one.
let current: Toast | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(t: Toast | null) {
  clearTimeout(timer);
  current = t;
  listeners.forEach(l => l());
}

/** (Re)starts the current toast's full duration. */
function startTimer() {
  clearTimeout(timer);
  const t = current;
  if (t) timer = setTimeout(() => { if (current === t) set(null); }, t.ms);
}

export function showToast(t: { message: string; action?: ToastAction; ms?: number }): void {
  set({ id: nextId++, message: t.message, action: t.action, ms: t.ms ?? 6000 });
  startTimer();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/**
 * One toast. Its timer runs from the moment it appears and pauses only while the pointer is over it;
 * it restarts with the full duration when the pointer leaves. Focus does not pause it. A toast with an
 * action takes focus on its action button and gives focus back when it goes away; Esc dismisses it
 * without running the action.
 */
function ToastView({ toast }: { toast: Toast }) {
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Layout effect: its cleanup runs while the toast is still in the page, so it can see where focus is.
  useLayoutEffect(() => {
    if (!toast.action) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    buttonRef.current?.focus();
    const box = ref.current;
    return () => {
      if (box?.contains(document.activeElement) && before?.isConnected) before.focus();
    };
  }, [toast]);

  function hover(over: boolean) {
    if (current !== toast) return;
    if (over) clearTimeout(timer);
    else startTimer();
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    set(null);
  }

  return (
    <div ref={ref} className={s.toast} onKeyDown={onKey}
      onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <span className={s.message}>{toast.message}</span>
      {toast.action && (
        <button ref={buttonRef} type="button" className={s.action} onClick={() => { const run = toast.action!.run; set(null); run(); }}>
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

/** Mounted once in App. The live region stays in the page so each new message is announced. */
export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current);
  useLayoutEffect(() => () => set(null), []);
  return (
    <div role="status" className={s.host} data-print-hide="">
      {toast && <ToastView key={toast.id} toast={toast} />}
    </div>
  );
}
