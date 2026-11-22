import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { writeMidi, type MidiEvent } from 'midi-file';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { sampleDoc } from '../domain/fixture';
import { serializeFile } from '../domain/persistence';
import { DEFAULT_PREFS } from '../domain/transpose';
import { FULL_MESSAGE, listEntries, saveEntry } from '../state/library';
import { useApp } from '../state/store';
import { ToastHost } from '../ui/Toast';
import Start from './Start';

const demoBytes = () => new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid'));
const demoFile = () => new File([demoBytes()], 'Auld_Lang_Syne.mid');

let path = '';
let locationState: unknown;
function Probe() {
  const loc = useLocation();
  path = loc.pathname;
  locationState = loc.state;
  return null;
}
const currentPath = () => path;

function renderStart({ state }: { state?: unknown } = {}) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/', state }]}>
      <Routes>
        <Route path="*" element={<><Start /><Probe /></>} />
      </Routes>
      <ToastHost />
    </MemoryRouter>,
  );
}

const user = userEvent.setup();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useApp.setState({ instId: 'asax', prefs: DEFAULT_PREFS, song: null, doc: null });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
  expect(screen.getByText('Drop a song or a saved sheet here')).toBeInTheDocument();
  expect(screen.getByText(/new songs become a sheet for your Alto sax in E♭/)).toBeInTheDocument();
  expect(screen.getByText('MIDI .mid')).toBeInTheDocument();
  expect(screen.getByText('MusicXML .musicxml .mxl')).toBeInTheDocument();
  expect(screen.getByText('Saved sheet .json')).toBeInTheDocument();
});

it('a MIDI file leads to Continue', async () => {
  renderStart();
  await user.upload(screen.getByLabelText(/drop a song/i), demoFile());
  expect(await screen.findByText(/Auld_Lang_Syne.mid — Ready/)).toBeInTheDocument();
  expect(useApp.getState().song?.tracks).toHaveLength(4);
  await user.click(screen.getByRole('button', { name: 'Continue →' }));
  expect(currentPath()).toBe('/tracks');
});

it('picking an instrument here leaves the open sheet unchanged; the next import uses it', async () => {
  useApp.getState().setDoc({ ...sampleDoc('asax'), title: 'Kept' });
  expect(useApp.getState().saveSheet()).toBe(true);
  const before = useApp.getState().doc;
  renderStart();
  await user.click(screen.getByRole('radio', { name: /Clarinet/ }));
  expect(useApp.getState().instId).toBe('cl');
  expect(useApp.getState().doc).toBe(before);
  const notes = [60, 62, 64, 65].flatMap(n => [
    { deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: n, velocity: 80 },
    { deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: n, velocity: 0 },
  ]);
  const bytes = new Uint8Array(writeMidi({
    header: { format: 1, numTracks: 1, ticksPerBeat: 480 },
    tracks: [[...notes, { deltaTime: 0, meta: true, type: 'endOfTrack' }] as MidiEvent[]],
  }));
  await user.upload(screen.getByLabelText(/drop a song/i), new File([bytes], 'scale.mid'));
  await user.click(await screen.findByRole('button', { name: 'Continue →' }));
  expect(useApp.getState().doc?.inst).toBe('cl');
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

it('a new song clears the previous doc, from a file or the sample', async () => {
  useApp.getState().setDoc(sampleDoc('asax'));
  expect(sessionStorage.getItem('fingerscore.doc')).not.toBeNull();
  renderStart();
  await user.upload(screen.getByLabelText(/drop a song/i), demoFile());
  await screen.findByText(/Auld_Lang_Syne.mid — Ready/);
  expect(useApp.getState().doc).toBeNull();
  expect(sessionStorage.getItem('fingerscore.doc')).toBeNull();

  useApp.getState().setDoc(sampleDoc('asax'));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(demoBytes())));
  await user.click(screen.getByRole('button', { name: /Try a sample/ }));
  await vi.waitFor(() => expect(currentPath()).toBe('/tracks'));
  expect(useApp.getState().doc).toBeNull();
});

it('Choose another file returns to the idle drop zone', async () => {
  renderStart();
  await user.upload(screen.getByLabelText(/drop a song/i), demoFile());
  await user.click(await screen.findByRole('button', { name: 'Choose another file' }));
  expect(screen.getByText('Drop a song or a saved sheet here')).toBeInTheDocument();
});

