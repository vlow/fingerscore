import { useEffect, useRef } from 'react';

interface Handlers { onSave(): void; onUndo(): void; onRedo(): void }

/**
 * The letter a shortcut means: e.key when it is a Latin letter (so a German Z, whose code is KeyY,
 * stays Z), else the physical key from e.code (Cyrillic, Greek and other layouts).
 */
function letter(e: KeyboardEvent): string | null {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase();
  const m = /^Key([A-Z])$/.exec(e.code);
  return m ? m[1].toLowerCase() : null;
}

/**
 * The sheet page's one shortcut handler (design 4.6): Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z and Ctrl+Y redo,
 * Ctrl/⌘+S save. It listens on the window, so it also works while a text field of the page has focus;
 * the app's history replaces the browser's text undo there. A key another handler already took
 * (default prevented) is left alone; none of the page's own key handlers use these chords. A field marked
 * `data-native-undo` is not part of the sheet's history: there undo and redo stay the browser's, save still works.
 */
export function useSheetShortcuts(h: Handlers): void {
  const ref = useRef(h);
  ref.current = h;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || !(e.ctrlKey || e.metaKey)) return;
      const k = letter(e);
      let run: (() => void) | null = null;
      if (k === 's' && !e.shiftKey) run = ref.current.onSave;
      else if (k === 'z') run = e.shiftKey ? ref.current.onRedo : ref.current.onUndo;
      else if (k === 'y' && e.ctrlKey && !e.metaKey && !e.shiftKey) run = ref.current.onRedo;
      if (!run) return;
      if (run !== ref.current.onSave && e.target instanceof Element && e.target.closest('[data-native-undo]')) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
