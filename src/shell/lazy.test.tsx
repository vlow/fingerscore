import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LOAD_FAILED } from './loadFailed';
import { intentProps, lazyModule, lazyView, useLazy, type LazyModule } from './lazy';

/** Expected load failures: React reports them to the console and, in development, as window error events. */
function quietErrors() {
  const swallow = (e: ErrorEvent) => e.preventDefault();
  window.addEventListener('error', swallow);
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => { window.removeEventListener('error', swallow); spy.mockRestore(); };
}

const tick = () => new Promise(r => setTimeout(r, 0));

describe('lazyModule', () => {
  it('load requests once', async () => {
    const load = vi.fn(() => Promise.resolve(42));
    const m = lazyModule(load);
    expect(m.peek()).toBeNull();
    const [a, b] = await Promise.all([m.load(), m.load()]);
    expect([a, b]).toEqual([42, 42]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(m.peek()).toBe(42);
  });

  it('a failed load clears the cache', async () => {
    const load = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(7);
    const m = lazyModule(load);
    await expect(m.load()).rejects.toThrow('offline');
    await expect(m.load()).resolves.toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('prefetch swallows a failure and load retries', async () => {
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    process.on('unhandledRejection', unhandled);
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok');
    const m = lazyModule(load);
    m.prefetch();
    await tick();
    await tick();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
    process.off('unhandledRejection', unhandled);

    function Probe() {
      const { failed } = useLazy(m);
      return <p>{failed ? 'failed' : 'fine'}</p>;
    }
    render(<Probe />);
    expect(screen.getByText('fine')).toBeInTheDocument();
    await expect(m.load()).resolves.toBe('ok');
  });
});

describe('useLazy', () => {
  function Probe({ m, onReady }: { m: LazyModule<string>; onReady: () => void }) {
    const { value, failed, request } = useLazy(m, onReady);
    return (
      <>
        <button type="button" onClick={request}>go</button>
        <p>{`value:${value ?? '-'} failed:${failed}`}</p>
      </>
    );
  }

  it('request then onReady', async () => {
    const load = vi.fn(() => Promise.resolve('panel'));
    const onReady = vi.fn();
    render(<Probe m={lazyModule(load)} onReady={onReady} />);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('value:panel failed:false')).toBeInTheDocument();
    expect(onReady).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('failed until the next request', async () => {
    let reject: (e: Error) => void = () => {};
    const load = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    render(<Probe m={lazyModule(load)} onReady={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('value:- failed:true')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(screen.getByText('value:- failed:false')).toBeInTheDocument();
    await act(async () => { reject(new Error('offline')); });
  });
});

describe('lazyView', () => {
  it('renders a loaded module without suspending', async () => {
    const m = lazyModule(() => Promise.resolve(({ name }: { name: string }) => <p>hello {name}</p>));
    await m.load();
    const View = lazyView(m, { fallback: <p>busy</p> });
    render(<View name="sax" />);
    expect(screen.getByText('hello sax')).toBeInTheDocument();
    expect(screen.queryByText('busy')).toBeNull();
  });

  it('shows the reload notice when the chunk fails', async () => {
    const restore = quietErrors();
    const View = lazyView(lazyModule<() => JSX.Element>(() => Promise.reject(new Error('Failed to fetch dynamically imported module'))));
    render(<View />);
    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_FAILED);
    restore();
  });
});

it('intentProps prefetches every module', () => {
  const a = vi.fn(() => Promise.resolve(1));
  const b = vi.fn(() => Promise.resolve(2));
  intentProps(lazyModule(a), lazyModule(b)).onFocus();
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
});
