import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DEFAULT_PREFS } from '../domain/transpose';
import { bare } from '../test/bandSheets';
import { useApp } from '../state/store';
import SheetPage from './SheetPage';

vi.mock('../audio/player', async importOriginal => ({
  ...(await importOriginal<typeof import('../audio/player')>()),
  createPlayer: vi.fn(() => ({ play: vi.fn(), stop: vi.fn(), playing: false })),
}));

const user = userEvent.setup();

function open() {
  useApp.setState({ doc: bare(), instId: 'xc', song: null, prefs: DEFAULT_PREFS, past: [], future: [] });
  render(
    <MemoryRouter initialEntries={['/sheet']}>
      <Routes><Route path="/sheet" element={<SheetPage />} /></Routes>
    </MemoryRouter>,
  );
}
const heights = () => screen.getAllByTestId('system').map(s => Number(s.getAttribute('height')));

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(cleanup);

describe('the bands on the sheet page', () => {
  it('a bare sheet has no band: systems 236 px (15 px of headroom would cut the bar numbers)', () => {
    open();
    expect(heights()).toEqual([236, 236]);
  });

  it('Lyrics mode adds the lyric band to every system, Chords mode the chord band; View takes them away', async () => {
    open();
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    expect(heights()).toEqual([254, 254]);
    await user.click(screen.getByRole('radio', { name: 'Chords' }));
    expect(heights()).toEqual([252, 252]);
    await user.click(screen.getByRole('radio', { name: 'Edit notes' }));
    expect(heights()).toEqual([236, 236]);
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    await user.click(screen.getByRole('radio', { name: 'View' }));
    expect(heights()).toEqual([236, 236]);
  });

  it('a lyric typed in Lyrics mode keeps the band when the mode is left', async () => {
    open();
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    const doc = useApp.getState().doc!;
    act(() => useApp.setState({ doc: { ...doc, score: doc.score.map((b, i) => (i === 0 ? { ...b, ev: b.ev.map((e, k) => (k === 0 ? { ...e, l: 'la' } : e)) } : b)) } }));
    await user.click(screen.getByRole('radio', { name: 'View' }));
    expect(heights()).toEqual([254, 254]);
  });

  it('printing takes a band that only the mode forces out of the drawing, and the mode brings it back after printing', async () => {
    open();
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    expect(heights()).toEqual([254, 254]);
    act(() => { window.dispatchEvent(new Event('beforeprint')); });
    expect(heights()).toEqual([236, 236]);
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(heights()).toEqual([254, 254]);
  });
});
