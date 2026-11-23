import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import { useApp } from '../state/store';
import { LOAD_FAILED } from '../ui/LoadBoundary';
import SheetPage from './SheetPage';

// The Edit notes panel's chunk fails to load; the Chords panel's chunk arrives only when the test opens the gate.
vi.mock('../ui/NotePanel', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
const gate = vi.hoisted(() => {
  let open: () => void = () => {};
  const opened = new Promise<void>(resolve => { open = resolve; });
  return { opened, open: () => open() };
});
vi.mock('../ui/ChordPanel', async importOriginal => {
  await gate.opened;
  return importOriginal();
});
vi.mock('../audio/player', async importOriginal => ({
  ...(await importOriginal<typeof import('../audio/player')>()),
  createPlayer: vi.fn(() => ({ play: vi.fn(), stop: vi.fn(), playing: false })),
}));

const user = userEvent.setup();
const sheet = () => screen.getByRole('group', { name: /^Sheet music/ });

/** Expected load failures: React reports them to the console and, in development, as window error events. */
function quietErrors() {
  const swallow = (e: ErrorEvent) => e.preventDefault();
  window.addEventListener('error', swallow);
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => { window.removeEventListener('error', swallow); spy.mockRestore(); };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  useApp.setState({ doc: sampleDoc('asax'), instId: 'asax', song: null, prefs: DEFAULT_PREFS, past: [], future: [] });
  render(<MemoryRouter initialEntries={['/sheet']}><SheetPage /></MemoryRouter>);
});

it('a failed panel chunk shows the reload notice; the paper and the mode switch stay usable', async () => {
  const restore = quietErrors();
  const modes = screen.getByRole('radiogroup', { name: 'Mode' });
  await user.click(within(modes).getByRole('radio', { name: 'Edit notes' }));
  sheet().focus();
  await user.keyboard('{Home}');
  expect(await within(sheet()).findByRole('alert')).toHaveTextContent(LOAD_FAILED);
  expect(within(sheet()).getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  expect(screen.getByTestId('paper')).toBeInTheDocument();
  await user.click(within(modes).getByRole('radio', { name: 'Lyrics' }));
  expect(await screen.findByRole('textbox', { name: 'Lyric' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
  restore();
});

it('while the next panel loads, Tab does not reach the previous panel’s field; a placeholder holds the place', async () => {
  const modes = screen.getByRole('radiogroup', { name: 'Mode' });
  await user.click(within(modes).getByRole('radio', { name: 'Lyrics' }));
  sheet().focus();
  await user.keyboard('{Home}{ArrowRight}');
  await screen.findByRole('textbox', { name: 'Lyric' });
  await user.click(within(modes).getByRole('radio', { name: 'Chords' }));
  sheet().focus();
  await user.keyboard('{Tab}');
  expect(screen.queryByRole('textbox', { name: 'Lyric' })).toBeNull();
  expect(sheet().querySelector('[aria-hidden="true"][style*="visibility: hidden"]')).not.toBeNull();
  await act(async () => { gate.open(); });
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Chord' })).toBeInTheDocument());
  sheet().focus();
  await user.keyboard('{Tab}');
  expect(screen.getByRole('textbox', { name: 'Chord' })).toHaveFocus();
});
