import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { writeMidi, type MidiEvent } from 'midi-file';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { sampleDoc } from '../domain/fixture';
import { serializeFile, serializeLibrary } from '../domain/persistence';
import { DEFAULT_PREFS } from '../domain/transpose';
import { FULL_MESSAGE, listEntries, saveEntry } from '../state/library';
import { useApp } from '../state/store';
import { ToastHost } from '../shell/Toast';
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

/** The bin asks first: "Delete?" [Delete] [Keep]. */
async function deleteSheet(title: string) {
  await user.click(screen.getByRole('button', { name: `Delete ${title}` }));
  await user.click(screen.getByRole('button', { name: 'Delete' }));
}

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
  await u.upload(screen.getByLabelText(/drop a song/i), new File(['x'], 'tune.wav'));
  expect(await screen.findByRole('alert')).toHaveTextContent('"tune.wav" is not a format fingerscore reads.');
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
  expect(drop(new File(['x'], 'tune.wav'))).toBe(false);
  expect(await screen.findByRole('alert')).toHaveTextContent('"tune.wav" is not a format fingerscore reads.');
});

it('a file dropped on the error state is read', async () => {
  renderStart();
  expect(drop(new File(['x'], 'tune.wav'))).toBe(false);
  await screen.findByRole('alert');
  expect(drop(demoFile())).toBe(false);
  expect(await screen.findByText(/Auld_Lang_Syne.mid — Ready/)).toBeInTheDocument();
  expect(within(screen.getByTestId('drop-zone')).getByRole('status')).toHaveTextContent('Ready');
});