it('a wrong file shows the error by name', async () => {
  renderStart();
  const u = userEvent.setup({ applyAccept: false });
  await u.upload(screen.getByLabelText(/drop a song/i), new File(['x'], 'tune.abc'));
  expect(await screen.findByRole('alert')).toHaveTextContent('"tune.abc" is not a format fingerscore reads yet.');
  await u.click(screen.getByRole('button', { name: 'Try another file' }));
  expect(screen.getByText('Drop a song or a saved sheet here')).toBeInTheDocument();
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

const drop = (file: File) =>
  fireEvent.drop(screen.getByTestId('drop-zone'), { dataTransfer: { files: [file], types: ['Files'] } });

it('a file dropped on the ready state is read, not opened by the browser', async () => {
  renderStart();
  await user.upload(screen.getByLabelText(/drop a song/i), demoFile());
  await screen.findByText(/Auld_Lang_Syne.mid — Ready/);
  expect(fireEvent.dragOver(screen.getByTestId('drop-zone'))).toBe(false);   // false = default prevented
  expect(drop(new File(['x'], 'tune.abc'))).toBe(false);
  expect(await screen.findByRole('alert')).toHaveTextContent('"tune.abc" is not a format fingerscore reads yet.');
});

it('a file dropped on the error state is read', async () => {
  renderStart();
  expect(drop(new File(['x'], 'tune.abc'))).toBe(false);
  await screen.findByRole('alert');
  expect(drop(demoFile())).toBe(false);
  expect(await screen.findByText(/Auld_Lang_Syne.mid — Ready/)).toBeInTheDocument();
  expect(within(screen.getByTestId('drop-zone')).getByRole('status')).toHaveTextContent('Ready');
});

it('subline names the formats version 1 reads', () => {
  renderStart();
  expect(screen.getByText(/^Upload a MIDI or MusicXML file\./)).toBeInTheDocument();
});

it('says when a linked sheet is no longer saved', () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/', state: { missingSheet: true } }]}>
      <Start />
    </MemoryRouter>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('That sheet is no longer saved in this browser.');
});

it('shows no missing-sheet alert without that state', () => {
  renderStart();
  expect(screen.queryByText('That sheet is no longer saved in this browser.')).toBeNull();
});

it('no gallery without saved sheets', () => { renderStart(); expect(screen.queryByRole('heading', { name: 'Your sheets' })).toBeNull(); });

it('gallery lists saved sheets newest first, four at a time', async () => {
  for (let i = 1; i <= 6; i++) saveEntry({ ...sampleDoc('asax'), title: `Sheet ${i}` }, null, new Date(Date.UTC(2026, 10, 22, 10, i)));
  renderStart(); const g = screen.getByRole('region', { name: 'Your sheets' });
  expect(within(g).getByText('6 sheets · saved in this browser')).toBeInTheDocument();
  expect(within(g).getAllByRole('link').map(a => a.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Sheet 6')]));
  expect(within(g).getAllByRole('link')).toHaveLength(4); expect(within(g).getAllByRole('link')[0]).toHaveTextContent('Sheet 6');
  expect(within(g).getAllByRole('link')[0]).toHaveAttribute('href', expect.stringMatching(/^\/sheet\?id=/)); expect(within(g).getAllByRole('link')[0]).toHaveTextContent('Alto sax in E♭');
  await user.click(within(g).getByRole('button', { name: 'Show all 6' })); expect(within(g).getAllByRole('link')).toHaveLength(6);
});

it('delete with undo', async () => {
  saveEntry({ ...sampleDoc('asax'), title: 'Keep' }, null); saveEntry({ ...sampleDoc('cl'), title: 'Drop me' }, null); renderStart();
  await user.click(screen.getByRole('button', { name: 'Delete Drop me' })); expect(screen.queryByText('Drop me')).toBeNull(); expect(listEntries()).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('Deleted "Drop me"'); await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByText('Drop me')).toBeInTheDocument(); expect(listEntries()).toHaveLength(2);
});

it('drop zone copy and chips include saved sheets', () => { renderStart(); expect(screen.getByText('Drop a song or a saved sheet here')).toBeInTheDocument(); expect(screen.getByText(/Saved sheet/)).toBeInTheDocument(); });

it('a saved sheet dropped on the zone is added to the library', async () => {
  renderStart(); const text = serializeFile({ ...sampleDoc('fl'), title: 'Dropped' });
  await user.upload(screen.getByLabelText(/drop a song or a saved sheet/i), new File([text], 'dropped.fingerscore.json', { type: 'application/json' }));
  expect(await screen.findByText('✓ "Dropped" added to your sheets')).toBeInTheDocument(); expect(listEntries()[0].title).toBe('Dropped');
  expect(screen.getByRole('link', { name: /Open sheet/ })).toHaveAttribute('href', `/sheet?id=${listEntries()[0].id}`);
  await user.click(screen.getByRole('button', { name: 'Add another' })); expect(screen.getByRole('region', { name: 'Your sheets' })).toHaveTextContent('Dropped');
});

it('a foreign JSON file is refused and nothing is added (review focus 1)', async () => {
  renderStart(); await user.upload(screen.getByLabelText(/drop a song or a saved sheet/i), new File(['{"name":"x","version":"1.0.0"}'], 'package.json', { type: 'application/json' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('"package.json" isn\'t a fingerscore sheet.'); expect(listEntries()).toEqual([]);
});

it('the missing-sheet alert', () => { renderStart({ state: { missingSheet: true } }); expect(screen.getByRole('alert')).toHaveTextContent('That sheet is no longer saved in this browser.'); });

it('the missing-sheet alert is shown once: the history entry loses its state, the alert stays until the page is left', () => {
  renderStart({ state: { missingSheet: true } });
  expect(locationState).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('That sheet is no longer saved in this browser.');
  cleanup();
  renderStart({ state: locationState });   // a reload or Back restores the entry's (now empty) state
  expect(screen.queryByRole('alert')).toBeNull();
});

it('deleting the open sheet\'s entry unlinks it; undo links it again', async () => {
  useApp.getState().setDoc({ ...sampleDoc('asax'), title: 'Open one' });
  expect(useApp.getState().saveSheet()).toBe(true);
  const id = useApp.getState().libraryId;
  renderStart();
  await user.click(screen.getByRole('button', { name: 'Delete Open one' }));
  expect(useApp.getState().libraryId).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(useApp.getState().libraryId).toBe(id);
  expect(screen.getByRole('region', { name: 'Your sheets' })).toHaveTextContent('Open one');
});

const sheetFile = (title: string, name = `${title}.fingerscore.json`) =>
  new File([serializeFile({ ...sampleDoc('fl'), title })], name, { type: 'application/json' });
const cardLink = (title: string) =>
  within(screen.getByRole('region', { name: 'Your sheets' })).getByRole('link', { name: new RegExp(`^${title}`) });
/** Saves sheets so that the first title is the newest (the library lists the last save first). */
function saveSheets(...titles: string[]) {
  [...titles].reverse().forEach((title, i) => saveEntry({ ...sampleDoc('asax'), title }, null, new Date(Date.UTC(2026, 10, 22, 10, i))));
}

it('the count is singular for one sheet', () => {
  saveSheets('Only');
  renderStart();
  expect(screen.getByText('1 sheet · saved in this browser')).toBeInTheDocument();
});

it('an upper-case .JSON name takes the saved-sheet path', async () => {
  renderStart();
  drop(sheetFile('Loud', 'LOUD.JSON'));
  expect(await screen.findByText('✓ "Loud" added to your sheets')).toBeInTheDocument();
  expect(listEntries().map(e => e.title)).toEqual(['Loud']);
});

it('a storage failure opens the sheet unsaved and shows the storage message', async () => {
  saveSheets('Before');
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === 'fingerscore.library.v1') throw new DOMException('full', 'QuotaExceededError');
    setItem.call(this, k, v);
  });
  renderStart();
  drop(sheetFile('Too much'));
  expect(await screen.findByText('✓ "Too much" opened — it could not be saved in this browser.')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(FULL_MESSAGE);
  expect(screen.getByRole('link', { name: /Open sheet/ })).toHaveAttribute('href', '/sheet');
  expect(listEntries().map(e => e.title)).toEqual(['Before']);
  expect(useApp.getState().doc).toMatchObject({ title: 'Too much', source: { format: 'file', file: 'Too much.fingerscore.json' } });
  expect(useApp.getState().libraryId).toBeNull();
});

it('a .json file larger than 5 MB is refused unread', async () => {
  renderStart();
  const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.json');
  const text = vi.spyOn(big, 'text');
  drop(big);
  expect(await screen.findByRole('alert')).toHaveTextContent('"huge.json" isn\'t a fingerscore sheet.');
  expect(text).not.toHaveBeenCalled();
  expect(listEntries()).toEqual([]);
});

it('a second file is read after a success and after an error', async () => {
  renderStart();
  drop(sheetFile('First'));
  await screen.findByText('✓ "First" added to your sheets');
  drop(new File(['{}'], 'other.json'));
  expect(await screen.findByRole('alert')).toHaveTextContent('"other.json" isn\'t a fingerscore sheet.');
  drop(sheetFile('Second'));
  expect(await screen.findByText('✓ "Second" added to your sheets')).toBeInTheDocument();
  expect(listEntries().map(e => e.title)).toEqual(['Second', 'First']);
});

it('a .json file dropped on a song result is added as a sheet', async () => {
  renderStart();
  await user.upload(screen.getByLabelText(/drop a song/i), demoFile());
  await screen.findByText(/Auld_Lang_Syne.mid — Ready/);
  expect(drop(sheetFile('Over the song'))).toBe(false);
  expect(await screen.findByText('✓ "Over the song" added to your sheets')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Your sheets' })).toHaveTextContent('Over the song');
});

it('a failed delete shows the storage message and keeps the card', async () => {
  saveSheets('Stuck');
  renderStart();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string) {
    if (k === 'fingerscore.library.v1') throw new DOMException('full', 'QuotaExceededError');
  });
  await user.click(screen.getByRole('button', { name: 'Delete Stuck' }));
  expect(within(screen.getByRole('region', { name: 'Your sheets' })).getByRole('alert')).toHaveTextContent(FULL_MESSAGE);
  expect(cardLink('Stuck')).toBeInTheDocument();
});

describe('keyboard focus in the gallery', () => {
  it('after a delete: Undo, then the next card; Undo returns to the restored card', async () => {
    saveSheets('A', 'B', 'C');
    renderStart();
    await user.click(screen.getByRole('button', { name: 'Delete B' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(cardLink('C'));

    await user.click(screen.getByRole('button', { name: 'Delete A' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(document.activeElement).toBe(cardLink('A'));
  });

  it('deleting the last card in the list moves focus to the previous card', async () => {
    saveSheets('A', 'B');
    renderStart();
    await user.click(screen.getByRole('button', { name: 'Delete B' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(cardLink('A'));
  });

  it('deleting the only card moves focus to the drop zone; Undo brings the card back focused', async () => {
    saveSheets('Only');
    renderStart();
    await user.click(screen.getByRole('button', { name: 'Delete Only' }));
    expect(screen.queryByRole('region', { name: 'Your sheets' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(document.activeElement).toBe(cardLink('Only'));

    await user.click(screen.getByRole('button', { name: 'Delete Only' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(screen.getByLabelText(/drop a song or a saved sheet/i));
  });

  it('deleting the only card while the drop zone shows a result moves focus to the page heading', async () => {
    renderStart();
    drop(sheetFile('Dropped'));
    await screen.findByText('✓ "Dropped" added to your sheets');
    await user.click(screen.getByRole('button', { name: 'Delete Dropped' }));
    await user.keyboard('{Escape}');
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(document.activeElement).toBe(h1);
    expect(h1).toHaveAttribute('tabindex', '-1');
  });

  it('Show all moves focus to the first revealed card', async () => {
    saveSheets('S6', 'S5', 'S4', 'S3', 'S2', 'S1');
    renderStart();
    await user.click(screen.getByRole('button', { name: 'Show all 6' }));
    expect(document.activeElement).toBe(cardLink('S2'));
  });

  it('deleting the last revealed card moves focus to the card before it', async () => {
    saveSheets('S6', 'S5', 'S4', 'S3', 'S2', 'S1');
    renderStart();
    await user.click(screen.getByRole('button', { name: 'Show all 6' }));
    await user.click(screen.getByRole('button', { name: 'Delete S1' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(cardLink('S2'));
  });
});
