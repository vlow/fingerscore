import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { previewTrack, stopPreview } from '../audio/player';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DEFAULT_PREFS } from '../domain/transpose';
import { parseMidi } from '../import/midi';
import { useApp } from '../state/store';
import Tracks from './Tracks';

vi.mock('../audio/player', () => ({ previewTrack: vi.fn(), stopPreview: vi.fn() }));

const demo = () => parseMidi('Auld_Lang_Syne.mid', new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid')));

let path = '';
function Probe() {
  path = useLocation().pathname;
  return null;
}
const currentPath = () => path;

function renderTracks() {
  return render(
    <MemoryRouter initialEntries={['/tracks']}>
      <Routes>
        <Route path="/tracks" element={<><Tracks /><Probe /></>} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const user = userEvent.setup();
const trackRadios = () => screen.getAllByRole('radio', { name: /^\d · / });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useApp.setState({ song: demo(), doc: null, instId: 'asax', prefs: DEFAULT_PREFS });
});

it('lists four tracks, recommends the melody, disables drums', () => {
  renderTracks();
  const radios = trackRadios();
  expect(radios).toHaveLength(4);
  expect(radios[0]).toBeChecked();
  expect(radios[3]).toBeDisabled();
  expect(screen.getByText('Recommended')).toBeInTheDocument();
  expect(screen.getByText("Can't be played")).toBeInTheDocument();
});

it('rows show instrument, channel and stats; bass is below the alto sax range', () => {
  renderTracks();
  const rows = screen.getAllByTestId('track-row');
  expect(within(rows[0]).getByText('Flute · channel 1')).toBeInTheDocument();
  expect(within(rows[0]).getByText('56')).toBeInTheDocument();
  expect(within(rows[0]).getByText('C4 – D5')).toBeInTheDocument();
  expect(within(rows[2]).getByText('Below range')).toBeInTheDocument();
  expect(within(rows[1]).queryByText('Below range')).toBeNull();
  expect(screen.getAllByRole('img', { name: /Piano roll of/ })).toHaveLength(4);
  expect(screen.getAllByRole('button', { name: /Play a preview of/ })).toHaveLength(3);
});

it('page bar: steps with Track current and a Different file link', () => {
  renderTracks();
  const steps = screen.getByRole('navigation', { name: 'Steps' });
  expect(within(steps).getByText('Track').closest('[aria-current]')).toHaveAttribute('aria-current', 'step');
  expect(screen.getByRole('link', { name: 'Different file' })).toHaveAttribute('href', '/');
});

it('extras default to detected chords and melody lyrics', () => {
  renderTracks();
  expect(screen.getByLabelText('Chord symbols from')).toHaveDisplayValue(/Chords/);
  expect(screen.getByLabelText('Lyrics from')).toHaveDisplayValue(/Melody/);
});

it('polyphony choice only for chord tracks', async () => {
  renderTracks();
  expect(screen.queryByText(/From chords, keep/)).toBeNull();
  await user.click(trackRadios()[1]);
  expect(screen.getByText(/From chords, keep/)).toBeInTheDocument();
});

it('a track below the range gets the octave hint', async () => {
  renderTracks();
  expect(screen.queryByText(/will be moved up by octaves/)).toBeNull();
  await user.click(trackRadios()[2]);
  expect(screen.getByText(/will be moved up by octaves/)).toBeInTheDocument();
});

it('CTA builds the sheet', async () => {
  renderTracks();
  await user.click(screen.getByRole('button', { name: /Make the sheet from .*Melody/ }));
  const d = useApp.getState().doc!;
  expect(d.score).toHaveLength(17);
  expect(d.inst).toBe('asax');
  expect(Object.keys(d.chords).length).toBeGreaterThan(0);
  expect(currentPath()).toBe('/sheet');
});

it('CTA uses the chosen track and extras', async () => {
  renderTracks();
  await user.click(trackRadios()[1]);
  await user.selectOptions(screen.getByLabelText(/From chords, keep/), 'Bottom note');
  await user.selectOptions(screen.getByLabelText('Lyrics from'), 'None');
  await user.click(screen.getByRole('button', { name: /Make the sheet from .*Chords/ }));
  const d = useApp.getState().doc!;
  expect(d.source.track).toBe('Chords');
  expect(d.score.flatMap(b => b.ev).some(e => e.l)).toBe(false);
});

it('redirects without a song', () => {
  useApp.setState({ song: null });
  renderTracks();
  expect(currentPath()).toBe('/');
});

it('a song without a usable track lists it disabled and cannot make a sheet', () => {
  const s = demo();
  useApp.setState({ song: { ...s, tracks: s.tracks.filter(t => t.percussion) } });
  renderTracks();
  const [radio] = trackRadios();
  expect(radio).toBeDisabled();
  expect(radio).not.toBeChecked();
  expect(screen.getByRole('button', { name: /Make the sheet from/ })).toBeDisabled();
});

it('plays an 8-second preview and stops it on leaving the page', async () => {
  const view = renderTracks();
  await user.click(screen.getByRole('button', { name: 'Play a preview of Melody' }));
  expect(previewTrack).toHaveBeenCalledWith(useApp.getState().song!.tracks[0].notes, 100, 8);
  expect(stopPreview).not.toHaveBeenCalled();
  view.unmount();
  expect(stopPreview).toHaveBeenCalledTimes(1);
});
