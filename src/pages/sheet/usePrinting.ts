import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * True while the browser prepares and shows the print preview. The print drawing is the screen's DOM, so a band that the
 * editing mode forces (Lyrics or Chords mode) must be taken out of the layout itself for the printed height to follow the
 * Show switches: `beforeprint` re-renders at once, before the browser lays the page out, and `afterprint` restores the mode.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return printing;
}
