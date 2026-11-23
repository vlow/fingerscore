import { useCallback, useEffect, useRef, useState } from 'react';
import { PDF_FAILED, PdfError } from '../pdf/errors';
import type { PdfRequestOptions } from '../pdf/request';

/** The live line for a PDF of more than 10 pages, at every 10th page and the last; shorter ones finish before it would help. */
export function progressLine(page: number, pages: number): string {
  return pages > 10 && (page % 10 === 0 || page === pages) ? `Preparing PDF, page ${page} of ${pages}` : '';
}

/**
 * One PDF at a time for a page: `busy` while it is prepared, a second `start` is ignored, and leaving the page aborts it.
 * `start` resolves to `{ error }` (null on success, else the message for the alert line), or to null when the request was
 * ignored or aborted.
 */
export function usePdfJob() {
  const [busy, setBusy] = useState(false);
  const running = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  /** Stops the running job; it reports nothing, and the page can start another at once. */
  const abort = useCallback(() => {
    const ctl = running.current;
    if (!ctl) return;
    ctl.abort();
    running.current = null;
    if (mounted.current) setBusy(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; running.current?.abort(); };
  }, []);

  const start = useCallback(async (
    request: (o: PdfRequestOptions) => Promise<void>,
    onProgress: (line: string) => void,
  ): Promise<{ error: string | null } | null> => {
    if (running.current) return null;
    const ctl = new AbortController();
    running.current = ctl;
    setBusy(true);
    let announced = false;
    try {
      await request({
        signal: ctl.signal,
        onProgress: (page, pages) => {
          const line = progressLine(page, pages);
          if (line && !ctl.signal.aborted) { announced = true; onProgress(line); }
        },
      });
      return ctl.signal.aborted ? null : { error: null };
    } catch (e) {
      return ctl.signal.aborted ? null : { error: e instanceof PdfError ? e.userMessage : PDF_FAILED };
    } finally {
      // An aborted job has been replaced or the page has gone: it leaves the state alone.
      if (!ctl.signal.aborted) {
        running.current = null;
        if (announced) onProgress('');
        setBusy(false);
      }
    }
  }, []);

  return { busy, start, abort };
}
