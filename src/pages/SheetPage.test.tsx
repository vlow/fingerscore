import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Player } from '../audio/player';
import { buildSchedule, type Schedule } from '../domain/playback';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc, InstId } from '../domain/types';
import { addBarAfter, locate, toggleRest } from '../domain/edit';
import { inst } from '../domain/instruments';
import { mod12, signatureLetters } from '../domain/keys';
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
  useApp.setState({ doc: { ...sampleDoc(id), ...patch }, instId: id, song: null, prefs: DEFAULT_PREFS, past: [], future: [] });
  return renderSheet();
};
/** The Undo button of the "Deleted …" toast (the page bar has its own Undo for the document). */
const toastUndo = () => within(screen.getByText(/^Deleted "/).parentElement!).getByRole('button', { name: 'Undo' });

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

  it('Ctrl+S saves on a non-Latin keyboard layout (matched by key code)', () => {
    open('asax');
    const e = new KeyboardEvent('keydown', { key: 'ы', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { window.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
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

  it('the chip of a sheet opened from the library shows the current title', async () => {
    const r = saveEntry({ ...sampleDoc('fl'), title: 'Old name' }, null);
    renderSheet(`/sheet?id=${r.ok ? r.entry.id : ''}`);
    expect(await screen.findByText(/^Old name · saved in this browser/)).toBeInTheDocument();
    const title = screen.getByRole('textbox', { name: 'Sheet title' });
    await user.clear(title);
    await user.type(title, 'New name');
    expect(screen.getByText(/^New name · saved in this browser/)).toBeInTheDocument();
    await user.clear(title);
    expect(screen.getByText(/^Untitled sheet · saved in this browser/)).toBeInTheDocument();
  });

  it('saved list: open another sheet, delete with undo', async () => {
    saveEntry({ ...sampleDoc('fl'), title: 'Other' }, null);
    open('asax');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: /File/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Open The Water Is Wide (currently open)' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Other \(currently open\)/ })).toBeNull();
    expect(menu.querySelector('[aria-current]')).toBeNull();
    expect(within(menu).getByText('Flute in C · saved just now')).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Open Other' }));
    expect(screen.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('Other');
    expect(screen.getByText(/Other · saved in this browser/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete Other' }));
    expect(listEntries().map(e => e.title)).toEqual(['The Water Is Wide']);
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    expect(screen.getByText('Deleted "Other"')).toBeInTheDocument();
    await user.click(toastUndo());
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
    await user.click(toastUndo());
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
    await user.click(toastUndo());
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
    expect(toastUndo()).toHaveFocus();
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
    await user.click(toastUndo());
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
    await user.click(toastUndo());
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

describe('modes, undo and redo', () => {
  const doc = sampleDoc('asax');
  const events = derive(doc, DEFAULT_PREFS).events;
  const firstEventId = () => events[0].id;
  const hit = (id: string) => document.querySelector(`[data-hit="${id}"]`)!;
  const clickEvent = (id: string) => user.click(hit(id));
  const selected = () => document.querySelector('[data-selected="true"]')?.getAttribute('data-ev') ?? null;
  const sheet = () => screen.getByRole('group', { name: 'Sheet music. Arrow keys select a note, Enter plays from it.' });
  const syllable = (k: number) => !events[k].rest && !events[k].tiedFrom;
  const tied = doc.score[1].ev[1].id;                // starts a chain over the next two events
  const afterChain = doc.score[2].ev[1].id;
  /** The sample with the first plain note after the tie chain turned into a rest, the note after it, and that rest. */
  const withRest = () => {
    const from = events.findIndex(e => e.id === afterChain);
    const k = events.findIndex((e, j) => j > from && syllable(j) && !e.tieTo);
    const restDoc = toggleRest(doc, events[k].id)!;
    const next = events.find((_, j) => j > k && syllable(j))!;
    return { score: restDoc.score, rest: events[k].id, next: next.id };
  };
  const press = (init: KeyboardEventInit) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    act(() => { (document.activeElement ?? document.body).dispatchEvent(e); });
    return e;
  };

  it('mode switch: four modes, hint, View by default', async () => {
    open('asax');
    const g = screen.getByRole('radiogroup', { name: 'Mode' });
    expect(within(g).getAllByRole('radio').map(r => r.textContent)).toEqual(['View', 'Edit notes', 'Lyrics', 'Chords']);
    expect(within(g).getByRole('radio', { name: 'View' })).toBeChecked();
    expect(screen.getByText('Click a note to choose where playback starts.')).toBeInTheDocument();
    await user.click(within(g).getByRole('radio', { name: 'Edit notes' }));
    expect(within(g).getByRole('radio', { name: 'Edit notes' })).toBeChecked();
    expect(within(g).getByRole('radio', { name: 'View' })).not.toBeChecked();
    expect(screen.getByText('Click a note or rest, then change its pitch or length. Arrow keys work too.')).toBeInTheDocument();
    await user.click(within(g).getByRole('radio', { name: 'Lyrics' }));
    expect(screen.getByText('Click a note and type. Enter moves to the next note.')).toBeInTheDocument();
    await user.click(within(g).getByRole('radio', { name: 'Chords' }));
    expect(screen.getByText('Click a note or rest and type a chord, for example Am7 or F♯m7♭5.')).toBeInTheDocument();
  });

  it('mode switch: one tab stop, arrow keys move the choice', async () => {
    open('asax');
    const radios = within(screen.getByRole('radiogroup', { name: 'Mode' })).getAllByRole('radio');
    expect(radios.map(r => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    radios[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(radios[1]).toBeChecked();
    expect(radios[1]).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(radios[3]).toBeChecked();
    expect(radios[3]).toHaveFocus();
  });

  it('the mode switch sits left of the playback controls', () => {
    open('asax');
    const modes = screen.getByRole('radiogroup', { name: 'Mode' });
    const playback = screen.getByRole('group', { name: 'Playback' });
    expect(modes.compareDocumentPosition(playback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a panel appears under the selected note\'s system in edit modes only', async () => {
    open('asax');
    const first = firstEventId();
    await clickEvent(first);
    expect(screen.queryByRole('group', { name: /panel/ })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Edit notes' }));
    const panel = screen.getByRole('group', { name: 'Edit notes panel' });
    expect(panel.closest('[data-print-hide]')).not.toBeNull();
    const system = document.querySelector(`[data-hit="${first}"]`)!.closest('svg')!.parentElement!;
    expect(system.nextElementSibling).toContainElement(panel);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: /panel/ })).toBeNull();
    expect(selected()).toBeNull();
  });

  it('the panel follows the selection to a later system and names the mode', async () => {
    open('asax');
    await user.click(screen.getByRole('radio', { name: 'Chords' }));
    const last = events[events.length - 1].id;
    await clickEvent(last);
    const panel = screen.getByRole('group', { name: 'Chords panel' });
    const systems = screen.getAllByTestId('system');
    expect(systems[systems.length - 1].parentElement!.nextElementSibling).toContainElement(panel);
    expect(screen.getAllByRole('group', { name: /panel/ })).toHaveLength(1);
  });

  it('undo and redo buttons and shortcuts', async () => {
    open('asax');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    await user.click(screen.getByLabelText('Lyrics', { selector: 'input[type=checkbox]' }));
    expect(undo).toBeEnabled();
    await user.click(undo);
    expect(useApp.getState().doc!.show.lyrics).toBe(true);
    expect(redo).toBeEnabled();
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(useApp.getState().doc!.show.lyrics).toBe(false);
    await user.keyboard('{Control>}z{/Control}');
    expect(useApp.getState().doc!.show.lyrics).toBe(true);
    await user.keyboard('{Control>}y{/Control}');
    expect(useApp.getState().doc!.show.lyrics).toBe(false);
  });

  it('undo and redo sit left of the save status, with the shortcut in the tooltip', () => {
    open('asax');
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveAttribute('title', 'Undo (Ctrl+Z)');
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveAttribute('title', 'Redo (Ctrl+Shift+Z)');
    expect(undo.compareDocumentPosition(screen.getByText('Not saved yet')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shortcuts match the key code on other layouts, prevent the default, and ⌘ works too', () => {
    open('asax');
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    const z = press({ key: 'я', code: 'KeyZ', ctrlKey: true });
    expect(z.defaultPrevented).toBe(true);
    expect(useApp.getState().doc!.tempo).toBe(100);
    const y = press({ key: 'н', code: 'KeyY', ctrlKey: true });
    expect(y.defaultPrevented).toBe(true);
    expect(useApp.getState().doc!.tempo).toBe(120);
    press({ key: 'z', code: 'KeyZ', metaKey: true });
    expect(useApp.getState().doc!.tempo).toBe(100);
    press({ key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true });
    expect(useApp.getState().doc!.tempo).toBe(120);
  });

  it('on a German layout the Z key undoes although its code is KeyY', () => {
    open('asax');
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    press({ key: 'z', code: 'KeyY', ctrlKey: true });
    expect(useApp.getState().doc!.tempo).toBe(100);
    press({ key: 'y', code: 'KeyZ', ctrlKey: true });
    expect(useApp.getState().doc!.tempo).toBe(120);
  });

  it('Alt or a plain Z does not undo', () => {
    open('asax');
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    expect(press({ key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(press({ key: 'z', code: 'KeyZ' }).defaultPrevented).toBe(false);
    expect(useApp.getState().doc!.tempo).toBe(120);
  });

  it('typing a title is one undo step and Ctrl+Z works inside the field', async () => {
    open('asax');
    const t = screen.getByRole('textbox', { name: 'Sheet title' });
    await user.clear(t);
    await user.type(t, 'Waly');
    await user.keyboard('{Control>}z{/Control}');
    expect(t).toHaveValue('The Water Is Wide');
    expect(t).toHaveFocus();
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(t).toHaveValue('Waly');
  });

  it('subtitle edits are one step; the tempo slider coalesces', async () => {
    open('asax');
    const sub = screen.getByRole('textbox', { name: 'Sheet subtitle' });
    await user.type(sub, 'ab');
    const slider = screen.getByLabelText(/♩ =/);
    fireEvent.change(slider, { target: { value: '101' } });
    fireEvent.change(slider, { target: { value: '102' } });
    expect(useApp.getState().doc!.tempo).toBe(102);
    expect(useApp.getState().past).toHaveLength(2);
    await user.keyboard('{Control>}z{/Control}');
    expect(useApp.getState().doc!.tempo).toBe(100);
    await user.keyboard('{Control>}z{/Control}');
    expect(useApp.getState().doc!.subtitle).toBe(doc.subtitle);
  });

  it('Ctrl+Z while the toast\'s Undo has focus undoes the document, not the delete', async () => {
    saveEntry({ ...sampleDoc('fl'), title: 'Other' }, null);
    open('asax');
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    await user.click(screen.getByRole('button', { name: /File/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete Other' }));
    expect(toastUndo()).toHaveFocus();
    await user.keyboard('{Control>}z{/Control}');
    expect(useApp.getState().doc!.tempo).toBe(100);
    expect(listEntries()).toHaveLength(0);
    expect(screen.getByText('Deleted "Other"')).toBeInTheDocument();
  });

  it('lyrics mode shows lyrics even when the toggle is off; chords mode shows chords', async () => {
    open('xc', { show: { fingerings: true, chords: false, lyrics: false, raiseExtensions: true } });
    expect(screen.queryByText('wat-')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    expect(screen.getByText('wat-')).toBeInTheDocument();
    expect(useApp.getState().doc!.show.lyrics).toBe(false);
    expect(screen.getByLabelText('Lyrics', { selector: 'input[type=checkbox]' })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Chords' }));
    expect(document.querySelectorAll('[data-chord]').length).toBeGreaterThan(0);
    expect(screen.queryByText('wat-')).toBeNull();
    expect(useApp.getState().doc!.show.chords).toBe(false);
    expect(useApp.getState().past).toHaveLength(0);
  });

  it('undo clears a selection whose note is gone', async () => {
    open('asax');
    await clickEvent(afterChain);
    let added = '';
    act(() => {
      const st = useApp.getState();
      const r = addBarAfter(st.doc!, 2);
      added = r.selectId;
      st.applyEdit(r.doc);
    });
    await clickEvent(added);
    expect(selected()).toBe(added);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(document.querySelector('[data-selected]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(document.querySelector(`[data-hit="${added}"]`)).not.toBeNull();
    expect(document.querySelector('[data-selected]')).toBeNull();
  });

  it('undo keeps a selection whose note still exists', async () => {
    open('asax');
    await clickEvent(afterChain);
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    await user.keyboard('{Control>}z{/Control}');
    expect(selected()).toBe(afterChain);
  });

  it('play from selected still works in every mode', async () => {
    open('asax');
    for (const mode of ['View', 'Edit notes', 'Lyrics', 'Chords']) {
      await user.click(screen.getByRole('radio', { name: mode }));
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
      await clickEvent(afterChain);
      expect(selected()).toBe(afterChain);
      expect(screen.getByRole('button', { name: 'Play from selected' })).toBeInTheDocument();
      await clickEvent(afterChain);
      expect(selected()).toBeNull();
    }
  });

  it('arrow keys include tied continuations in Edit notes and Chords mode', async () => {
    const k = events.findIndex(e => e.id === tied);
    for (const mode of ['Edit notes', 'Chords']) {
      open('asax');
      await user.click(screen.getByRole('radio', { name: mode }));
      await clickEvent(tied);
      await user.keyboard('{ArrowRight}');
      expect(selected()).toBe(events[k + 1].id);
      expect(events[k + 1].tiedFrom).toBe(true);
      await user.keyboard('{ArrowLeft}');
      expect(selected()).toBe(tied);
      cleanup();
    }
  });

  it('Lyrics mode: arrows and clicks land on notes that can carry a syllable', async () => {
    const r = withRest();
    open('asax', { score: r.score });
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    await clickEvent(r.rest);
    expect(selected()).toBe(r.next);
    const k = events.findIndex(e => e.id === tied);
    await clickEvent(events[k + 1].id);   // a tied continuation
    expect(selected()).toBe(events.find((_, j) => j > k && syllable(j))!.id);
    sheet().focus();
    await user.keyboard('{Home}');
    const firstNote = events.find((_, j) => syllable(j))!.id;
    expect(selected()).toBe(firstNote);
    for (let n = 0; n < 6; n++) {
      await user.keyboard('{ArrowRight}');
      const at = events.findIndex(e => e.id === selected());
      expect(syllable(at)).toBe(true);
    }
  });

  it('switching to Lyrics mode moves a selected rest to the next note', async () => {
    const r = withRest();
    open('asax', { score: r.score });
    await clickEvent(r.rest);
    expect(selected()).toBe(r.rest);
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    expect(selected()).toBe(r.next);
    expect(screen.getByRole('group', { name: 'Lyrics panel' })).toBeInTheDocument();
  });
});

describe('Edit notes panel and keys', () => {
  const hit = (id: string) => document.querySelector(`[data-hit="${id}"]`)!;
  const clickEvent = (id: string) => user.click(hit(id));
  const selectedId = () => document.querySelector('[data-selected="true"]')?.getAttribute('data-ev') ?? null;
  const sheet = () => screen.getByRole('group', { name: /Sheet music/ });
  const live = () => sheet().querySelector('[aria-live="polite"]')!;
  const panel = () => screen.getByRole('group', { name: 'Edit notes panel' });
  const button = (name: string) => within(panel()).getByRole('button', { name });
  const current = () => useApp.getState().doc!;
  const ev = (id: string) => locate(current(), id)!.ev;
  const firstNote = () => current().score.flatMap(b => b.ev).find(e => !e.r)!;
  const edit = async (id: InstId = 'asax', patch: Partial<Doc> = {}) => {
    open(id, patch);
    await user.click(screen.getByRole('radio', { name: 'Edit notes' }));
  };
  /** The concert pitch class of a written G with the written key signature's alteration. */
  const expectedPcOfGInKey = () => {
    const d = current();
    const sig = derive(d, DEFAULT_PREFS).sig;
    const alter = signatureLetters(sig).includes(4) ? Math.sign(sig) : 0;
    return mod12(7 + alter - d.shift - inst(d.inst).off);
  };

  it('check 6: quarter → eighth leaves an eighth rest; undo restores; the key does not change', async () => {
    await edit();
    const d0 = current();
    const q = d0.score.flatMap(b => b.ev).find(e => !e.r && e.d === 12)!;
    await clickEvent(q.id);
    expect(button('Quarter')).toHaveAttribute('aria-pressed', 'true');
    await user.click(button('Eighth'));
    const d1 = current();
    const bar = d1.score.find(b => b.ev.some(e => e.id === q.id))!;
    const i = bar.ev.findIndex(e => e.id === q.id);
    expect(bar.ev[i].d).toBe(6);
    expect(bar.ev[i + 1]).toMatchObject({ r: true, d: 6 });
    expect(d1.shift).toBe(d0.shift);
    expect(button('Eighth')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Quarter')).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useApp.getState().doc).toBe(d0);
  });

  it('lengths that do not fit are disabled', async () => {
    await edit();
    const pickup = current().score[0].ev;
    const last = pickup[pickup.length - 1];   // the pickup bar ends with a quarter
    expect(last).toMatchObject({ r: false, d: 12 });
    await clickEvent(last.id);
    for (const name of ['Half', 'Whole', 'Dotted']) expect(button(name)).toBeDisabled();
    for (const name of ['Sixteenth', 'Eighth', 'Quarter']) expect(button(name)).toBeEnabled();
    await user.click(button('Half'));
    expect(ev(last.id).d).toBe(12);
  });

  it('pitch buttons and note name', async () => {
    await edit();
    const n = firstNote();
    await clickEvent(n.id);
    const name = () => derive(current(), DEFAULT_PREFS).byId[n.id].spelled.name;
    expect(within(panel()).getByText(name())).toBeInTheDocument();
    const before = name();
    await user.click(button('Semitone up'));
    expect(ev(n.id).m).toBe(n.m + 1);
    expect(name()).not.toBe(before);
    expect(within(panel()).getByText(name())).toBeInTheDocument();
    await user.click(button('Semitone down'));
    expect(ev(n.id).m).toBe(n.m);
    await user.click(button('Octave up'));
    expect(ev(n.id).m).toBe(n.m + 12);
    await user.click(button('Octave down'));
    expect(ev(n.id).m).toBe(n.m);
    await user.click(button('Turn into rest'));
    for (const b of ['Octave down', 'Semitone down', 'Semitone up', 'Octave up']) expect(button(b)).toBeDisabled();
    expect(within(panel()).getByText('rest')).toBeInTheDocument();
  });

  it('pitch buttons are disabled at the ends of MIDI 0..127', async () => {
    const base = sampleDoc('asax');
    const n = base.score[0].ev[0];
    const score = base.score.map((b, k) => (k === 0 ? { ...b, ev: b.ev.map((e, j) => (j === 0 ? { ...e, m: 127 } : e)) } : b));
    await edit('asax', { score });
    await clickEvent(n.id);
    expect(button('Semitone up')).toBeDisabled();
    expect(button('Octave up')).toBeDisabled();
    expect(button('Semitone down')).toBeEnabled();
    expect(button('Octave down')).toBeEnabled();
  });

  it('dotted, tie, rest toggles', async () => {
    await edit();
    const s = current().score;
    const dotted = s[2].ev[2];          // a dotted quarter
    expect(dotted.d).toBe(18);
    await clickEvent(dotted.id);
    expect(button('Quarter')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Dotted')).toHaveAttribute('aria-pressed', 'true');
    await user.click(button('Dotted'));
    expect(ev(dotted.id).d).toBe(12);
    expect(button('Dotted')).toHaveAttribute('aria-pressed', 'false');
    await user.click(button('Dotted'));
    expect(ev(dotted.id).d).toBe(18);

    const tied = s[1].ev[1];            // tied into the next note
    await clickEvent(tied.id);
    expect(button('Tie')).toHaveAttribute('aria-pressed', 'true');
    await user.click(button('Tie'));
    expect(ev(tied.id).tie).toBe(false);
    expect(button('Tie')).toHaveAttribute('aria-pressed', 'false');
    expect(button('Tie')).toBeEnabled();  // the next note still has the same pitch

    const before = s[0].ev[0];          // the next note has another pitch
    await clickEvent(before.id);
    expect(button('Tie')).toBeDisabled();
    expect(button('Tie')).toHaveAttribute('aria-pressed', 'false');

    await user.click(button('Turn into rest'));
    expect(ev(before.id).r).toBe(true);
    await user.click(button('Turn into note'));
    expect(ev(before.id)).toMatchObject({ r: false, m: before.m });
    expect(button('Turn into rest')).toBeInTheDocument();
  });

  it('bars: add after and remove', async () => {
    await edit();
    const count = current().score.length;
    const n = current().score[2].ev[1];
    await clickEvent(n.id);
    await user.click(button('+ Bar after'));
    expect(current().score).toHaveLength(count + 1);
    const added = current().score[3].ev;
    expect(added).toHaveLength(1);
    expect(added[0].r).toBe(true);
    expect(selectedId()).toBe(added[0].id);
    expect(sheet()).toContainElement(document.activeElement as HTMLElement);   // the keys still reach the sheet
    await user.click(button('Remove bar'));
    expect(current().score).toHaveLength(count);
    expect(selectedId()).toBe(current().score[3].ev[0].id);
    cleanup();

    await edit('asax', { score: [sampleDoc('asax').score[2]] });
    await clickEvent(current().score[0].ev[0].id);
    expect(button('Remove bar')).toBeDisabled();
    expect(button('+ Bar after')).toBeEnabled();
  });

  it('keyboard: arrows, letters, digits, dot, R, T, Delete', async () => {
    await edit('fl');
    const n = firstNote();
    await clickEvent(n.id);
    sheet().focus();
    await user.keyboard('{ArrowUp}');
    expect(ev(n.id).m).toBe(n.m + 1);
    await user.keyboard('{Control>}{ArrowDown}{/Control}');
    expect(ev(n.id).m).toBe(n.m + 1 - 12);
    await user.keyboard('{Meta>}{ArrowUp}{/Meta}');
    expect(ev(n.id).m).toBe(n.m + 1);
    await user.keyboard('{ArrowDown}');
    expect(ev(n.id).m).toBe(n.m);
    await user.keyboard('3');
    expect(ev(n.id).d).toBe(6);
    await user.keyboard('.');
    expect(ev(n.id).d).toBe(9);
    await user.keyboard('2');
    expect(ev(n.id).d).toBe(3);
    await user.keyboard('4');
    expect(ev(n.id).d).toBe(12);
    await user.keyboard('r');
    expect(ev(n.id).r).toBe(true);
    await user.keyboard('R');
    expect(ev(n.id).r).toBe(false);
    await user.keyboard('{Delete}');
    expect(ev(n.id).r).toBe(true);
    const rest = current();
    await user.keyboard('{Backspace}');
    expect(current()).toBe(rest);           // Delete on a rest does nothing
    await user.keyboard('g');
    expect(ev(n.id).r).toBe(false);
    expect(ev(n.id).m % 12).toBe(expectedPcOfGInKey());
    expect(live()).toHaveTextContent(`${derive(current(), DEFAULT_PREFS).byId[n.id].spelled.name}, quarter, pickup bar`);
    await user.keyboard('{ArrowRight}');
    expect(selectedId()).not.toBe(n.id);
  });

  it('keyboard: T ties to a next note of the same pitch; disabled keys do nothing', async () => {
    await edit();
    const s = current().score;
    const a = s[0].ev[1];               // the next note has the same pitch
    await clickEvent(a.id);
    sheet().focus();
    await user.keyboard('t');
    expect(ev(a.id).tie).toBe(true);
    await user.keyboard('T');
    expect(ev(a.id).tie).toBe(false);
    const b = s[0].ev[0];               // the next note has another pitch
    await clickEvent(b.id);
    const d = current();
    await user.keyboard('t6');           // tie not allowed; a whole does not fit in the pickup bar
    expect(current()).toBe(d);
    expect(useApp.getState().past).toHaveLength(2);
  });

  it('a keyboard edit is announced with name, length and bar', async () => {
    await edit();
    const n = current().score[2].ev[1];   // a quarter in bar 2
    await clickEvent(n.id);
    sheet().focus();
    await user.keyboard('3');
    expect(live()).toHaveTextContent(`${derive(current(), DEFAULT_PREFS).byId[n.id].spelled.name}, eighth, bar 2`);
    await user.keyboard('.');
    expect(live()).toHaveTextContent(/, dotted eighth, bar 2$/);
    await user.keyboard('r');
    expect(live()).toHaveTextContent('rest, dotted eighth, bar 2');
  });

  it('keys do nothing in View mode and while typing in the title', async () => {
    open('asax');
    const n = current().score[2].ev[1];
    await clickEvent(n.id);
    sheet().focus();
    const d0 = current();
    await user.keyboard('r3.t{Delete}g{ArrowUp}');
    expect(current()).toBe(d0);
    expect(selectedId()).toBe(n.id);

    await user.click(screen.getByRole('radio', { name: 'Edit notes' }));
    await clickEvent(n.id);
    const title = screen.getByPlaceholderText('Add a title');
    await user.clear(title);
    await user.type(title, 'radar 3.');
    expect(current().title).toBe('radar 3.');
    expect(ev(n.id)).toEqual(n);
    expect(current().score).toBe(d0.score);
  });

  it('keys with Alt or Shift, or while a menu or popover is open, do nothing', async () => {
    await edit();
    const n = current().score[2].ev[1];
    await clickEvent(n.id);
    sheet().focus();
    const d0 = current();
    await user.keyboard('{Alt>}r{/Alt}{Shift>}{ArrowUp}{/Shift}{Alt>}{ArrowUp}{/Alt}');
    expect(current()).toBe(d0);
    await user.click(screen.getByRole('button', { name: /File/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    sheet().focus();
    fireEvent.keyDown(sheet(), { key: 'r' });
    expect(current()).toBe(d0);
  });

  it('an edit during playback stops it and keeps the selection (review focus 5)', async () => {
    await edit();
    const n = current().score[2].ev[1];
    await clickEvent(n.id);
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    await user.click(screen.getByRole('button', { name: 'Play from selected' }));
    expect(fakePlayer.play).toHaveBeenCalledTimes(1);
    fakePlayer.stop.mockClear();
    await user.click(button('Semitone up'));
    expect(fakePlayer.stop).toHaveBeenCalled();
    expect(selectedId()).toBe(n.id);
    expect(ev(n.id).m).toBe(n.m + 1);
    expect(panel()).toBeInTheDocument();
  });
});

it('redirects without a doc', () => {
  useApp.setState({ doc: null });
  renderSheet();
  expect(currentPath()).toBe('/');
});
