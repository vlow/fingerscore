import { useCallback, useEffect, useRef, useState } from 'react';
import { PDF_FAILED, PdfError } from '../pdf/errors';
import type { PdfRequestOptions } from '../pdf/request';

/** The live line for a PDF of more than 10 pages; shorter ones finish before it would help. */
export function progressLine(page: number, pages: number): string {
  return pages > 10 ? `Preparing PDF, page ${page} of ${pages}` : '';
}

/**
 * One PDF at a time for a page: `busy` while it is prepared, a second `start` is ignored, and leaving the page aborts it.
 * `start` resolves to `{ error }` (null on success, else the message for the alert line), or to null when the request was
 * ignored or aborted.
 */
export function usePdfJob() {
  const [busy, setBusy] = useState(false);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  const start = useCallback(async (
    request: (o: PdfRequestOptions) => Promise<void>,
    onProgress: (line: string) => void,
  ): Promise<{ error: string | null } | null> => {
    if (running.current) return null;
    const ctl = new AbortController();
    running.current = ctl;
    setBusy(true);
    try {
      await request({ signal: ctl.signal, onProgress: (page, pages) => { const line = progressLine(page, pages);
        if (line && !ctl.signal.aborted) onProgress(line); } });
      return ctl.signal.aborted ? null : { error: null };
    } catch (e) {
      return ctl.signal.aborted ? null : { error: e instanceof PdfError ? e.userMessage : PDF_FAILED };
    } finally {
      running.current = null;
      if (!ctl.signal.aborted) setBusy(false);
    }
  }, []);

  return { busy, start };
}
