import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import { useApp } from '../state/store';
import SheetPage from './SheetPage';

// The play-mode chunk first fails to load, then arrives only when the test opens the gate.
// Each test file has its own module registry, so this file sees the chunk as not loaded until it has arrived once.
const chunk = vi.hoisted(() => {
  const state = {
    fail: true,
    held: Promise.resolve(),
    release: () => {},
    hold() { state.held = new Promise<void>(resolve => { state.release = resolve; }); },
  };
  return state;
});
vi.mock('../ui/PlayMode', async importOriginal => {
  if (chunk.fail) throw new Error('Failed to fetch dynamically imported module');
  await chunk.held;
  return importOriginal();
});
vi.mock('../audio/player', async importOriginal => ({
  ...(await importOriginal<typeof import('../audio/player')>()),
  createPlayer: vi.fn(() => ({ play: vi.fn(), stop: vi.fn(), playing: false })),
}));

const user = userEvent.setup();
const MESSAGE = 'Play mode could not be loaded. Reload the page and try again.';
const stage = () => screen.queryByRole('region', { name: 'Play mode' });

function quietErrors() {
  const swallow = (e: ErrorEvent) => e.preventDefault();
  window.addEventListener('error', swallow);
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => { window.removeEventListener('error', swallow); spy.mockRestore(); };
}

function renderSheet(state: unknown = null) {
  useApp.setState({ doc: sampleDoc('asax'), instId: 'asax', song: null, prefs: DEFAULT_PREFS, past: [], future: [] });
  render(<MemoryRouter initialEntries={[{ pathname: '/sheet', state }]}><SheetPage /></MemoryRouter>);
}

it('arriving from the library with a failed chunk: the sheet stays in its normal view, with the message', async () => {
  const restore = quietErrors();
  renderSheet({ playMode: true });
  expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE);
  expect(stage()).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Sheet title' }).closest('[inert]')).toBeNull();
  await user.click(screen.getByRole('radio', { name: /Edit notes/ }));
  expect(screen.getByRole('radio', { name: /Edit notes/ })).toBeChecked();
  restore();
});

it('the Play mode button: a failed load shows the message; a later load that works opens play mode', async () => {
  const restore = quietErrors();
  chunk.fail = true;
  renderSheet();
  await user.click(screen.getByRole('button', { name: 'Play mode' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE);
  expect(stage()).toBeNull();
  expect(screen.getByTestId('paper')).toBeInTheDocument();
  restore();

  // The code is on its way: nothing changes on the page, and the sheet can be used meanwhile.
  chunk.fail = false;
  chunk.hold();
  await user.click(screen.getByRole('radio', { name: /Edit notes/ }));
  await user.click(screen.getByRole('button', { name: 'Play mode' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(stage()).toBeNull();
  expect(screen.getByRole('radio', { name: /Edit notes/ })).toBeChecked();
  expect(screen.getByRole('textbox', { name: 'Sheet title' }).closest('[inert]')).toBeNull();
  await user.click(screen.getByRole('radio', { name: /Lyrics/ }));
  expect(screen.getByRole('radio', { name: /Lyrics/ })).toBeChecked();

  await act(async () => { chunk.release(); });
  const region = await screen.findByRole('region', { name: 'Play mode' });
  expect(within(region).getByRole('heading', { level: 1 })).toHaveTextContent('The Water Is Wide');
  expect(screen.getByRole('textbox', { name: 'Sheet title' }).closest('[inert]')).not.toBeNull();
  await user.keyboard('{Escape}');
  expect(stage()).toBeNull();
  expect(screen.getByRole('radio', { name: /View/ })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Play mode' })).toHaveFocus();
});

it('once the code has arrived, the button opens play mode again at once', async () => {
  renderSheet();
  await user.click(screen.getByRole('button', { name: 'Play mode' }));
  expect(stage()).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});
