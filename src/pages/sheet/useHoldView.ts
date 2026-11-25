import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Keeps what the reader looks at in place when the systems change height (Lyrics or Chords mode adds or removes a band
 * in every system). Call the returned function just before the change: it notes the selected note's column, or else the
 * first system on screen, and where it stands. After the change the page scrolls by what that element moved, so the
 * element stays where it was and only the band's own height is new under the reader's eyes.
 */
export function useHoldView(paperRef: RefObject<HTMLElement | null>, systemHeight: number, selectedId: string | null): () => void {
  const held = useRef<{ el: Element; top: number } | null>(null);

  function hold() {
    const paper = paperRef.current;
    if (!paper) return;
    const column = selectedId === null ? null : paper.querySelector(`[data-hit="${selectedId}"]`);
    const onScreen = (el: Element) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };
    const el = column && onScreen(column)
      ? column
      : Array.from(paper.querySelectorAll('svg[data-testid="system"]')).find(sys => sys.getBoundingClientRect().bottom > 0) ?? null;
    held.current = el ? { el, top: el.getBoundingClientRect().top } : null;
  }

  useLayoutEffect(() => {
    const was = held.current;
    held.current = null;
    if (!was?.el.isConnected) return;
    const moved = was.el.getBoundingClientRect().top - was.top;
    if (moved !== 0) window.scrollBy(0, moved);
  }, [systemHeight]);

  return hold;
}
