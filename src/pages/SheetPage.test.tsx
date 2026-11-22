import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Player } from '../audio/player';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc, InstId } from '../domain/types';
import { useApp } from '../state/store';
import SheetPage from './SheetPage';

const fakePlayer = vi.hoisted(() => ({
  play: vi.fn(), stop: vi.fn(), playing: false,
}));
vi.mock('../audio/player', async importOriginal => ({
  ...(await importOriginal<typeof import('../audio/player')>()),
  createPlayer: vi.fn((): Player => fakePlayer),
}));

let path = '';
function Probe() {
  path = useLocation().pathname;
  return null;
}
const currentPath = () => path;

function renderSheet() {
  return render(
    <MemoryRouter initialEntries={['/sheet']}>
      <Routes>
        <Route path="/sheet" element={<><SheetPage /><Probe /></>} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const user = userEvent.setup();
const open = (id: InstId, patch: Partial<Doc> = {}) => {
  useApp.setState({ doc: { ...sampleDoc(id), ...patch }, instId: id, song: null, prefs: DEFAULT_PREFS });
  return renderSheet();
};

beforeEach(() => {
  sessionStorage.clear();
  fakePlayer.play.mockReset();
  fakePlayer.stop.mockReset();
  fakePlayer.playing = false;
});

it('suggested banner and badge', () => {
  open('asax');
  expect(screen.getByText(/Suggested key applied: sounds in B♭ major, you read G major/)).toBeInTheDocument();
  expect(screen.getByText('Suggested')).toBeInTheDocument();
});

it('check 2: red banner at shift 0 on Xaphoon C, fix button applies the best key', async () => {
  open('xc', { shift: 0 });
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('8 notes are below C4 — out of range for the xaphoon');
  expect(alert).toHaveTextContent('Those notes are marked red and have no fingering chart.');
  await user.click(within(alert).getByRole('button', { name: /Use C major \(\+10\)/ }));
  expect(useApp.getState().doc!.shift).toBe(10);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('check 4: key bridge, sounds in D → reads B', async () => {
  open('asax');
  await user.selectOptions(screen.getByLabelText(/Sounds in/), 'D major');
  expect(screen.getByLabelText(/You read/)).toHaveDisplayValue('B major');
});

it('non-transposing instruments get one Key select', () => {
  open('fl');
  expect(screen.getByLabelText('Key')).toBeInTheDocument();
  expect(screen.queryByLabelText(/Sounds in/)).toBeNull();
});

it('fine-tune and octave buttons', async () => {
  open('fl');
  const s = useApp.getState().doc!.shift;
  await user.click(screen.getByRole('button', { name: /semitone up|\+/ }));
  expect(useApp.getState().doc!.shift).toBe(s + 1);
  await user.click(screen.getByRole('button', { name: /semitone down/ }));
  expect(useApp.getState().doc!.shift).toBe(s);
  await user.click(screen.getByRole('button', { name: 'Octave up' }));
  expect(useApp.getState().doc!.shift).toBe(s + 12);
});

it('octave buttons are disabled when the result leaves −24..24', () => {
  open('fl', { shift: 15 });
  expect(screen.getByRole('button', { name: 'Octave up' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Octave down' })).toBeEnabled();
  expect(screen.getByText(/semitones · \+1 oct \+3 from original/)).toBeInTheDocument();
});

it('keys that fit: top 3, current pressed, picking one applies its shift', async () => {
  open('asax');
  const fits = screen.getAllByRole('button', { name: /^Sounds .* → you read / });
  expect(fits).toHaveLength(3);
  expect(fits[0]).toHaveAttribute('aria-pressed', 'true');
  expect(fits[0]).toHaveTextContent(/Sounds B♭ major → you read G major/);
  await user.click(fits[1]);
  expect(useApp.getState().doc!.shift).toBe(derive(sampleDoc('asax'), DEFAULT_PREFS).ranked[1].shift);
  expect(screen.queryByText('Suggested')).toBeNull();
});

it('changing the instrument re-suggests', async () => {
  open('asax');
  await user.selectOptions(screen.getByLabelText(/Fingerings for/), 'cl');
  expect(screen.getByText(/you read C major · sounds B♭ major/)).toBeInTheDocument();
});

it('chart style toggle only where satellites exist', async () => {
  open('asax');
  const full = screen.getByRole('button', { name: 'Full key map' });
  expect(full).toHaveAttribute('aria-pressed', 'false');
  await user.click(full);
  expect(useApp.getState().doc!.chartStyle).toBe('full');
  expect(full).toHaveAttribute('aria-pressed', 'true');
  cleanup();
  open('xc');
  expect(screen.queryByRole('button', { name: 'Full key map' })).toBeNull();
  cleanup();
  open('rs');
  await user.click(screen.getByRole('button', { name: 'German fingering' }));
  expect(useApp.getState().doc!.recorderSystem).toBe('german');
});

it('alternate fingering: pick, summary, reset', async () => {
  open('asax');
  const pills = screen.getAllByRole('button', { name: /⇅/ });
  await user.click(pills[0]);
  expect(pills[0]).toHaveAttribute('aria-expanded', 'true');
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent(/pick a fingering/);
  expect(within(dialog).getByText('auto')).toBeInTheDocument();
  const options = within(dialog).getAllByRole('button');
  await user.click(options.find(b => !/auto/.test(b.textContent!))!);
  expect(Object.keys(useApp.getState().doc!.fingering)).toHaveLength(1);
  expect(screen.getByText(/1 changed by you/)).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(pills[0]).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Reset all to auto' }));
  expect(useApp.getState().doc!.fingering).toEqual({});
});

it('alternate fingering: picking the auto option removes the override; Esc and outside click close', async () => {
  open('asax');
  const pill = screen.getAllByRole('button', { name: /⇅/ })[0];
  await user.click(pill);
  let dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getAllByRole('button').find(b => !/auto/.test(b.textContent!))!);
  expect(Object.keys(useApp.getState().doc!.fingering)).toHaveLength(1);
  await user.click(pill);
  dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByText('auto').closest('button')!);
  expect(useApp.getState().doc!.fingering).toEqual({});

  await user.click(pill);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(pill).toHaveFocus();

  await user.click(pill);
  await user.click(screen.getByText('Detected in file'));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('show toggles and title editing', async () => {
  open('xc');
  await user.click(screen.getByLabelText('Lyrics'));
  expect(useApp.getState().doc!.show.lyrics).toBe(false);
  await user.clear(screen.getByDisplayValue('The Water Is Wide'));
  await user.type(screen.getByPlaceholderText('Add a title'), 'Waly');
  expect(useApp.getState().doc!.title).toBe('Waly');
});

it('simplified notice', () => {
  open('fl', { source: { file: 'a.mid', format: 'MIDI', track: '1', trackCount: 1, simplified: true } });
  expect(screen.getByText(/Rhythm simplified/)).toBeInTheDocument();
});

it('range text', () => {
  open('xc');
  expect(screen.getByText('This song: G4 – G5 · all playable')).toBeInTheDocument();
});

it('range meter: the xaphoon has no extended band; the alto sax has one', () => {
  open('xc');
  expect(screen.queryByText('Extended (hard)')).toBeNull();
  cleanup();
  open('asax');
  expect(screen.getByText('Extended (hard)')).toBeInTheDocument();
});

it('page bar: steps, file chip, no Change track without a song, Print', async () => {
  const print = vi.fn();
  vi.stubGlobal('print', print);
  open('asax');
  expect(screen.getByRole('navigation', { name: 'Steps' })).toBeInTheDocument();
  const notes = derive(sampleDoc('asax'), DEFAULT_PREFS).counts.notes;
  expect(screen.getByText(`sample · track 1 Melody of 4 · ${notes} notes`)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Change track' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Print' }));
  expect(print).toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('playback', () => {
  it('Play starts the player, Stop stops it', async () => {
    open('asax');
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play).toHaveAttribute('aria-pressed', 'false');
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    await user.click(play);
    expect(fakePlayer.play).toHaveBeenCalledTimes(1);
    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop).toHaveAttribute('aria-pressed', 'true');
    fakePlayer.stop.mockImplementation(() => { fakePlayer.playing = false; fakePlayer.play.mock.calls[0][2](null); });
    await user.click(stop);
    expect(fakePlayer.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('stops on tempo or key change and on unmount, not on a title change', async () => {
    const view = open('asax');
    await user.click(screen.getByRole('button', { name: 'Play' }));
    fakePlayer.stop.mockClear();
    await user.type(screen.getByPlaceholderText('Add a title'), 'x');
    expect(fakePlayer.stop).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /semitone up/ }));
    expect(fakePlayer.stop).toHaveBeenCalled();
    fakePlayer.stop.mockClear();
    useApp.getState().patchDoc({ tempo: 120 });
    await screen.findByText('♩ = 120', { selector: 'label' });
    expect(fakePlayer.stop).toHaveBeenCalled();
    fakePlayer.stop.mockClear();
    view.unmount();
    expect(fakePlayer.stop).toHaveBeenCalled();
  });

  it('tempo slider writes the tempo', () => {
    open('asax');
    const slider = screen.getByLabelText(/♩ =/);
    expect(slider).toHaveAttribute('min', '40');
    expect(slider).toHaveAttribute('max', '200');
  });
});

it('redirects without a doc', () => {
  useApp.setState({ doc: null });
  renderSheet();
  expect(currentPath()).toBe('/');
});
