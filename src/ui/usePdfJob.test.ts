import { act, renderHook } from '@testing-library/react';
import { PDF_FAILED, PdfError } from '../pdf/errors';
import { progressLine, usePdfJob } from './usePdfJob';

it('the progress line exists for more than 10 pages only', () => {
  expect(progressLine(3, 10)).toBe('');
  expect(progressLine(3, 11)).toBe('Preparing PDF, page 3 of 11');
});

it('ignores a start while one runs', async () => {
  const { result } = renderHook(() => usePdfJob());
  let finish!: () => void;
  const request = vi.fn(() => new Promise<void>(res => { finish = res; }));
  let first!: Promise<unknown>;
  act(() => { first = result.current.start(request, () => {}); });
  expect(result.current.busy).toBe(true);
  expect(await result.current.start(request, () => {})).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await first; });
  expect(await first).toEqual({ error: null });
  expect(result.current.busy).toBe(false);
});

it('maps a PdfError to its message and any other error to the generic one', async () => {
  const { result } = renderHook(() => usePdfJob());
  expect(await result.current.start(async () => { throw new PdfError('x y'); }, () => {})).toEqual({ error: 'x y' });
  expect(await result.current.start(async () => { throw new Error('boom'); }, () => {})).toEqual({ error: PDF_FAILED });
});

it('aborts on unmount and reports nothing', async () => {
  const { result, unmount } = renderHook(() => usePdfJob());
  let signal!: AbortSignal;
  const p = result.current.start(o => { signal = o.signal!; return new Promise(() => {}); }, () => {});
  void p;
  unmount();
  expect(signal.aborted).toBe(true);
});
