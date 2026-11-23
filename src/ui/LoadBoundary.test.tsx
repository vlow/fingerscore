import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy, Suspense } from 'react';
import { LOAD_FAILED, LoadBoundary } from './LoadBoundary';

/** Expected load failures: React reports them to the console and, in development, as window error events. */
function quietErrors() {
  const swallow = (e: ErrorEvent) => e.preventDefault();
  window.addEventListener('error', swallow);
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => { window.removeEventListener('error', swallow); spy.mockRestore(); };
}

it('a lazy part whose import rejects shows the reload notice; its siblings stay', async () => {
  const restore = quietErrors();
  const Broken = lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')));
  render(
    <>
      <p>Header stays</p>
      <LoadBoundary>
        <Suspense fallback={null}><Broken /></Suspense>
      </LoadBoundary>
      <p>Footer stays</p>
    </>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_FAILED);
  expect(LOAD_FAILED).toBe('This part of fingerscore could not be loaded. Check your connection and reload the page.');
  expect(screen.getByText('Header stays')).toBeInTheDocument();
  expect(screen.getByText('Footer stays')).toBeInTheDocument();
  restore();
});

it('Reload reloads the page', async () => {
  const restore = quietErrors();
  const reload = vi.fn();
  const original = window.location;
  Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
  const Broken = lazy(() => Promise.reject(new Error('offline')));
  render(<LoadBoundary compact><Suspense fallback={null}><Broken /></Suspense></LoadBoundary>);
  await userEvent.click(await screen.findByRole('button', { name: 'Reload' }));
  expect(reload).toHaveBeenCalled();
  Object.defineProperty(window, 'location', { configurable: true, value: original });
  restore();
});

it('renders its children when nothing fails', () => {
  render(<LoadBoundary><p>Loaded</p></LoadBoundary>);
  expect(screen.getByText('Loaded')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});
