import { act, fireEvent, render, screen } from '@testing-library/react';
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

describe('keyboard and pointer', () => {
  function setup() {
    render(<><button type="button">Before</button><ToastHost /><button type="button">After</button></>);
    const before = screen.getByRole('button', { name: 'Before' });
    before.focus();
    return before;
  }

  it('a: the timer pauses while hovered or focused and restarts in full when both have left', () => {
    vi.useFakeTimers();
    setup();
    act(() => showToast({ message: 'Hi' }));   // no action: focus stays outside
    const toast = screen.getByText('Hi').parentElement!;
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('Hi')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByText('Hi')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Hi')).toBeNull();

    act(() => showToast({ message: 'Undoable', action: { label: 'Undo', run() {} } }));
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveFocus();
    act(() => vi.advanceTimersByTime(20_000));
    expect(undo).toBeInTheDocument();                       // focus inside: paused
    fireEvent.mouseEnter(undo.parentElement!);
    act(() => screen.getByRole('button', { name: 'After' }).focus());
    act(() => vi.advanceTimersByTime(20_000));
    expect(undo).toBeInTheDocument();                       // still hovered: paused
    fireEvent.mouseLeave(undo.parentElement!);
    act(() => vi.advanceTimersByTime(5999));
    expect(undo).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('b: an action takes focus and gives it back after the action, the timeout or a dismissal', async () => {
    const before = setup();
    const run = vi.fn();
    act(() => showToast({ message: 'Deleted "A"', action: { label: 'Undo', run } }));
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(run).toHaveBeenCalledTimes(1);
    expect(before).toHaveFocus();

    vi.useFakeTimers();
    act(() => showToast({ message: 'Deleted "B"', action: { label: 'Undo', run }, ms: 1000 }));
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    act(() => screen.getByRole('button', { name: 'Undo' }).blur());   // focus leaves, timer runs
    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    act(() => showToast({ message: 'Replaced' }));                     // dismissed by a new toast
    expect(before).toHaveFocus();
  });

  it('b: focus does not move back when it has already left, or when the old element is gone', () => {
    const before = setup();
    act(() => showToast({ message: 'X', action: { label: 'Undo', run() {} } }));
    const after = screen.getByRole('button', { name: 'After' });
    act(() => after.focus());
    act(() => showToast({ message: 'Y' }));
    expect(after).toHaveFocus();

    expect(before).not.toHaveFocus();

    const gone = document.createElement('button');
    document.body.append(gone);
    gone.focus();
    act(() => showToast({ message: 'Z', action: { label: 'Undo', run() {} } }));
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    gone.remove();
    act(() => showToast({ message: 'W' }));
    expect(gone).not.toHaveFocus();
  });

  it('c: Esc dismisses without running the action', async () => {
    const before = setup();
    const run = vi.fn();
    act(() => showToast({ message: 'Deleted "A"', action: { label: 'Undo', run } }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Deleted "A"')).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(before).toHaveFocus();
  });

  it('d: a toast without an action never takes focus', () => {
    const before = setup();
    act(() => showToast({ message: 'Saved' }));
    expect(before).toHaveFocus();
  });
});
