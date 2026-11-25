import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import { useApp } from '../state/store';
import SheetPage from './SheetPage';

// The play-mode chunk arrives only when the test opens the gate.
const gate = vi.hoisted(() => {
  let open: () => void = () => {};
  const opened = new Promise<void>(resolve => { open = resolve; });
  return { opened, open: () => open() };
});
vi.mock('../ui/PlayMode', async importOriginal => {
  await gate.opened;
  return importOriginal();
});
vi.mock('../audio/player', async importOriginal => ({
  ...(await importOriginal<typeof import('../audio/player')>()),
  createPlayer: vi.fn(() => ({ play: vi.fn(), stop: vi.fn(), playing: false })),
}));

const user = userEvent.setup();

it('arriving from the library: the sheet is usable until the chunk has arrived, then play mode opens, once', async () => {
  useApp.setState({ doc: sampleDoc('asax'), instId: 'asax', song: null, prefs: DEFAULT_PREFS, past: [], future: [] });
  render(<MemoryRouter initialEntries={[{ pathname: '/sheet', state: { playMode: true } }]}><SheetPage /></MemoryRouter>);
  expect(screen.queryByRole('region', { name: 'Play mode' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  await user.click(screen.getByRole('radio', { name: /Edit notes/ }));
  expect(screen.getByRole('radio', { name: /Edit notes/ })).toBeChecked();
  expect(screen.getByRole('textbox', { name: 'Sheet title' }).closest('[inert]')).toBeNull();

  await act(async () => { gate.open(); });
  expect(await screen.findByRole('region', { name: 'Play mode' })).toBeInTheDocument();
  // Opening play mode leaves the edit mode, as the button does.
  await user.keyboard('{Escape}');
  expect(screen.getByRole('radio', { name: /View/ })).toBeChecked();
  expect(screen.queryByRole('region', { name: 'Play mode' })).toBeNull();
});
