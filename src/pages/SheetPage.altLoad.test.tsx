import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import { useApp } from '../state/store';
import SheetPage from './SheetPage';

vi.mock('../audio/player', async importOriginal => ({
  ...(await importOriginal<typeof import('../audio/player')>()),
  createPlayer: vi.fn(() => ({ play: vi.fn(), stop: vi.fn(), playing: false })),
}));

// The popover's chunk fails to load the first time, and arrives the second time.
const chunk = vi.hoisted(() => ({ fail: true }));
vi.mock('../ui/AltFingeringPopover', async importOriginal => {
  if (chunk.fail) { chunk.fail = false; throw new Error('chunk lost'); }
  return importOriginal();
});

const user = userEvent.setup();
afterEach(cleanup);

it('a failed load of the popover shows a message, and the next click on a pill retries and opens it', async () => {
  useApp.setState({ doc: sampleDoc('asax'), instId: 'asax', song: null, prefs: DEFAULT_PREFS, past: [], future: [] });
  render(<MemoryRouter initialEntries={['/sheet']}><Routes><Route path="/sheet" element={<SheetPage />} /></Routes></MemoryRouter>);
  const pill = screen.getAllByRole('button', { name: /⇅/ })[0];
  await user.click(pill);
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(pill).toHaveAttribute('aria-expanded', 'false');
  await user.click(pill);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.queryByText(/could not be loaded/)).toBeNull();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(pill).toHaveFocus();
});
