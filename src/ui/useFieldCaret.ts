import { useLayoutEffect, useRef } from 'react';

/**
 * A controlled text field whose value comes from the document: React puts the caret at the end whenever the value
 * it renders differs from what the field holds (an inserted symbol, a prettified "b"). This keeps the caret where
 * the user expects it: set the wanted position before the edit, and it is restored after the next render.
 */
export function useFieldCaret() {
  const ref = useRef<HTMLInputElement | null>(null);
  const pending = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || pending.current === null) return;
    el.setSelectionRange(pending.current, pending.current);
    pending.current = null;
  });

  return {
    ref,
    /** The caret goes to this position after the next render. */
    keep(at: number) { pending.current = at; },
    /** The field's text with `text` put over the selection, and the caret after it (or `caretAt` characters into it). */
    insert(text: string, caretAt = text.length): { value: string; caret: number } {
      const el = ref.current!;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      return { value: el.value.slice(0, start) + text + el.value.slice(end), caret: start + caretAt };
    },
  };
}
