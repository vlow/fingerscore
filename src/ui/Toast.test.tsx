import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { showToast, ToastHost } from './Toast';

afterEach(() => vi.useRealTimers());

it('shows one toast at a time in a status region and hides it after 6 seconds', () => {
  vi.useFakeTimers();
  render(<ToastHost />);
  const region = screen.getByRole('status');
  act(() => showToast({ message: 'First' }));
  act(() => showToast({ message: 'Second' }));
  expect(region).toHaveTextContent('Second');
  expect(screen.queryByText('First')).toBeNull();
  act(() => vi.advanceTimersByTime(5999));
  expect(region).toHaveTextContent('Second');
  act(() => vi.advanceTimersByTime(1));
  expect(region).toBeEmptyDOMElement();
});

it('the action runs once and closes the toast', async () => {
  render(<ToastHost />);
  const run = vi.fn();
  act(() => showToast({ message: 'Deleted "A"', action: { label: 'Undo', run }, ms: 1000 }));
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(run).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Deleted "A"')).toBeNull();
});