it('a song longer than 2000 bars shows the length message after Continue', async () => {
  renderStart();
  await user.upload(screen.getByLabelText(/drop a song/i), new File(['X:1\nM:4/4\nL:1/4\nK:C\nZ100000|C|\n'], 'long.abc'));
  await user.click(await screen.findByRole('button', { name: 'Continue →' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('"long.abc" is longer than 2000 bars and can\'t be opened.');
  expect(currentPath()).toBe('/');
});

it('subline names the four song formats', () => {
  renderStart();
  expect(screen.getByText('Upload a MIDI, MusicXML, MuseScore or ABC file. We transpose it to a key that suits your instrument and add a fingering chart under every note.')).toBeInTheDocument();
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

it('the strip lists the five newest sheets, newest first; All 6 opens the library view with every sheet', async () => {
  for (let i = 1; i <= 6; i++) saveEntry({ ...sampleDoc('asax'), title: `Sheet ${i}` }, null, new Date(Date.UTC(2026, 10, 22, 10, i)));
  renderStart(); const g = () => screen.getByRole('region', { name: 'Your sheets' });
  const titles = () => within(g()).getAllByRole('link', { name: /^Sheet \d/ });
  expect(titles().map(a => a.textContent!.slice(0, 7))).toEqual(['Sheet 6', 'Sheet 5', 'Sheet 4', 'Sheet 3', 'Sheet 2']);
  expect(titles()[0]).toHaveAttribute('href', expect.stringMatching(/^\/sheet\?id=/)); expect(titles()[0]).toHaveTextContent('Alto sax in E♭');
  expect(g().querySelectorAll('li')).toHaveLength(5);
  await user.click(within(g()).getByRole('button', { name: 'All 6' }));
  expect(within(g()).getByText('6 sheets saved in this browser')).toBeInTheDocument(); expect(titles()).toHaveLength(6);
  expect(within(g()).getAllByText(/^Alto sax in E♭ · [A-G][♯♭]? major$/)).toHaveLength(6);
});

it('one sheet is one bar and four empty bars, with All 1', () => {
  saveEntry({ ...sampleDoc('asax'), title: 'Only' }, null); renderStart(); const g = screen.getByRole('region', { name: 'Your sheets' });
  expect(within(g).getAllByRole('listitem')).toHaveLength(1); expect(g.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(4);
  expect(within(g).getByRole('button', { name: 'All 1' })).toBeInTheDocument();
});

it('a title and its instrument line carry their whole text as a tooltip, in the strip and in the library view', async () => {
  const long = 'A very long title that will not fit into one bar';
  saveEntry({ ...sampleDoc('asax'), title: long }, null); renderStart();
  expect(screen.getByText(long).closest('a')).toHaveAttribute('title', long);   // the whole bar link: title and incipit
  expect(screen.getByText(long).closest('a')!.querySelector('svg')).not.toBeNull();
  expect(screen.getByText(/^Alto sax in E♭ · just now$/)).toHaveAttribute('title', 'Alto sax in E♭ · just now');
  await user.click(screen.getByRole('button', { name: 'All 1' }));
  expect(screen.getByRole('link', { name: long })).toHaveAttribute('title', long);
  const meta = screen.getByText(/^Alto sax in E♭ · [A-G][♯♭]? major$/); expect(meta).toHaveAttribute('title', meta.textContent);
});

it('Open and Play link to the sheet; Play opens it in Play mode', () => {
  saveEntry({ ...sampleDoc('asax'), title: 'Tune' }, null); renderStart(); const id = listEntries()[0].id;
  expect(screen.getByRole('link', { name: 'Open Tune' })).toHaveAttribute('href', `/sheet?id=${id}`);
  expect(screen.getByRole('link', { name: 'Play Tune' })).toHaveAttribute('href', `/sheet?id=${id}&mode=play`);
});

it('delete asks first: Keep and Escape leave the sheet and give focus back to the bin', async () => {
  saveEntry({ ...sampleDoc('asax'), title: 'Stay' }, null); renderStart();
  const bin = () => screen.getByRole('button', { name: 'Delete Stay' });
  await user.click(bin());
  expect(screen.getByRole('group', { name: 'Delete Stay?' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  expect(screen.queryByRole('link', { name: 'Open Stay' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Keep' })); expect(bin()).toHaveFocus(); expect(listEntries()).toHaveLength(1);
  await user.click(bin()); await user.keyboard('{Escape}'); expect(bin()).toHaveFocus(); expect(listEntries()).toHaveLength(1);
  expect(screen.queryByText(/^Deleted/)).toBeNull();
});

it('delete with undo', async () => {
  saveEntry({ ...sampleDoc('asax'), title: 'Keep' }, null); saveEntry({ ...sampleDoc('cl'), title: 'Drop me' }, null); renderStart();
  await deleteSheet('Drop me'); expect(screen.queryByText('Drop me')).toBeNull(); expect(listEntries()).toHaveLength(1);
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
  await deleteSheet('Open one');
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

it('the count is singular for one sheet', async () => {
  saveSheets('Only');
  renderStart();
  await user.click(screen.getByRole('button', { name: 'All 1' }));
  expect(screen.getByText('1 sheet saved in this browser')).toBeInTheDocument();
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

it('a .json file larger than a library may be (20 MB) is refused unread', async () => {
  renderStart();
  const big = new File(['{}'], 'huge.json');
  Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 });
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
  await deleteSheet('Stuck');
  expect(within(screen.getByRole('region', { name: 'Your sheets' })).getByRole('alert')).toHaveTextContent(FULL_MESSAGE);
  expect(cardLink('Stuck')).toBeInTheDocument();
});

it('the gallery storage alert clears on the next library change: a successful delete, or a drop-zone import', async () => {
  saveSheets('Stuck', 'Other');
  renderStart();
  const region = () => screen.getByRole('region', { name: 'Your sheets' });
  const fail = () => vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string) {
    if (k === 'fingerscore.library.v1') throw new DOMException('full', 'QuotaExceededError');
  });

  let spy = fail();
  await deleteSheet('Stuck');
  expect(within(region()).getByRole('alert')).toHaveTextContent(FULL_MESSAGE);
  spy.mockRestore();
  drop(sheetFile('Fresh'));
  await screen.findByText('✓ "Fresh" added to your sheets');
  expect(within(region()).queryByRole('alert')).toBeNull();

  spy = fail();
  await deleteSheet('Stuck');
  expect(within(region()).getByRole('alert')).toHaveTextContent(FULL_MESSAGE);
  spy.mockRestore();
  await deleteSheet('Other');
  expect(within(region()).queryByRole('alert')).toBeNull();
});

describe('keyboard focus in the gallery', () => {
  it('after a delete: Undo, then the next card; Undo returns to the restored card', async () => {
    saveSheets('A', 'B', 'C');
    renderStart();
    await deleteSheet('B');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(cardLink('C'));

    await deleteSheet('A');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(document.activeElement).toBe(cardLink('A'));
  });

  it('deleting the last card in the list moves focus to the previous card', async () => {
    saveSheets('A', 'B');
    renderStart();
    await deleteSheet('B');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(cardLink('A'));
  });

  it('deleting the only card moves focus to the drop zone; Undo brings the card back focused', async () => {
    saveSheets('Only');
    renderStart();
    await deleteSheet('Only');
    expect(screen.queryByRole('region', { name: 'Your sheets' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(document.activeElement).toBe(cardLink('Only'));

    await deleteSheet('Only');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(screen.getByLabelText(/drop a song or a saved sheet/i));
  });

  it('deleting the only card while the drop zone shows a result moves focus to the page heading', async () => {
    renderStart();
    drop(sheetFile('Dropped'));
    await screen.findByText('✓ "Dropped" added to your sheets');
    await deleteSheet('Dropped');
    await user.keyboard('{Escape}');
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(document.activeElement).toBe(h1);
    expect(h1).toHaveAttribute('tabindex', '-1');
  });

  it('All N moves focus to the search field; Close gives it back to All N', async () => {
    saveSheets('S6', 'S5', 'S4', 'S3', 'S2', 'S1');
    renderStart();
    await user.click(screen.getByRole('button', { name: 'All 6' }));
    expect(screen.getByRole('searchbox', { name: 'Search your sheets' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'All 6' })).toHaveFocus();
  });

  it('deleting the last row of the library view moves focus to the row before it', async () => {
    saveSheets('S6', 'S5', 'S4', 'S3', 'S2', 'S1');
    renderStart();
    await user.click(screen.getByRole('button', { name: 'All 6' }));
    await deleteSheet('S1');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(cardLink('S2'));
  });

  it('Undo of a sheet beyond the strip opens the library view on it', async () => {
    saveSheets('S6', 'S5', 'S4', 'S3', 'S2', 'S1');
    renderStart();
    await user.click(screen.getByRole('button', { name: 'All 6' }));
    await deleteSheet('S1');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('searchbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('6 sheets saved in this browser')).toBeInTheDocument();
    expect(document.activeElement).toBe(cardLink('S1'));
  });
});

describe('the library view', () => {
  const open = async () => { await user.click(screen.getByRole('button', { name: /^All \d+$/ })); };
  const rows = () => within(screen.getByRole('region', { name: 'Your sheets' })).getAllByRole('listitem').map(li => within(li).getAllByRole('link')[0].textContent);
  function seed() {
    saveEntry({ ...sampleDoc('cl'), title: 'Banana' }, null, new Date(Date.UTC(2026, 10, 22, 10, 1)));
    saveEntry({ ...sampleDoc('asax'), title: 'cherry' }, null, new Date(Date.UTC(2026, 10, 22, 10, 2)));
    saveEntry({ ...sampleDoc('tsax'), title: 'Apple' }, null, new Date(Date.UTC(2026, 10, 22, 10, 3)));
  }

  it('sorts by save time, title or instrument', async () => {
    seed(); renderStart(); await open();
    expect(rows()).toEqual(['Apple', 'cherry', 'Banana']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Title A–Z');
    expect(rows()).toEqual(['Apple', 'Banana', 'cherry']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Instrument');
    expect(rows()).toEqual(['cherry', 'Banana', 'Apple']);
  });

  it('filters by instrument family: one chip per family that has sheets, with counts', async () => {
    seed(); renderStart(); await open();
    const chips = within(screen.getByRole('group', { name: 'Filter by instrument' }));
    expect(chips.getAllByRole('button').map(b => b.textContent)).toEqual(['All 3', 'Saxophone 2', 'Clarinet 1']);
    expect(chips.getByRole('button', { name: 'All 3' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(chips.getByRole('button', { name: 'Saxophone 2' }));
    expect(rows()).toEqual(['Apple', 'cherry']);
    expect(chips.getByRole('button', { name: 'Saxophone 2' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(chips.getByRole('button', { name: 'All 3' }));
    expect(rows()).toHaveLength(3);
  });

  it('searches titles and instruments; no match says so; Close resets the search', async () => {
    seed(); renderStart(); await open();
    await user.type(screen.getByRole('searchbox'), 'clarinet');
    expect(rows()).toEqual(['Banana']);
    await user.clear(screen.getByRole('searchbox')); await user.type(screen.getByRole('searchbox'), 'APP');
    expect(rows()).toEqual(['Apple']);
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No sheets match your search.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' })); await open();
    expect(screen.getByRole('searchbox')).toHaveValue(''); expect(rows()).toHaveLength(3);
  });

  it('deleting the last sheet closes the view and hides the section', async () => {
    saveSheets('Only'); renderStart(); await open();
    await deleteSheet('Only');
    expect(screen.queryByRole('region', { name: 'Your sheets' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'All 1' })).toBeInTheDocument();
  });

  it('Undo clears a search that would hide the restored sheet', async () => {
    seed(); renderStart(); await open();
    await deleteSheet('Banana');
    await user.type(screen.getByRole('searchbox'), 'apple');
    expect(rows()).toEqual(['Apple']);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('searchbox')).toHaveValue(''); expect(rows()).toHaveLength(3);
    expect(document.activeElement).toBe(cardLink('Banana'));
  });

  it('Export all as JSON downloads the library; Import… adds the sheets of that file', async () => {
    seed(); renderStart(); await open();
    let exported: Blob | null = null;
    const createObjectURL = vi.fn((b: Blob) => { exported = b; return 'blob:x'; });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: 'Export all as JSON' }));
    expect(click).toHaveBeenCalled();
    const text = await exported!.text();
    expect(JSON.parse(text)).toMatchObject({ app: 'fingerscore', format: 1, kind: 'library', sheets: [{ title: 'Apple', inst: 'Tenor sax in B♭', fam: 'Saxophone' }, { title: 'cherry' }, { title: 'Banana', key: expect.stringMatching(/ major$/) }] });

    await user.upload(screen.getByLabelText('Import sheets'), new File([text], 'fingerscore-library.json', { type: 'application/json' }));
    expect(await screen.findByText('✓ 3 sheets added to your sheets')).toBeInTheDocument();
    expect(listEntries()).toHaveLength(6); expect(new Set(listEntries().map(e => e.id)).size).toBe(6);
    expect(screen.getByText('6 sheets saved in this browser')).toBeInTheDocument();

    await user.upload(screen.getByLabelText('Import sheets'), sheetFile('Single'));
    expect(await screen.findByText('✓ "Single" added to your sheets')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Import sheets'), new File(['{"name":"x"}'], 'foreign.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('"foreign.json" isn\'t a fingerscore sheet.');
    expect(listEntries()).toHaveLength(7);
  });

  it('a library file dropped on the zone adds every sheet and offers Show library', async () => {
    renderStart();
    const text = serializeLibrary([1, 2].map(n => ({ title: `L${n}`, inst: '', key: '', fam: '', savedAt: `2026-11-2${n}T10:00:00.000Z`, doc: { ...sampleDoc('fl'), title: `L${n}` } })));
    drop(new File([text], 'fingerscore-library.json', { type: 'application/json' }));
    expect(await screen.findByText('✓ 2 sheets added to your sheets')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open sheet/ })).toBeNull();
    expect(listEntries().map(e => e.title)).toEqual(['L2', 'L1']);
    await user.click(screen.getByRole('button', { name: 'Show library' }));
    expect(screen.getByText('2 sheets saved in this browser')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search your sheets' })).toHaveFocus();
    expect(screen.getByText('Drop a song or a saved sheet here')).toBeInTheDocument();
  });
});
