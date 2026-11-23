import { act, renderHook } from '@testing-library/react';
import { PDF_FAILED, PdfError } from '../pdf/errors';
import { progressLine, usePdfJob } from './usePdfJob';

it('the progress line exists for more than 10 pages only, at every 10th page and the last', () => {
  expect(progressLine(10, 10)).toBe('');
  expect(progressLine(3, 11)).toBe('');
  expect(progressLine(10, 125)).toBe('Preparing PDF, page 10 of 125');
  expect(progressLine(11, 125)).toBe('');
  expect(progressLine(120, 125)).toBe('Preparing PDF, page 120 of 125');
  expect(progressLine(125, 125)).toBe('Preparing PDF, page 125 of 125');
  expect(progressLine(11, 11)).toBe('Preparing PDF, page 11 of 11');
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

it('aborts on unmount, and reports nothing once the request settles', async () => {
  const { result, unmount } = renderHook(() => usePdfJob());
  let signal!: AbortSignal;
  let fail!: (e: unknown) => void;
  const onProgress = vi.fn();
  const p = result.current.start(o => { signal = o.signal!; return new Promise((_, rej) => { fail = rej; }); }, onProgress);
  unmount();
  expect(signal.aborted).toBe(true);
  fail(new PdfError('late'));
  expect(await p).toBeNull();
  expect(onProgress).not.toHaveBeenCalled();
});

it('abort while mounted clears busy at once, reports nothing and lets a new job start', async () => {
  const { result } = renderHook(() => usePdfJob());
  let signal!: AbortSignal;
  let fail!: (e: unknown) => void;
  let first!: Promise<unknown>;
  act(() => { first = result.current.start(o => { signal = o.signal!; return new Promise((_, rej) => { fail = rej; }); }, () => {}); });
  expect(result.current.busy).toBe(true);
  act(() => result.current.abort());
  expect(signal.aborted).toBe(true);
  expect(result.current.busy).toBe(false);
  let finish!: () => void;
  let second!: Promise<unknown>;
  act(() => { second = result.current.start(() => new Promise<void>(res => { finish = res; }), () => {}); });
  expect(result.current.busy).toBe(true);
  await act(async () => { fail(new PdfError('late')); await first; });
  expect(await first).toBeNull();
  expect(result.current.busy).toBe(true);   // the old job's end does not touch the new one
  await act(async () => { finish(); await second; });
  expect(await second).toEqual({ error: null });
  expect(result.current.busy).toBe(false);
});

it('clears the progress line when the job ends', async () => {
  const { result } = renderHook(() => usePdfJob());
  const lines: string[] = [];
  await result.current.start(async o => { o.onProgress!(10, 125); }, l => lines.push(l));
  expect(lines).toEqual(['Preparing PDF, page 10 of 125', '']);
  const none: string[] = [];
  await result.current.start(async o => { o.onProgress!(2, 5); }, l => none.push(l));
  expect(none).toEqual([]);
});
