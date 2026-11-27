import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { readText, writeText } from '../../shell/storage';
import type { Mode } from '../../ui/ModeSwitch';
import { rowFor, type KeyPlace } from '../../ui/shortcuts';

/** Open or closed survives a visit, so a learner keeps the list open. */
export const PANEL_KEY = 'fingerscore.keysPanel';
/** How long a row stays lit after its key was pressed. */
export const FLASH_MS = 900;
/** Keys typed here are text: ? does not toggle the list. */
const TEXT_FIELDS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * True on a device with a keyboard: a fine pointer, or once any key was pressed (an iPad with a keyboard).
 * The Keys button and the key hints show only then.
 */
export function useHasKeyboard(): boolean {
  const [has, setHas] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches);
  useEffect(() => {
    if (has) return;
    const onKey = () => setHas(true);
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [has]);
  return has;
}

/** Where a key press on the sheet page came from: the Lyric or Chord field, the sheet itself, or anywhere else. */
function placeOf(target: Element | null, paper: HTMLElement | null): KeyPlace {
  if (target === null || !paper?.contains(target)) return 'other';
  if (target.closest('[data-panel] input')) return 'field';
  // The title inputs, the pills and the alternate-fingering popover keep their own keys (useSheetKeys).
  return target.closest('input, textarea, select, button, a, [role="dialog"]') ? 'other' : 'sheet';
}

interface Options {
  mode: Mode;
  /** Play mode covers the page: ? belongs to it then. */
  performing: boolean;
  paperRef: RefObject<HTMLDivElement | null>;
}

/**
 * The shortcuts panel of the sheet page: ? toggles it from anywhere but a text field, its state is remembered,
 * and while it is open a key press lights up its row.
 */
export function useKeysPanel({ mode, performing, paperRef }: Options) {
  const [open, setOpenState] = useState(() => readText('local', PANEL_KEY) === 'open');
  const [flash, setFlash] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    writeText('local', PANEL_KEY, next ? 'open' : 'closed');
  }, []);

  // Read in the window listeners, which are added once.
  const live = useRef({ open, mode, performing });
  live.current = { open, mode, performing };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || live.current.performing) return;
      if (e.target instanceof Element && e.target.closest(TEXT_FIELDS)) return;
      e.preventDefault();
      // Closing from inside the panel would drop the focus with it: it goes to the Keys button instead.
      if (live.current.open && document.activeElement?.closest('[data-keys-panel]')) buttonRef.current?.focus();
      setOpen(!live.current.open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // The flash listens in the capture phase: a handler that stops a key or moves the focus must not hide it.
  useEffect(() => {
    if (!open) return;
    let timer = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || live.current.performing) return;
      const target = e.target instanceof Element ? e.target : null;
      const row = rowFor(e, live.current.mode, placeOf(target, paperRef.current));
      if (row === null) return;
      window.clearTimeout(timer);
      setFlash(row);
      timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.clearTimeout(timer); setFlash(null); };
  }, [open, paperRef]);

  /** The Keys button: opening moves the focus to the search field. */
  const toggleFromButton = useCallback(() => {
    if (live.current.open) { setOpen(false); return; }
    setOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [setOpen]);

  /** The close button and Esc in the panel: the focus goes back to the Keys button. */
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, [setOpen]);

  return { open, flash, buttonRef, searchRef, toggleFromButton, close };
}
