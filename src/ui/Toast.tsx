import { useEffect, useSyncExternalStore } from 'react';
import s from './Toast.module.css';

interface ToastAction { label: string; run(): void }
interface Toast { id: number; message: string; action?: ToastAction }

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

export function showToast(t: { message: string; action?: ToastAction; ms?: number }): void {
  const toast = { id: nextId++, message: t.message, action: t.action };
  set(toast);
  timer = setTimeout(() => { if (current === toast) set(null); }, t.ms ?? 6000);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Mounted once in App. The live region stays in the page so each new message is announced. */
export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current);
  useEffect(() => () => set(null), []);
  return (
    <div role="status" className={s.host} data-print-hide="">
      {toast && (
        <div key={toast.id} className={s.toast}>
          <span className={s.message}>{toast.message}</span>
          {toast.action && (
            <button type="button" className={s.action} onClick={() => { const run = toast.action!.run; set(null); run(); }}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
