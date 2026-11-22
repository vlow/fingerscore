import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { writeMidi, type MidiEvent } from 'midi-file';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DEFAULT_PREFS } from '../domain/transpose';
import { useApp } from '../state/store';
import Start from './Start';

const demoBytes = () => new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid'));
const demoFile = () => new File([demoBytes()], 'Auld_Lang_Syne.mid');

let path = '';
function Probe() {
  path = useLocation().pathname;
  return null;
}
const currentPath = () => path;

function renderStart() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<><Start /><Probe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

const user = userEvent.setup();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useApp.setState({ instId: 'asax', prefs: DEFAULT_PREFS, song: null, doc: null });
});

afterEach(() => vi.unstubAllGlobals());

it('picker: family selects its default type and persists', async () => {
  renderStart();
  await user.click(screen.getByRole('radio', { name: /Clarinet/ }));
  expect(useApp.getState().instId).toBe('cl');
  expect(screen.getByText(/Clarinet in B♭ · E3 – E6/)).toBeInTheDocument();
  expect(localStorage.getItem('fingerscore.inst')).toBe('"cl"');
  await user.click(screen.getByRole('radio', { name: /Saxophone/ }));
  expect(useApp.getState().instId).toBe('asax');
  expect(within(screen.getByRole('radiogroup', { name: /type/i })).getAllByRole('radio')).toHaveLength(4);
});

it('picker: a type can be chosen and is marked checked', async () => {
  renderStart();
  await user.click(screen.getByRole('radio', { name: 'Tenor in B♭' }));
  expect(useApp.getState().instId).toBe('tsax');
  expect(screen.getByRole('radio', { name: 'Tenor in B♭' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('radio', { name: 'Alto in E♭' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('radio', { name: /Saxophone/ })).toHaveAttribute('aria-checked', 'true');
});

it('headline and drop zone copy', () => {
  renderStart();
  expect(screen.getByRole('heading', { level: 1, name: 'Sheet music with fingering charts for woodwinds' })).toBeInTheDocument();
  expect(screen.getByText('Drop a song here')).toBeInTheDocument();
  expect(screen.getByText(/new songs become a sheet for your Alto sax in E♭/)).toBeInTheDocument();
  expect(screen.getByText('MIDI .mid')).toBeInTheDocument();
  expect(screen.getByText('MusicXML .musicxml .mxl')).toBeInTheDocument();
  expect(screen.queryByText(/Saved sheet/)).toBeNull();
});

it('a MIDI file leads to Continue', async () => {
  renderStart();
  await user.upload(screen.getByLabelText(/drop a song/i), demoFile());
  expect(await screen.findByText(/Auld_Lang_Syne.mid — Ready/)).toBeInTheDocument();
  expect(useApp.getState().song?.tracks).toHaveLength(4);
  await user.click(screen.getByRole('button', { name: 'Continue →' }));
  expect(currentPath()).toBe('/tracks');
});

it('a file with one usable track goes straight to the sheet', async () => {
  const notes = [60, 62, 64, 65].flatMap(n => [
    { deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: n, velocity: 80 },
    { deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: n, velocity: 0 },
  ]);
  const bytes = new Uint8Array(writeMidi({
    header: { format: 1, numTracks: 1, ticksPerBeat: 480 },
    tracks: [[...notes, { deltaTime: 0, meta: true, type: 'endOfTrack' }] as MidiEvent[]],
  }));
  renderStart();
  await user.upload(screen.getByLabelText(/drop a song/i), new File([bytes], 'scale.mid'));
  await user.click(await screen.findByRole('button', { name: 'Continue →' }));
  expect(currentPath()).toBe('/sheet');
  expect(useApp.getState().doc?.inst).toBe('asax');
});

it('Choose another file returns to the idle drop zone', async () => {
  renderStart();
  await user.upload(screen.getByLabelText(/drop a song/i), demoFile());
  await user.click(await screen.findByRole('button', { name: 'Choose another file' }));
  expect(screen.getByText('Drop a song here')).toBeInTheDocument();
});

it('a wrong file shows the error by name', async () => {
  renderStart();
  const u = userEvent.setup({ applyAccept: false });
  await u.upload(screen.getByLabelText(/drop a song/i), new File(['x'], 'tune.abc'));
  expect(await screen.findByRole('alert')).toHaveTextContent('"tune.abc" is not a format fingerscore reads yet.');
  await u.click(screen.getByRole('button', { name: 'Try another file' }));
  expect(screen.getByText('Drop a song here')).toBeInTheDocument();
});

it('preferences are stored', async () => {
  renderStart();
  await user.click(screen.getByLabelText(/few sharps or flats/));
  expect(useApp.getState().prefs.fewAccidentals).toBe(false);
  await user.click(screen.getByLabelText(/easy register/));
  expect(useApp.getState().prefs.easyRegister).toBe(false);
});

it('Try a sample loads the demo and goes to the tracks page', async () => {
  const fetchMock = vi.fn(async () => new Response(demoBytes()));
  vi.stubGlobal('fetch', fetchMock);
  renderStart();
  await user.click(screen.getByRole('button', { name: /Try a sample/ }));
  await vi.waitFor(() => expect(currentPath()).toBe('/tracks'));
  expect(fetchMock).toHaveBeenCalledWith('/demo/Auld_Lang_Syne.mid');
  expect(useApp.getState().song?.file).toBe('Auld_Lang_Syne.mid');
});
