import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Player } from '../audio/player';
import { buildSchedule, type Schedule } from '../domain/playback';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc, InstId } from '../domain/types';
import { serializeFile } from '../domain/persistence';
import { listEntries, saveEntry } from '../state/library';
import { useApp } from '../state/store';
import { downloadText } from '../ui/download';
import { ToastHost } from '../ui/Toast';
import SheetPage from './SheetPage';

vi.mock('../ui/download', () => ({ downloadText: vi.fn() }));

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

function renderSheet(url = '/sheet') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/sheet" element={<><SheetPage /><Probe /></>} />
        <Route path="*" element={<Probe />} />
      </Routes>
      <ToastHost />
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
  localStorage.clear();
  useApp.setState({ libraryId: null, savedSnapshot: null, saveError: null });
  vi.mocked(downloadText).mockClear();
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
  await user.click(within(alert).getByRole('button', { name: /Use F major \(\+3\)/ }));
  expect(useApp.getState().doc!.shift).toBe(3);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('check 4: key bridge, sounds in D → reads B', async () => {
  open('asax');
  await user.selectOptions(screen.getByLabelText(/Sounds in/), 'D major');
  expect(screen.getByLabelText(/You read/)).toHaveDisplayValue('B major');
});

it('key bridge on a minor song: selects and keys that fit are named minor', () => {
  const base = sampleDoc('asax');
  open('asax', { originalTonicPc: (base.originalTonicPc + 9) % 12, originalMode: 'minor' });
  for (const label of [/Sounds in/, /You read/]) {
    const select = screen.getByLabelText(label) as HTMLSelectElement;
    expect([...select.options].every(o => / minor$/.test(o.text))).toBe(true);
    expect(select.selectedOptions[0].text).toMatch(/ minor$/);
  }
  const fits = screen.getAllByRole('button', { name: /^Sounds .* → you read / });
  expect(fits.length).toBeGreaterThan(0);
  expect(fits.every(b => /Sounds \S+ minor → you read \S+ minor/.test(b.textContent!))).toBe(true);
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
  expect(pill).toHaveAttribute('aria-haspopup', 'dialog');
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

it('the detected card lists time and an editable tempo under its own label', () => {
  open('asax');
  const card = screen.getByRole('region', { name: 'Detected in file' });
  const row = (term: string) => within(card).getByText(term, { selector: 'dt' }).nextElementSibling;
  expect(row('Time')).toHaveTextContent(/^4\/4$/);
  expect(row('Tempo')).toHaveTextContent('♩ = 100');
});

it('simplified notice', () => {
  open('fl', { source: { file: 'a.mid', format: 'MIDI', track: '1', trackCount: 1, simplified: true } });
  expect(screen.getByText(/Rhythm simplified/)).toBeInTheDocument();
});

it('range text', () => {
  open('xc');
  expect(screen.getByText('This song: C4 – C5 · all playable')).toBeInTheDocument();
});

it('range meter: the xaphoon has no extended band; the alto sax has one', () => {
  open('xc');
  expect(screen.queryByText('Extended (hard)')).toBeNull();
  cleanup();
  open('asax');
  expect(screen.getByText('Extended (hard)')).toBeInTheDocument();
});

it('page bar: steps, file chip, no Change track without a song, Print in the File menu', async () => {
  const print = vi.fn();
  vi.stubGlobal('print', print);
  open('asax');
  expect(screen.getByRole('navigation', { name: 'Steps' })).toBeInTheDocument();
  const notes = derive(sampleDoc('asax'), DEFAULT_PREFS).counts.notes;
  expect(screen.getByText(`sample · track 1 Melody of 4 · ${notes} notes`)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Change track' })).toBeNull();
  await user.click(screen.getByRole('button', { name: /File/ }));
  await user.click(screen.getByRole('menuitem', { name: 'Print' }));
  expect(print).toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('save and the File menu', () => {
  it('save status and Save', async () => {
    open('asax');
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(listEntries()).toHaveLength(1);
    await user.click(screen.getByLabelText('Lyrics'));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.keyboard('{Control>}s{/Control}');
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(listEntries()).toHaveLength(1);
  });

  it('a failed save shows the storage message', async () => {
    open('asax');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    spy.mockRestore();
    expect(screen.getByRole('alert')).toHaveTextContent('This browser blocks local storage. Use "Download JSON" instead.');
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  });

  it('file menu: items, keyboard, close', async () => {
    open('asax');
    const btn = screen.getByRole('button', { name: /File/ });
    expect(btn).toHaveAttribute('aria-haspopup', 'menu');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    const menu = screen.getByRole('menu');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getAllByRole('menuitem').slice(0, 4).map(i => i.textContent)).toEqual(['Print', 'Download JSON', 'Open JSON file…', 'New sheet']);
    expect(within(menu).getByText('No saved sheets yet.')).toBeInTheDocument();
    expect(within(menu).getByText(/Sheets are stored only on this device/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(btn).toHaveFocus();
  });

  it('file menu: arrow keys, Home and End move focus; Tab and outside click close', async () => {
    open('asax');
    const btn = screen.getByRole('button', { name: /File/ });
    btn.focus();
    await user.keyboard('{ArrowDown}');
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(items[items.length - 1]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(items[items.length - 1]).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(btn);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByText('Detected in file'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('menu keys do not reach the sheet', async () => {
    open('asax');
    const doc = sampleDoc('asax');
    await user.click(document.querySelector(`[data-hit="${doc.score[2].ev[1].id}"]`)!);
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.keyboard('{ArrowDown}{Home}{End}{ArrowUp}{Escape}');
    expect(document.querySelector('[data-selected="true"]')?.getAttribute('data-ev')).toBe(doc.score[2].ev[1].id);
    expect(fakePlayer.play).not.toHaveBeenCalled();
  });

  it('Print moved into the menu', async () => {
    open('asax');
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    print.mockRestore();
  });

  it('Download JSON writes the file', async () => {
    open('asax');
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Download JSON' }));
    expect(downloadText).toHaveBeenCalledWith('the-water-is-wide.fingerscore.json', expect.stringContaining('"app": "fingerscore"'));
  });

  it('New sheet goes to the start page', async () => {
    open('asax');
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'New sheet' }));
    expect(currentPath()).toBe('/');
  });

  it('Open JSON file: round trip and a foreign file', async () => {
    open('asax');
    const text = serializeFile({ ...sampleDoc('cl'), title: 'From file' });
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Open JSON file…' }));
    await user.upload(screen.getByLabelText('Open JSON file', { selector: 'input' }), new File([text], 'from-file.fingerscore.json', { type: 'application/json' }));
    expect(await screen.findByRole('textbox', { name: 'Sheet title' })).toHaveValue('From file');
    expect(screen.getByText(/from-file\.fingerscore\.json · fingerscore sheet/)).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.queryByText('Change track')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Steps' })).toBeNull();
    await user.upload(screen.getByLabelText('Open JSON file', { selector: 'input' }), new File(['{"name":"x"}'], 'package.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('"package.json" isn\'t a fingerscore sheet.');
    expect(screen.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('From file');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Open JSON file with blocked storage opens the sheet unsaved; the message shows in the page alert line', async () => {
    open('asax');
    const text = serializeFile({ ...sampleDoc('cl'), title: 'Unsaved import' });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    await user.upload(screen.getByLabelText('Open JSON file', { selector: 'input' }), new File([text], 'u.fingerscore.json', { type: 'application/json' }));
    spy.mockRestore();
    expect(await screen.findByRole('textbox', { name: 'Sheet title' })).toHaveValue('Unsaved import');
    expect(screen.getByText(/u\.fingerscore\.json · fingerscore sheet/)).toBeInTheDocument();
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('This browser blocks local storage. Use "Download JSON" instead.');
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).not.toContainElement(alerts[0]);   // not beside Save
    expect(useApp.getState().saveError).toBeNull();
  });

  it('Open JSON file refuses a file larger than 5 MB unread', async () => {
    open('asax');
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.fingerscore.json');
    const text = vi.spyOn(big, 'text');
    await user.upload(screen.getByLabelText('Open JSON file', { selector: 'input' }), big);
    expect(await screen.findByRole('alert')).toHaveTextContent('"huge.fingerscore.json" isn\'t a fingerscore sheet.');
    expect(text).not.toHaveBeenCalled();
  });

  it('saved list: open another sheet, delete with undo', async () => {
    saveEntry({ ...sampleDoc('fl'), title: 'Other' }, null);
    open('asax');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: /File/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('The Water Is Wide').closest('[aria-current="true"]')).not.toBeNull();
    expect(within(menu).getByText('Flute in C · saved just now')).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Open Other' }));
    expect(screen.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('Other');
    expect(screen.getByText(/Other · saved in this browser/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete Other' }));
    expect(listEntries().map(e => e.title)).toEqual(['The Water Is Wide']);
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    expect(screen.getByText('Deleted "Other"')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(listEntries().map(e => e.title)).toContain('Other');
    expect(screen.queryByText('Deleted "Other"')).toBeNull();
  });

  it('undo after deleting the open sheet links it again', async () => {
    open('asax');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete The Water Is Wide' }));
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    expect(listEntries()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(listEntries()).toHaveLength(1);
  });

  it('undo after deleting and editing the open sheet shows unsaved changes; Save updates that entry', async () => {
    open('asax');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const id = useApp.getState().libraryId;
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete The Water Is Wide' }));
    await user.click(screen.getByLabelText('Lyrics'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(listEntries().map(e => e.id)).toEqual([id]);
    expect(listEntries()[0].doc.show.lyrics).toBe(false);
  });

  it('Undo takes focus after Delete and gives it back to the File button', async () => {
    saveEntry({ ...sampleDoc('fl'), title: 'Other' }, null);
    open('asax');
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete Other' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(listEntries().map(e => e.title)).toEqual(['Other']);
    expect(screen.getByRole('button', { name: /File/ })).toHaveFocus();
  });

  it('a failed Undo shows the storage message', async () => {
    saveEntry({ ...sampleDoc('fl'), title: 'Other' }, null);
    open('asax');
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete Other' }));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    spy.mockRestore();
    expect(screen.getByRole('alert')).toHaveTextContent('This browser blocks local storage. Use "Download JSON" instead.');
    expect(listEntries()).toHaveLength(0);
  });

  it('undo does not link a sheet loaded after the delete', async () => {
    open('asax');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete The Water Is Wide' }));
    act(() => useApp.getState().setDoc({ ...sampleDoc('fl'), title: 'New song' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(listEntries()).toHaveLength(1);
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  });

  it('the menu reads the library each time it opens', async () => {
    open('asax');
    await user.click(screen.getByRole('button', { name: /File/ }));
    expect(within(screen.getByRole('menu')).getByText('No saved sheets yet.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    saveEntry({ ...sampleDoc('fl'), title: 'Elsewhere' }, null);
    await user.click(screen.getByRole('button', { name: /File/ }));
    expect(within(screen.getByRole('menu')).getByText('Elsewhere')).toBeInTheDocument();
  });

  it('/sheet?id opens a saved sheet without a current doc; an unknown id goes to the start page', async () => {
    const r = saveEntry({ ...sampleDoc('cl'), title: 'Linked' }, null);
    if (!r.ok) throw new Error(r.message);
    useApp.setState({ doc: null });
    renderSheet(`/sheet?id=${r.entry.id}`);
    expect(await screen.findByRole('textbox', { name: 'Sheet title' })).toHaveValue('Linked');
    expect(currentPath()).toBe('/sheet');
    cleanup();
    useApp.setState({ doc: null });
    renderSheet('/sheet?id=nope');
    expect(currentPath()).toBe('/');
  });
});

describe('playback', () => {
  it('Play starts the player, Stop stops it', async () => {
    open('asax');
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play).not.toHaveAttribute('aria-pressed');   // the label swap says the state
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    await user.click(play);
    expect(fakePlayer.play).toHaveBeenCalledTimes(1);
    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop).not.toHaveAttribute('aria-pressed');
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

  it('shows an alert when the browser cannot play', async () => {
    open('asax');
    fakePlayer.play.mockImplementation(() => { throw new Error('no AudioContext'); });
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Playback is not available in this browser.');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('tempo slider writes the tempo', () => {
    open('asax');
    const slider = screen.getByLabelText(/♩ =/);
    expect(slider).toHaveAttribute('min', '40');
    expect(slider).toHaveAttribute('max', '200');
  });
});

describe('select a note and play from there', () => {
  const doc = sampleDoc('asax');
  const name = (id: string) => derive(doc, DEFAULT_PREFS).byId[id].spelled.name;
  const hit = (id: string) => document.querySelector(`[data-hit="${id}"]`)!;
  const selected = () => document.querySelector('[data-selected="true"]')?.getAttribute('data-ev') ?? null;
  const sheet = () => screen.getByRole('group', { name: 'Sheet music. Arrow keys select a note, Enter plays from it.' });
  const live = () => sheet().querySelector('[aria-live="polite"]')!;
  const tied = doc.score[1].ev[1].id;               // starts a chain over the next two events
  const afterChain = doc.score[2].ev[1].id;          // bar 2, after the chain's continuations

  it('the sheet is a focusable group with a polite live line', () => {
    open('asax');
    expect(sheet()).toHaveAttribute('tabindex', '0');
    expect(live()).toHaveTextContent('');
  });

  it('clicking a note selects it and renames Play; clicking it again clears', async () => {
    open('asax');
    await user.click(hit(afterChain));
    expect(selected()).toBe(afterChain);
    expect(screen.getByRole('button', { name: 'Play from selected' })).toBeInTheDocument();
    expect(live()).toHaveTextContent(`Selected: ${name(afterChain)}, bar 2`);
    await user.click(hit(afterChain));
    expect(selected()).toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(live()).toHaveTextContent('Selection cleared');
  });

  it('the pickup is announced as the pickup bar', async () => {
    open('asax');
    await user.click(hit(doc.score[0].ev[0].id));
    expect(live()).toHaveTextContent(`Selected: ${name(doc.score[0].ev[0].id)}, pickup bar`);
  });

  it('Play from selected plays a sliced schedule; the selection stays after Stop', async () => {
    open('asax');
    await user.click(hit(afterChain));
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    await user.click(screen.getByRole('button', { name: 'Play from selected' }));
    const sched = fakePlayer.play.mock.calls[0][0] as Schedule;
    expect(sched.totalTicks).toBeLessThan(buildSchedule(doc).totalTicks);
    expect(sched.marks[0]).toEqual({ evId: afterChain, start: 0 });
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    fakePlayer.stop.mockImplementation(() => { fakePlayer.playing = false; fakePlayer.play.mock.calls[0][2](null); });
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(selected()).toBe(afterChain);
    expect(screen.getByRole('button', { name: 'Play from selected' })).toBeInTheDocument();
  });

  it('Play without a selection plays the whole song', async () => {
    open('asax');
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(fakePlayer.play.mock.calls[0][0]).toEqual(buildSchedule(doc));
  });

  it('Esc clears the selection', async () => {
    open('asax');
    await user.click(hit(afterChain));
    expect(sheet()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(selected()).toBeNull();
    expect(live()).toHaveTextContent('Selection cleared');
  });

  it('arrow keys move through events in score order, skipping tied continuations', async () => {
    open('asax');
    sheet().focus();
    await user.keyboard('{ArrowRight}');
    expect(selected()).toBe(doc.score[0].ev[0].id);
    await user.click(hit(tied));
    await user.keyboard('{ArrowRight}');
    expect(selected()).toBe(afterChain);
    await user.keyboard('{ArrowLeft}');
    expect(selected()).toBe(tied);
    await user.keyboard('{End}');
    const lastBar = doc.score[doc.score.length - 1].ev;
    expect(selected()).toBe(lastBar[lastBar.length - 1].id);
    await user.keyboard('{Home}');
    expect(selected()).toBe(doc.score[0].ev[0].id);
    await user.keyboard('{Escape}{ArrowLeft}');
    expect(selected()).toBe(lastBar[lastBar.length - 1].id);
  });

  it('Enter plays from the selection, and stops while playing', async () => {
    open('asax');
    await user.click(hit(afterChain));
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    await user.keyboard('{Enter}');
    expect(fakePlayer.play).toHaveBeenCalledTimes(1);
    expect((fakePlayer.play.mock.calls[0][0] as Schedule).marks[0].evId).toBe(afterChain);
    await user.keyboard(' ');
    expect(fakePlayer.stop).toHaveBeenCalled();
  });

  it('keys typed in the title do not move the selection or play', async () => {
    open('asax');
    await user.click(hit(afterChain));
    await user.click(screen.getByPlaceholderText('Add a title'));
    await user.keyboard('{ArrowRight}{ArrowLeft}{Home}{End} x{Enter}{Escape}');
    expect(selected()).toBe(afterChain);
    expect(fakePlayer.play).not.toHaveBeenCalled();
  });

  it('the selection survives an instrument change and clears when another sheet loads', async () => {
    open('asax');
    await user.click(hit(afterChain));
    await user.selectOptions(screen.getByLabelText(/Fingerings for/), 'cl');
    expect(selected()).toBe(afterChain);
    act(() => useApp.getState().setDoc({ ...sampleDoc('fl'), source: { ...doc.source, file: 'other.mid' } }));
    expect(selected()).toBeNull();
  });
});

it('redirects without a doc', () => {
  useApp.setState({ doc: null });
  renderSheet();
  expect(currentPath()).toBe('/');
});
