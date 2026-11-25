import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Player } from '../audio/player';
import { buildSchedule, type Schedule } from '../domain/playback';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc, InstId } from '../domain/types';
import { barLabelOf } from '../domain/bars';
import { addBarAfter, lengthName, locate, setBarMark, setJump, setLength, shiftPitch, toggleRest, toggleTriplet } from '../domain/edit';
import { setChord } from '../domain/editText';
import { inst } from '../domain/instruments';
import { mod12, signatureLetters } from '../domain/keys';
import { MAX_BARS, serializeFile } from '../domain/persistence';
import { mkDoc, type EvSpec } from '../test/helpers';
import { listEntries, saveEntry } from '../state/library';
import { useApp } from '../state/store';
import { PdfError } from '../pdf/errors';
import { requestSheetPdf } from '../pdf/request';
import { downloadText } from '../ui/download';
import { ToastHost } from '../shell/Toast';
import SheetPage from './SheetPage';

vi.mock('../ui/download', () => ({ downloadText: vi.fn() }));
vi.mock('../pdf/request', () => ({ requestSheetPdf: vi.fn(async () => {}) }));

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
  vi.mocked(requestSheetPdf).mockReset();
  vi.mocked(requestSheetPdf).mockResolvedValue(undefined);
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
  const dialog = await screen.findByRole('dialog');        // the popover's code loads at the first click
  expect(pills[0]).toHaveAttribute('aria-expanded', 'true');
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
  let dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getAllByRole('button').find(b => !/auto/.test(b.textContent!))!);
  expect(Object.keys(useApp.getState().doc!.fingering)).toHaveLength(1);
  await user.click(pill);
  dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByText('auto').closest('button')!);
  expect(useApp.getState().doc!.fingering).toEqual({});

  await user.click(pill);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
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
  expect(screen.getByText('Rhythm simplified: notes shorter than a sixteenth and tuplets other than triplets were rounded.')).toBeInTheDocument();
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
    expect(within(menu).getAllByRole('menuitem').slice(0, 6).map(i => i.textContent)).toEqual(['Download PDF', 'Print', 'Download JSON', 'Open JSON file…', 'Terms of Use', 'New sheet']);
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
    // Tab closes the menu from every item, the notice link included.
    items[0].focus();
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

  describe('Download PDF', () => {
    const openMenu = () => user.click(screen.getByRole('button', { name: /File/ }));
    const pdfItem = (name: string | RegExp = 'Download PDF') => screen.getByRole('menuitem', { name });
    /** A request that stays pending until `finish` is called. */
    function pending() {
      let finish!: () => void;
      let fail!: (e: unknown) => void;
      vi.mocked(requestSheetPdf).mockImplementation(() => new Promise<void>((res, rej) => { finish = res; fail = rej; }));
      return { finish: () => act(() => finish()), fail: (e: unknown) => act(() => fail(e)) };
    }

    it('is the first, primary entry and requests the PDF of the sheet', async () => {
      const doc = sampleDoc('asax');
      open('asax');
      await openMenu();
      expect(pdfItem().className).toMatch(/primary/);
      expect(pdfItem()).toHaveAttribute('data-primary');
      await user.click(pdfItem());
      expect(requestSheetPdf).toHaveBeenCalledTimes(1);
      expect(vi.mocked(requestSheetPdf).mock.calls[0][0]).toEqual(doc);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('stops playback first', async () => {
      open('asax');
      await user.click(screen.getByRole('button', { name: 'Listen' }));
      fakePlayer.stop.mockClear();
      await openMenu();
      await user.click(pdfItem());
      expect(fakePlayer.stop).toHaveBeenCalled();
    });

    it('reads "Preparing PDF…" and is disabled while the PDF is made; a second request is ignored', async () => {
      const job = pending();
      open('asax');
      await openMenu();
      await user.click(pdfItem());
      await openMenu();
      const busy = pdfItem('Preparing PDF…');
      expect(busy).toBeDisabled();
      await user.click(busy);
      expect(requestSheetPdf).toHaveBeenCalledTimes(1);
      await job.finish();
      await user.keyboard('{Escape}');
      await openMenu();
      expect(pdfItem()).toBeEnabled();
    });

    it('shows the text of a PdfError in the alert line; a later success clears it', async () => {
      open('asax');
      vi.mocked(requestSheetPdf).mockRejectedValueOnce(new PdfError('The PDF can\'t show these characters: д. Use Print instead.'));
      await openMenu();
      await user.click(pdfItem());
      expect(await screen.findByRole('alert')).toHaveTextContent('The PDF can\'t show these characters: д. Use Print instead.');
      await openMenu();
      await user.click(pdfItem());
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    it('announces the page only for more than 10 pages', async () => {
      const job = pending();
      open('asax');
      await openMenu();
      await user.click(pdfItem());
      const onProgress = vi.mocked(requestSheetPdf).mock.calls[0][1].onProgress!;
      const live = () => document.querySelector('p[aria-live="polite"]')!;
      act(() => onProgress(2, 10));
      expect(live()).toBeEmptyDOMElement();
      act(() => onProgress(3, 12));
      expect(live()).toBeEmptyDOMElement();
      act(() => onProgress(10, 12));
      expect(live()).toHaveTextContent('Preparing PDF, page 10 of 12');
      await job.finish();
    });

    it('leaving the page aborts the request', async () => {
      pending();
      const view = open('asax');
      await openMenu();
      await user.click(pdfItem());
      const { signal } = vi.mocked(requestSheetPdf).mock.calls[0][1];
      expect(signal!.aborted).toBe(false);
      view.unmount();
      expect(signal!.aborted).toBe(true);
    });

    it('opening another sheet mid-job aborts it: no download, no error from the old job, the entry is usable again', async () => {
      let fail!: (e: unknown) => void;
      vi.mocked(requestSheetPdf).mockImplementationOnce(() => new Promise<void>((_, rej) => { fail = rej; }));
      open('asax');
      await openMenu();
      await user.click(pdfItem());
      const { signal } = vi.mocked(requestSheetPdf).mock.calls[0][1];
      const text = serializeFile({ ...sampleDoc('cl'), title: 'Other sheet' });
      await openMenu();
      await user.click(screen.getByRole('menuitem', { name: 'Open JSON file…' }));
      await user.upload(screen.getByLabelText('Open JSON file', { selector: 'input' }), new File([text], 'o.fingerscore.json', { type: 'application/json' }));
      expect(await screen.findByRole('textbox', { name: 'Sheet title' })).toHaveValue('Other sheet');
      expect(signal!.aborted).toBe(true);
      await act(async () => fail(new PdfError('The PDF could not be made. Use Print instead.')));
      expect(screen.queryByRole('alert')).toBeNull();
      await openMenu();
      expect(pdfItem()).toBeEnabled();
      await user.click(pdfItem());
      expect(requestSheetPdf).toHaveBeenCalledTimes(2);
      expect(vi.mocked(requestSheetPdf).mock.calls[1][0].title).toBe('Other sheet');
    });

    it('an import error stays when the old job finishes', async () => {
      let finish!: () => void;
      vi.mocked(requestSheetPdf).mockImplementationOnce(() => new Promise<void>(res => { finish = res; }));
      open('asax');
      await openMenu();
      await user.click(pdfItem());
      await user.upload(screen.getByLabelText('Open JSON file', { selector: 'input' }), new File(['{"name":"x"}'], 'package.json', { type: 'application/json' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('isn\'t a fingerscore sheet');
      await act(async () => finish());
      expect(screen.getByRole('alert')).toHaveTextContent('isn\'t a fingerscore sheet');
    });

    it('a saved sheet opened from the menu aborts the job too', async () => {
      saveEntry({ ...sampleDoc('cl'), title: 'Saved one' }, null);
      pending();
      open('asax');
      await openMenu();
      await user.click(pdfItem());
      const { signal } = vi.mocked(requestSheetPdf).mock.calls[0][1];
      await openMenu();
      await user.click(screen.getByRole('menuitem', { name: 'Open Saved one' }));
      expect(signal!.aborted).toBe(true);
    });

    it('a repeated identical failure is announced again', async () => {
      const e = () => new PdfError('The PDF could not be made. Use Print instead.');
      vi.mocked(requestSheetPdf).mockRejectedValue(e());
      open('asax');
      await openMenu();
      await user.click(pdfItem());
      const first = await screen.findByRole('alert');
      await openMenu();
      await user.click(pdfItem());
      await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first));
    });

    it('the live line is cleared when the job ends', async () => {
      const job = pending();
      open('asax');
      await openMenu();
      await user.click(pdfItem());
      act(() => vi.mocked(requestSheetPdf).mock.calls[0][1].onProgress!(10, 12));
      expect(document.querySelector('p[aria-live="polite"]')).toHaveTextContent('Preparing PDF, page 10 of 12');
      await job.finish();
      expect(document.querySelector('p[aria-live="polite"]')).toBeEmptyDOMElement();
    });

    it('Print still prints, after stopping playback', async () => {
      const print = vi.spyOn(window, 'print').mockImplementation(() => {});
      open('asax');
      await user.click(screen.getByRole('button', { name: 'Listen' }));
      fakePlayer.stop.mockClear();
      await openMenu();
      await user.click(pdfItem('Print'));
      expect(print).toHaveBeenCalled();
      expect(requestSheetPdf).not.toHaveBeenCalled();
      expect(fakePlayer.stop).toHaveBeenCalled();
      print.mockRestore();
    });
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

  it('/sheet?id=…&mode=play opens the saved sheet in Play mode, once: after Exit the editor shows and stays', async () => {
    const r = saveEntry({ ...sampleDoc('cl'), title: 'Linked' }, null);
    if (!r.ok) throw new Error(r.message);
    useApp.setState({ doc: null });
    renderSheet(`/sheet?id=${r.entry.id}&mode=play`);
    const stage = await screen.findByRole('region', { name: 'Play mode' });
    expect(within(stage).getByText('Linked')).toBeInTheDocument();
    expect(currentPath()).toBe('/sheet');
    await user.click(screen.getByRole('button', { name: 'Exit play mode (Esc)' }));
    expect(screen.queryByRole('region', { name: 'Play mode' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('Linked');
    cleanup();
    renderSheet(`/sheet?id=${r.entry.id}`);
    expect(await screen.findByRole('textbox', { name: 'Sheet title' })).toHaveValue('Linked');
    expect(screen.queryByRole('region', { name: 'Play mode' })).toBeNull();
  });
});

describe('playback', () => {
  it('Play starts the player, Stop stops it', async () => {
    open('asax');
    const play = screen.getByRole('button', { name: 'Listen' });
    expect(play).not.toHaveAttribute('aria-pressed');   // the label swap says the state
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    await user.click(play);
    expect(fakePlayer.play).toHaveBeenCalledTimes(1);
    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop).not.toHaveAttribute('aria-pressed');
    fakePlayer.stop.mockImplementation(() => { fakePlayer.playing = false; fakePlayer.play.mock.calls[0][2](null); });
    await user.click(stop);
    expect(fakePlayer.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Listen' })).toBeInTheDocument();
  });

  it('stops on tempo or key change and on unmount, not on a title change', async () => {
    const view = open('asax');
    await user.click(screen.getByRole('button', { name: 'Listen' }));
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
    await user.click(screen.getByRole('button', { name: 'Listen' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Playback is not available in this browser.');
    expect(screen.getByRole('button', { name: 'Listen' })).toBeInTheDocument();
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
  const length = (id: string) => lengthName(derive(doc, DEFAULT_PREFS).byId[id].d);
  const hit = (id: string) => document.querySelector(`[data-hit="${id}"]`)!;
  const selected = () => document.querySelector('[data-selected="true"]')?.getAttribute('data-ev') ?? null;
  const sheet = () => screen.getByRole('group', { name: 'Sheet music. Arrow keys select a note, Enter listens from it.' });
  const live = () => sheet().querySelector('[aria-live="polite"]')!;
  const tied = doc.score[1].ev[1].id;               // starts a chain over the next two events
  const afterChain = doc.score[2].ev[1].id;          // bar 2, after the chain's continuations

  it('the sheet is a focusable group with a polite live line', () => {
    open('asax');
    expect(sheet()).toHaveAttribute('tabindex', '0');
    expect(live()).toHaveTextContent('');
  });

  it('the description of the paper sits beside the group, not inside it, and the group points to it by id', () => {
    open('asax');
    const id = sheet().getAttribute('aria-describedby')!;
    const description = document.getElementById(id)!;
    expect(description).toHaveTextContent(/\S/);
    expect(sheet().contains(description)).toBe(false);
    expect(description.nextElementSibling).toBe(sheet());
    expect(sheet()).toHaveAccessibleDescription(description.textContent!);
  });

  it('clicking a note selects it and renames Play; clicking it again clears', async () => {
    open('asax');
    await user.click(hit(afterChain));
    expect(selected()).toBe(afterChain);
    expect(screen.getByRole('button', { name: 'Listen from selected' })).toBeInTheDocument();
    expect(live()).toHaveTextContent(`Selected: ${name(afterChain)}, ${length(afterChain)}, bar 2`);
    await user.click(hit(afterChain));
    expect(selected()).toBeNull();
    expect(screen.getByRole('button', { name: 'Listen' })).toBeInTheDocument();
    expect(live()).toHaveTextContent('Selection cleared');
  });

  it('a selected rest is announced with its length', async () => {
    const restDoc = toggleRest(doc, afterChain)!;
    open('asax', { score: restDoc.score });
    await user.click(hit(afterChain));
    const rest = derive(restDoc, DEFAULT_PREFS).byId[afterChain];
    expect(rest.rest).toBe(true);
    expect(live()).toHaveTextContent(`Selected: rest, ${lengthName(rest.d)}, bar 2`);
  });

  it('the pickup is announced as the pickup bar', async () => {
    open('asax');
    await user.click(hit(doc.score[0].ev[0].id));
    expect(live()).toHaveTextContent(`Selected: ${name(doc.score[0].ev[0].id)}, ${length(doc.score[0].ev[0].id)}, pickup bar`);
  });

  it('Play from selected plays a sliced schedule; the selection stays after Stop', async () => {
    open('asax');
    await user.click(hit(afterChain));
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    await user.click(screen.getByRole('button', { name: 'Listen from selected' }));
    const sched = fakePlayer.play.mock.calls[0][0] as Schedule;
    expect(sched.totalTicks).toBeLessThan(buildSchedule(doc).totalTicks);
    expect(sched.marks[0]).toEqual({ evId: afterChain, start: 0 });
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    fakePlayer.stop.mockImplementation(() => { fakePlayer.playing = false; fakePlayer.play.mock.calls[0][2](null); });
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(selected()).toBe(afterChain);
    expect(screen.getByRole('button', { name: 'Listen from selected' })).toBeInTheDocument();
  });

  it('Play without a selection plays the whole song', async () => {
    open('asax');
    await user.click(screen.getByRole('button', { name: 'Listen' }));
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
  const sheet = () => screen.getByRole('group', { name: 'Sheet music. Arrow keys select a note, Enter listens from it.' });
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
    const panel = await screen.findByRole('group', { name: 'Edit notes panel' });
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
    const panel = await screen.findByRole('group', { name: 'Chords panel' });
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

  it('undo and redo name their shortcuts and are announced', async () => {
    open('asax');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
    expect(redo).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+Z Meta+Shift+Z Control+Y');
    const live = () => sheet().querySelector('[aria-live="polite"]')!;
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    await user.click(undo);
    expect(live()).toHaveTextContent(/^Undone$/);
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(live()).toHaveTextContent(/^Redone$/);
    await clickEvent(firstEventId());
    await user.keyboard('{Control>}y{/Control}');   // nothing to redo: nothing is said
    expect(live()).not.toHaveTextContent(/Redone|Undone/);
  });

  it('repeated undo is announced each time', async () => {
    open('asax');
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    act(() => useApp.getState().patchDoc({ tempo: 130 }));
    act(() => useApp.getState().patchDoc({ tempo: 140 }));
    const live = () => screen.getByRole('group', { name: /Sheet music/ }).querySelector('[aria-live="polite"]')!.textContent;
    const said: (string | null)[] = [];
    for (let i = 0; i < 3; i++) { await user.keyboard('{Control>}z{/Control}'); said.push(live()); }
    expect(said[0]).toBe('Undone');
    expect(said[1]).not.toBe(said[0]);                       // the live region's text changes on every press
    expect(said[2]).not.toBe(said[1]);
    expect(said.every(t => t!.replace('\u200B', '') === 'Undone')).toBe(true);
  });

  it('a history button that disables itself hands the focus on: to the other one, else to the sheet', async () => {
    open('asax');
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    act(() => useApp.getState().patchDoc({ tempo: 130 }));
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    undo.focus();
    await user.keyboard('{Enter}');
    expect(undo).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(undo).toBeDisabled();
    expect(redo).toHaveFocus();
    await user.keyboard('{Enter}{Enter}');
    expect(redo).toBeDisabled();
    expect(undo).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(undo).toHaveFocus();   // one step undone, more to undo
    act(() => useApp.setState({ past: [], future: [] }));   // neither button is enabled now
    expect(sheet()).toHaveFocus();
  });

  it('a mode chosen with arrow keys keeps the focus on the switch; a click on Lyrics or Chords focuses the field', async () => {
    open('asax');
    await clickEvent(afterChain);
    const radios = within(screen.getByRole('radiogroup', { name: 'Mode' })).getAllByRole('radio');
    radios[1].click();
    radios[1].focus();
    await user.keyboard('{ArrowRight}');
    expect(radios[2]).toBeChecked();
    expect(radios[2]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(radios[3]).toBeChecked();
    expect(radios[3]).toHaveFocus();
    await user.click(radios[2]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Lyric' })).toHaveFocus());
  });

  it('Tab on the sheet goes into the open Lyric or Chord field', async () => {
    open('asax');
    for (const [mode, label] of [['Lyrics', 'Lyric'], ['Chords', 'Chord']]) {
      await user.click(screen.getByRole('radio', { name: mode }));
      sheet().focus();
      await user.keyboard('{Home}{ArrowRight}');
      expect(sheet()).toHaveFocus();
      await screen.findByRole('textbox', { name: label });
      await user.keyboard('{Tab}');
      expect(screen.getByRole('textbox', { name: label })).toHaveFocus();
    }
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
      const r = addBarAfter(st.doc!, 2)!;
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
      expect(screen.getByRole('button', { name: 'Listen' })).toBeInTheDocument();
      await clickEvent(afterChain);
      expect(selected()).toBe(afterChain);
      expect(screen.getByRole('button', { name: 'Listen from selected' })).toBeInTheDocument();
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
      sheet().focus();   // in Chords mode a click focuses the Chord field, where arrows move the caret
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
    expect(await screen.findByRole('group', { name: 'Lyrics panel' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Lyric' })).toHaveFocus();   // design 4.4: focused on open
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
    await screen.findByRole('group', { name: 'Edit notes panel' });
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
    await screen.findByRole('group', { name: 'Edit notes panel' });
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
    await screen.findByRole('group', { name: 'Edit notes panel' });
    expect(within(panel()).getByText(name())).toBeInTheDocument();
    const before = name();
    await user.click(button('+1 Semitone up'));
    expect(ev(n.id).m).toBe(n.m + 1);
    expect(name()).not.toBe(before);
    expect(within(panel()).getByText(name())).toBeInTheDocument();
    await user.click(button('−1 Semitone down'));
    expect(ev(n.id).m).toBe(n.m);
    await user.click(button('+8 Octave up'));
    expect(ev(n.id).m).toBe(n.m + 12);
    await user.click(button('−8 Octave down'));
    expect(ev(n.id).m).toBe(n.m);
    await user.click(button('Turn into rest'));
    for (const b of ['−8 Octave down', '−1 Semitone down', '+1 Semitone up', '+8 Octave up']) expect(button(b)).toBeDisabled();
    expect(within(panel()).getByText('rest')).toBeInTheDocument();
  });

  it('pitch buttons are disabled at the ends of MIDI 0..127', async () => {
    const base = sampleDoc('asax');
    const n = base.score[0].ev[0];
    const score = base.score.map((b, k) => (k === 0 ? { ...b, ev: b.ev.map((e, j) => (j === 0 ? { ...e, m: 127 } : e)) } : b));
    await edit('asax', { score });
    await clickEvent(n.id);
    await screen.findByRole('group', { name: 'Edit notes panel' });
    expect(button('+1 Semitone up')).toBeDisabled();
    expect(button('+8 Octave up')).toBeDisabled();
    expect(button('−1 Semitone down')).toBeEnabled();
    expect(button('−8 Octave down')).toBeEnabled();
  });

  it('dotted, tie, rest toggles', async () => {
    await edit();
    const s = current().score;
    const dotted = s[2].ev[2];          // a dotted quarter
    expect(dotted.d).toBe(18);
    await clickEvent(dotted.id);
    await screen.findByRole('group', { name: 'Edit notes panel' });
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
    expect(document.querySelectorAll('[data-bar]')).toHaveLength(count);
    await screen.findByRole('group', { name: 'Edit notes panel' });
    await user.click(button('+ Bar after'));
    expect(current().score).toHaveLength(count + 1);
    expect(document.querySelectorAll('[data-bar]')).toHaveLength(count + 1);
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

  it('a clicked panel button leaves the keys with the sheet (Task 4 review I1)', async () => {
    await edit();
    const n = current().score[2].ev[1];
    await clickEvent(n.id);
    await screen.findByRole('group', { name: 'Edit notes panel' });
    await user.click(button('+1 Semitone up'));
    expect(ev(n.id).m).toBe(n.m + 1);
    expect(sheet()).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(ev(n.id).m).toBe(n.m + 2);
    await user.click(button('Eighth'));
    expect(ev(n.id).d).toBe(6);
    await user.keyboard('r');
    expect(ev(n.id).r).toBe(true);
    await user.keyboard('{Escape}');
    expect(selectedId()).toBeNull();
  });

  it('a panel button used from the keyboard: Enter activates, Esc clears the selection (Task 4 review I1)', async () => {
    await edit();
    const n = current().score[2].ev[1];
    await clickEvent(n.id);
    await screen.findByRole('group', { name: 'Edit notes panel' });
    button('+1 Semitone up').focus();
    await user.keyboard('{Enter}');
    expect(ev(n.id).m).toBe(n.m + 1);
    expect(button('+1 Semitone up')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(selectedId()).toBeNull();
    expect(sheet()).toHaveFocus();
  });

  it('a keyboard-activated panel button that becomes disabled hands the focus to the sheet (Task 4 review I1)', async () => {
    const score = sampleDoc('asax').score.slice(2, 4);
    await edit('asax', { score });
    await clickEvent(score[0].ev[0].id);
    await screen.findByRole('group', { name: 'Edit notes panel' });
    button('Remove bar').focus();
    await user.keyboard('{Enter}');
    expect(current().score).toHaveLength(1);
    expect(button('Remove bar')).toBeDisabled();
    expect(sheet()).toHaveFocus();
    await user.keyboard('r');
    expect(ev(score[1].ev[0].id).r).toBe(!score[1].ev[0].r);
  });

  it('panel buttons name their keys once: aria-keyshortcuts, no title; one hint line (Task 4 review M3)', async () => {
    await edit();
    await clickEvent(current().score[2].ev[1].id);
    const keys = (name: string) => button(name).getAttribute('aria-keyshortcuts');
    await screen.findByRole('group', { name: 'Edit notes panel' });
    expect(['−8 Octave down', '−1 Semitone down', '+1 Semitone up', '+8 Octave up'].map(keys))
      .toEqual(['Control+ArrowDown Meta+ArrowDown', 'ArrowDown', 'ArrowUp', 'Control+ArrowUp Meta+ArrowUp']);
    expect(['Sixteenth', 'Eighth', 'Quarter', 'Half', 'Whole', 'Dotted', '3 Triplet', 'Tie', 'Turn into rest'].map(keys))
      .toEqual(['2', '3', '4', '5', '6', '.', 'P', 'T', 'R']);
    expect(within(panel()).getAllByRole('button').filter(b => b.hasAttribute('title'))).toEqual([]);
    expect(within(panel()).getByText('Keys: ↑ ↓ pitch · A–G note · 2–6 length · . dot · P triplet · R rest · T tie')).toBeInTheDocument();
  });

  it('+ Bar after is disabled at the bar limit', async () => {
    const full = mkDoc(Array.from({ length: MAX_BARS }, () => ({ ev: [[0, 48]] as EvSpec[] })));
    await edit('asax', { score: full.score, chords: {}, imported: { lyrics: {}, chords: {} } });
    await clickEvent(full.score[0].ev[0].id);
    await screen.findByRole('group', { name: 'Edit notes panel' });
    expect(button('+ Bar after')).toBeDisabled();
    expect(button('Remove bar')).toBeEnabled();
  });

  it('editing keys on other layouts: letters by key code, digits and dot with Shift', async () => {
    await edit('fl');
    const n = current().score[2].ev[1];
    await clickEvent(n.id);
    sheet().focus();
    fireEvent.keyDown(sheet(), { key: 'ф', code: 'KeyA' });
    expect(derive(current(), DEFAULT_PREFS).byId[n.id].spelled.name[0]).toBe('A');
    fireEvent.keyDown(sheet(), { key: '"', code: 'Digit3', shiftKey: true });
    expect(ev(n.id).d).toBe(6);
    fireEvent.keyDown(sheet(), { key: '.', code: 'Comma', shiftKey: true });
    expect(ev(n.id).d).toBe(9);
    fireEvent.keyDown(sheet(), { key: 'к', code: 'KeyR' });
    expect(ev(n.id).r).toBe(true);
    const d0 = current();
    fireEvent.keyDown(sheet(), { key: 'R', code: 'KeyR', shiftKey: true });   // Shift with a letter still does nothing
    expect(current()).toBe(d0);
  });

  it('an edit during playback stops it and keeps the selection (review focus 5)', async () => {
    await edit();
    const n = current().score[2].ev[1];
    await clickEvent(n.id);
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    await user.click(screen.getByRole('button', { name: 'Listen from selected' }));
    expect(fakePlayer.play).toHaveBeenCalledTimes(1);
    fakePlayer.stop.mockClear();
    await screen.findByRole('group', { name: 'Edit notes panel' });
    await user.click(button('+1 Semitone up'));
    expect(fakePlayer.stop).toHaveBeenCalled();
    expect(selectedId()).toBe(n.id);
    expect(ev(n.id).m).toBe(n.m + 1);
    expect(panel()).toBeInTheDocument();
  });
});

describe('Triplet button and key', () => {
  const panel = () => screen.getByRole('group', { name: 'Edit notes panel' });
  const button = (name: string) => within(panel()).getByRole('button', { name });
  const current = () => useApp.getState().doc!;
  const sheet = () => screen.getByRole('group', { name: /Sheet music/ });
  const live = () => sheet().querySelector('[aria-live="polite"]')!;
  const selectedId = () => document.querySelector('[data-selected="true"]')?.getAttribute('data-ev') ?? null;
  const events = () => current().score.flatMap(b => b.ev);
  const withLyric = (doc: Doc, id: string, l: string): Doc => ({
    ...doc, score: doc.score.map(b => ({ ...b, ev: b.ev.map(e => (e.id === id ? { ...e, l } : e)) })),
  });
  /** Two 4/4 bars: quarter, quarter, half. The first quarter (t1) carries the lyric "la"; the second (t2) starts at tick 12. */
  const start = async (prepare: (d: Doc) => Doc = d => d) => {
    const doc = prepare(withLyric(mkDoc([{ ev: [[67, 12], [69, 12], [71, 24]] }, { ev: [[67, 12], [69, 12], [71, 24]] }]), 't1', 'la'));
    useApp.setState({ doc, instId: 'asax', song: null, prefs: DEFAULT_PREFS, past: [], future: [], libraryId: null, savedSnapshot: null });
    renderSheet();
    await user.click(screen.getByRole('radio', { name: 'Edit notes' }));
  };
  const pick = async (id: string) => {
    await user.click(document.querySelector(`[data-hit="${id}"]`)!);
    await screen.findByRole('group', { name: 'Edit notes panel' });
  };
  /** The first quarter of the first bar made into an eighth triplet (members t1 and two new ones, each of 4 ticks). */
  const eighthTriplet = (d: Doc): Doc => toggleTriplet(d, 't1')!.doc;

  it('the Triplet button follows Dotted and names the key P', async () => {
    await start();
    await pick('t1');
    const names = within(panel()).getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent);
    expect(names.indexOf('3 Triplet')).toBe(names.indexOf('Dotted') + 1);
    expect(button('3 Triplet')).toHaveAttribute('aria-keyshortcuts', 'P');
    expect(button('3 Triplet')).toHaveAttribute('aria-pressed', 'false');
    expect(within(panel()).getByText('Keys: ↑ ↓ pitch · A–G note · 2–6 length · . dot · P triplet · R rest · T tie')).toBeInTheDocument();
  });

  it('the button is disabled for a sixteenth and for a whole note', async () => {
    await start(d => setLength(d, 't1', 48)!);
    await pick('t1');
    expect(button('Whole')).toHaveAttribute('aria-pressed', 'true');
    expect(button('3 Triplet')).toBeDisabled();
    await user.click(button('Sixteenth'));
    expect(button('3 Triplet')).toBeDisabled();
  });

  it('a click on a quarter makes three events and keeps the selection on the first; one undo restores the quarter and its lyric', async () => {
    await start();
    const before = current();
    await pick('t1');
    await user.click(button('3 Triplet'));
    expect(events().length).toBe(before.score.flatMap(b => b.ev).length + 2);
    expect(events().slice(0, 3).map(e => e.d)).toEqual([4, 4, 4]);
    expect(selectedId()).toBe('t1');
    expect(button('3 Triplet')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useApp.getState().doc).toBe(before);
    expect(events()[0]).toMatchObject({ id: 't1', d: 12, l: 'la' });
  });

  it('a click on a member gives one event and selects it', async () => {
    await start(eighthTriplet);
    const member = events()[1];
    expect(member.d).toBe(4);
    await pick(member.id);
    expect(button('3 Triplet')).toHaveAttribute('aria-pressed', 'true');
    await user.click(button('3 Triplet'));
    expect(events().filter(e => e.d === 4 || e.d === 2 || e.d === 8)).toEqual([]);
    expect(events()).toHaveLength(6);
    expect(sheet()).toHaveFocus();
    expect(selectedId()).toBe('t1');
    expect(button('3 Triplet')).toHaveAttribute('aria-pressed', 'false');
  });

  it('inside an eighth triplet the Length buttons show what fits and Dotted is off', async () => {
    await start(eighthTriplet);
    const member = events()[1];
    await pick(member.id);
    const state = (name: string) => [button(name).hasAttribute('disabled'), button(name).getAttribute('aria-pressed')];
    expect(state('Sixteenth')).toEqual([true, 'false']);   // [4, 2, r2, 4] would read as two sixteenth triplets
    expect(state('Eighth')).toEqual([false, 'true']);
    expect(state('Quarter')).toEqual([false, 'false']);
    expect(state('Half')[0]).toBe(true);
    expect(state('Whole')[0]).toBe(true);
    expect(button('Dotted')).toBeDisabled();
    expect(button('Dotted')).toHaveAttribute('aria-pressed', 'false');
  });

  it('P makes and undoes a triplet; the announcement names the triplet length', async () => {
    await start();
    await pick('t1');
    await user.keyboard('p');
    expect(events().slice(0, 3).map(e => e.d)).toEqual([4, 4, 4]);
    expect(selectedId()).toBe('t1');
    await waitFor(() => expect(live().textContent).toMatch(/, triplet eighth, /));
    await user.keyboard('P');
    expect(events()[0]).toMatchObject({ id: 't1', d: 12, l: 'la' });
    expect(events().length).toBe(6);
  });

  it('4 inside an eighth triplet sets the triplet quarter; 5 and . do nothing there', async () => {
    await start(eighthTriplet);
    const first = events()[0];
    await pick(first.id);
    const before = current();
    await user.keyboard('5');
    await user.keyboard('.');
    expect(useApp.getState().doc).toBe(before);
    await user.keyboard('4');
    expect(current()).not.toBe(before);
    expect(events()[0]).toMatchObject({ id: first.id, d: 8 });
    await waitFor(() => expect(live().textContent).toMatch(/, triplet quarter, /));
  });

  it('P with a modifier makes no triplet; P in the title field types a letter', async () => {
    await start();
    await pick('t1');
    const before = current();
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
      fireEvent.keyDown(sheet(), { key: 'p', code: 'KeyP', ...init });
    }
    expect(useApp.getState().doc).toBe(before);
    const title = screen.getByRole('textbox', { name: 'Sheet title' });
    await user.click(title);
    await user.type(title, 'p');
    expect(title).toHaveValue('p');
    expect(current().score.flatMap(b => b.ev).map(e => e.d)).toEqual(before.score.flatMap(b => b.ev).map(e => e.d));
  });

  it('make, undo the triplet, then store Undo twice: the selection stays on a valid event', async () => {
    await start();
    const before = current();
    await pick('t1');
    await user.keyboard('pp');
    expect(events()).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(events()).toHaveLength(8);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useApp.getState().doc).toBe(before);
    expect(selectedId()).toBe('t1');   // t1 exists in every state, so the selection stays on it
  });

  it('P in View mode does nothing, and P in the Lyric field types a letter', async () => {
    await start();
    await pick('t1');
    await user.click(screen.getByRole('radio', { name: 'View' }));
    const before = current();
    sheet().focus();
    await user.keyboard('p');
    expect(useApp.getState().doc).toBe(before);
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    const field = await screen.findByRole('textbox', { name: 'Lyric' });
    await user.clear(field);
    await user.type(field, 'p');
    expect(field).toHaveValue('p');
    expect(events().slice(0, 3).map(e => e.d)).toEqual([12, 12, 24]);
  });
});

describe('Lyrics mode and the Lyrics & chords card', () => {
  const hit = (id: string) => document.querySelector(`[data-hit="${id}"]`)!;
  const clickEvent = (id: string) => user.click(hit(id));
  const selectedId = () => document.querySelector('[data-selected="true"]')?.getAttribute('data-ev') ?? null;
  const current = () => useApp.getState().doc!;
  const ev = (id: string) => locate(current(), id)!.ev;
  /** The sample's notes that can carry a syllable, with their imported lyrics. */
  const lyricNotes = () => {
    const d = sampleDoc('xc');
    return derive(d, DEFAULT_PREFS).events.filter(e => !e.rest && !e.tiedFrom).map(e => ({ id: e.id, l: locate(d, e.id)!.ev.l }));
  };
  const field = () => screen.getByRole('textbox', { name: 'Lyric' });
  const lyrics = async () => {
    open('xc');
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
  };

  it('lyric field: type, Enter to the next note, Shift+Tab back, one undo step per note (review focus 4)', async () => {
    await lyrics();
    const notes = lyricNotes();
    await clickEvent(notes[0].id);
    await waitFor(() => expect(field()).toHaveFocus());
    const f = field();
    expect(f).toHaveFocus();
    expect(f).toHaveValue(notes[0].l);
    await user.clear(f);
    await user.type(f, 'Oh{Enter}');
    expect(ev(notes[0].id).l).toBe('Oh');
    expect(selectedId()).toBe(notes[1].id);
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue(notes[1].l);
    await user.type(field(), '!');
    expect(ev(notes[1].id).l).toBe(`${notes[1].l}!`);
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(selectedId()).toBe(notes[0].id);
    expect(field()).toHaveFocus();
    await user.keyboard('{Control>}z{/Control}');
    expect(ev(notes[1].id).l).toBe(notes[1].l);
    expect(ev(notes[0].id).l).toBe('Oh');
    await user.keyboard('{Control>}z{/Control}');
    expect(ev(notes[0].id).l).toBe(notes[0].l);
    expect(field()).toHaveValue(notes[0].l);
    expect(useApp.getState().past).toHaveLength(0);
  });

  it('Tab moves on and stays in the field; at the last note Enter keeps the selection and Tab leaves; Esc clears', async () => {
    await lyrics();
    const notes = lyricNotes();
    await clickEvent(notes[0].id);
    await waitFor(() => expect(field()).toHaveFocus());
    await user.keyboard('{Tab}');
    expect(selectedId()).toBe(notes[1].id);
    expect(field()).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(selectedId()).toBe(notes[0].id);
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    act(() => { field().dispatchEvent(shiftTab); });
    expect(shiftTab.defaultPrevented).toBe(true);   // the first note: Shift+Tab goes back to the sheet
    expect(screen.getByRole('group', { name: /Sheet music/ })).toHaveFocus();
    expect(selectedId()).toBe(notes[0].id);
    const last = notes[notes.length - 1];
    await clickEvent(last.id);
    expect(field()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(selectedId()).toBe(last.id);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => { field().dispatchEvent(tab); });
    expect(tab.defaultPrevented).toBe(false);
    expect(selectedId()).toBe(last.id);
    await user.keyboard('{Escape}');
    expect(selectedId()).toBeNull();
    expect(screen.queryByRole('group', { name: 'Lyrics panel' })).toBeNull();
    expect(screen.getByRole('group', { name: /Sheet music/ })).toHaveFocus();
  });

  it('symbol buttons insert at the caret and keep focus', async () => {
    await lyrics();
    const notes = lyricNotes();
    await clickEvent(notes[0].id);
    await screen.findByRole('textbox', { name: 'Lyric' });
    const f = field() as HTMLInputElement;
    await user.clear(f);
    await user.type(f, 'ab');
    f.setSelectionRange(1, 1);
    const panel = screen.getByRole('group', { name: 'Lyrics panel' });
    expect(within(panel).getAllByRole('button').map(b => b.getAttribute('aria-label')))
      .toEqual(['Insert ‿', 'Insert ’', 'Insert -', 'Insert „', 'Insert “', 'Insert …']);
    await user.click(within(panel).getByRole('button', { name: 'Insert ‿' }));
    expect(field()).toHaveValue('a‿b');
    expect(field()).toHaveFocus();
    expect((field() as HTMLInputElement).selectionStart).toBe(2);
    await user.keyboard('c');
    expect(ev(notes[0].id).l).toBe('a‿cb');
  });

  it('selecting a rest in Lyrics mode moves to the next note', async () => {
    const d = sampleDoc('xc');
    const notes = lyricNotes();
    const restDoc = toggleRest(d, notes[3].id)!;
    open('xc', { score: restDoc.score });
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    await clickEvent(notes[3].id);
    expect(selectedId()).toBe(notes[4].id);
    await waitFor(() => expect(field()).toHaveFocus());
    expect(field()).toHaveValue(notes[4].l);
  });

  it('arrow keys on the sheet move the selection and leave focus on the sheet', async () => {
    await lyrics();
    const notes = lyricNotes();
    const sheet = screen.getByRole('group', { name: /Sheet music/ });
    sheet.focus();
    await user.keyboard('{Home}{ArrowRight}');
    expect(selectedId()).toBe(notes[1].id);
    expect(sheet).toHaveFocus();
    expect(await screen.findByRole('textbox', { name: 'Lyric' })).toHaveValue(notes[1].l);
  });

  it('bulk card: fill from the selection, clear, edit count, restore', async () => {
    open('xc');
    const notes = lyricNotes();
    const card = screen.getByRole('region', { name: 'Lyrics & chords' });
    const range = screen.getByRole('region', { name: 'Range check' });
    expect(range.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.closest('[data-print-hide]')).not.toBeNull();
    expect(await within(card).findByText('0 edits to lyrics and chords')).toBeInTheDocument();
    const restore = within(card).getByRole('button', { name: 'Restore from file' });
    expect(restore).toBeDisabled();
    await clickEvent(notes[2].id);
    await user.type(within(card).getByRole('textbox', { name: 'Type or paste a verse' }), 'la la-la');
    await user.click(within(card).getByRole('button', { name: 'Fill lyrics' }));
    expect([2, 3, 4].map(k => ev(notes[k].id).l)).toEqual(['la', 'la-', 'la']);
    expect(ev(notes[1].id).l).toBe(notes[1].l);
    expect(within(card).getByText('3 edits to lyrics and chords')).toBeInTheDocument();
    expect(useApp.getState().past).toHaveLength(1);
    await user.click(restore);
    expect(within(card).getByText('0 edits to lyrics and chords')).toBeInTheDocument();
    expect(restore).toBeDisabled();
    expect(ev(notes[2].id).l).toBe(notes[2].l);
    expect(useApp.getState().past).toHaveLength(2);
    await user.click(within(card).getByRole('button', { name: 'Clear chords' }));
    expect(current().chords).toEqual({});
    expect(useApp.getState().past).toHaveLength(3);
    expect(within(card).getByRole('button', { name: 'Clear chords' })).toBeDisabled();
    await user.click(within(card).getByRole('button', { name: 'Clear lyrics' }));
    expect(current().score.flatMap(b => b.ev).every(e => e.l === '')).toBe(true);
    expect(useApp.getState().past).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(ev(notes[0].id).l).toBe(notes[0].l);
    expect(current().chords).toEqual({});
  });

  it('fill without a selection starts at the first note; one edit reads singular', async () => {
    open('xc');
    const notes = lyricNotes();
    const card = screen.getByRole('region', { name: 'Lyrics & chords' });
    await user.type(await within(card).findByRole('textbox', { name: 'Type or paste a verse' }), 'Oh');
    await user.click(within(card).getByRole('button', { name: 'Fill lyrics' }));
    expect(ev(notes[0].id).l).toBe('Oh');
    expect(within(card).getByText('1 edit to lyrics and chords')).toBeInTheDocument();
  });

  it('the field takes focus on a click, on a click that lands on the selected note again, and on a switch to Lyrics or Chords', async () => {
    const notes = lyricNotes();
    const restDoc = toggleRest(sampleDoc('xc'), notes[3].id)!;
    open('xc', { score: restDoc.score });
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    const sheet = screen.getByRole('group', { name: /Sheet music/ });
    await clickEvent(notes[4].id);
    await waitFor(() => expect(field()).toHaveFocus());
    sheet.focus();
    await clickEvent(notes[3].id);   // the rest hands the selection to the same note again
    expect(selectedId()).toBe(notes[4].id);
    expect(field()).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: 'Chords' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Chord' })).toHaveFocus());
    await user.click(screen.getByRole('radio', { name: 'View' }));
    await user.click(screen.getByRole('radio', { name: 'Lyrics' }));
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue(notes[4].l);
  });

  it('text edits do not stop playback; a pitch edit does', async () => {
    await lyrics();
    const notes = lyricNotes();
    await clickEvent(notes[0].id);
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    await user.click(screen.getByRole('button', { name: 'Listen from selected' }));
    fakePlayer.stop.mockClear();
    await user.type(await screen.findByRole('textbox', { name: 'Lyric' }), 'x');
    expect(ev(notes[0].id).l).toBe(`${notes[0].l}x`);
    act(() => { useApp.getState().applyEdit(setChord(current(), notes[1].id, 'G7', 0)); });
    await user.keyboard('{Control>}z{/Control}');
    await user.keyboard('{Control>}z{/Control}');
    expect(ev(notes[0].id).l).toBe(notes[0].l);
    expect(fakePlayer.stop).not.toHaveBeenCalled();
    act(() => { useApp.getState().applyEdit(shiftPitch(current(), notes[1].id, 1)); });
    expect(fakePlayer.stop).toHaveBeenCalled();
  });

  it('bulk card: a keyboard-activated button that disables itself hands the focus to the verse field', async () => {
    open('xc');
    const card = screen.getByRole('region', { name: 'Lyrics & chords' });
    const verse = await within(card).findByRole('textbox', { name: 'Type or paste a verse' });
    const btn = (name: string) => within(card).getByRole('button', { name });
    for (const name of ['Clear chords', 'Clear lyrics', 'Restore from file']) {
      btn(name).focus();
      await user.keyboard('{Enter}');
      expect(btn(name)).toBeDisabled();
      expect(verse).toHaveFocus();
    }
    expect(within(card).getByRole('status')).toHaveTextContent('0 edits to lyrics and chords');
  });

  it('a sheet with nothing imported says so and cannot be restored', async () => {
    open('xc', { imported: { lyrics: {}, chords: {} } });
    const card = screen.getByRole('region', { name: 'Lyrics & chords' });
    expect(await within(card).findByRole('status')).toHaveTextContent('Nothing was imported with this sheet.');
    expect(within(card).queryByText(/edits? to lyrics and chords/)).toBeNull();
    expect(within(card).getByRole('button', { name: 'Restore from file' })).toBeDisabled();
  });

  it('the verse field keeps the browser\'s own undo; Ctrl+S still saves', async () => {
    open('xc');
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    const t = await screen.findByRole('textbox', { name: 'Type or paste a verse' });
    t.focus();
    for (const init of [{ key: 'z', ctrlKey: true }, { key: 'z', metaKey: true }, { key: 'z', ctrlKey: true, shiftKey: true }, { key: 'y', ctrlKey: true }]) {
      const e = new KeyboardEvent('keydown', { code: `Key${init.key.toUpperCase()}`, bubbles: true, cancelable: true, ...init });
      act(() => { t.dispatchEvent(e); });
      expect(e.defaultPrevented).toBe(false);
    }
    expect(current().tempo).toBe(120);
    const save = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { t.dispatchEvent(save); });
    expect(save.defaultPrevented).toBe(true);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});

describe('Chords mode', () => {
  const hit = (id: string) => document.querySelector(`[data-hit="${id}"]`)!;
  const clickEvent = (id: string) => user.click(hit(id));
  const selectedId = () => document.querySelector('[data-selected="true"]')?.getAttribute('data-ev') ?? null;
  const current = () => useApp.getState().doc!;
  const events = () => current().score.flatMap(b => b.ev);
  const firstEvent = () => events()[0];
  const field = () => screen.getByRole('textbox', { name: 'Chord' }) as HTMLInputElement;
  const panel = () => screen.getByRole('group', { name: 'Chords panel' });
  /** The chord drawn on the sheet for an event, extensions and bass flattened into one string. */
  const chordOnSheet = (id: string) => document.querySelector(`[data-ev="${id}"] [data-chord]`)?.textContent ?? null;
  const chords = async (id: InstId, patch: Partial<Doc> = {}) => {
    open(id, patch);
    await user.click(screen.getByRole('radio', { name: 'Chords' }));
  };
  const BAD = 'Not a chord we can transpose. Start with a note name A–G.';

  it('check 7: typing Bb shows B♭; F#m7b5/C# is stored and drawn; transposing moves chords', async () => {
    await chords('fl');
    const e = firstEvent();
    await clickEvent(e.id);
    await waitFor(() => expect(field()).toHaveFocus());
    const f = field();
    expect(f).toHaveFocus();
    expect(screen.getByText('b → ♭ and # → ♯ after a note name')).toBeInTheDocument();
    await user.clear(f);
    await user.type(f, 'Bb');
    expect(f).toHaveValue('B♭');
    await user.clear(f);
    await user.type(f, 'F#m7b5/C#');
    expect(f).toHaveValue('F♯m7♭5/C♯');
    expect(current().chords[e.id]).toMatchObject({ ok: true });
    expect(chordOnSheet(e.id)).toBe('F♯m7♭5/C♯');
    act(() => useApp.getState().setShift(current().shift + 2));
    expect(chordOnSheet(e.id)).toBe('G♯m7♭5/D♯');
    expect(field()).toHaveValue('G♯m7♭5/D♯');
  });

  it('prettifying keeps the caret where it was typed', async () => {
    await chords('fl');
    await clickEvent(firstEvent().id);
    await screen.findByRole('textbox', { name: 'Chord' });
    const f = field();
    await user.clear(f);
    await user.type(f, 'A7');
    f.setSelectionRange(1, 1);
    await user.keyboard('b');
    expect(f).toHaveValue('A♭7');
    expect(f.selectionStart).toBe(2);
  });

  it('chords on rests and tied notes; empty removes; invalid stays red with the message', async () => {
    const d = sampleDoc('fl');
    const all = derive(d, DEFAULT_PREFS).events;
    const cont = all.find(x => x.tiedFrom)!;
    const note = all.find(x => !x.rest && !x.tiedFrom && !x.tieTo && !(x.id in d.chords))!;
    const restDoc = toggleRest(d, note.id)!;
    await chords('fl', { score: restDoc.score });
    await clickEvent(note.id);
    expect(selectedId()).toBe(note.id);
    await screen.findByRole('textbox', { name: 'Chord' });
    const f = field();
    expect(f).toHaveValue('');
    await user.type(f, 'N.C.');
    expect(within(panel()).getByRole('status')).toHaveTextContent(BAD);
    expect(f).toHaveAttribute('aria-invalid', 'true');
    expect(current().chords[note.id]).toMatchObject({ ok: false, raw: 'N.C.' });
    expect(document.querySelector(`[data-ev="${note.id}"] [data-chord]`)).toHaveAttribute('data-chord', 'bad');
    await user.clear(f);
    expect(current().chords[note.id]).toBeUndefined();
    expect(screen.queryByText(BAD)).toBeNull();
    expect(f).toHaveAttribute('aria-invalid', 'false');
    await clickEvent(cont.id);
    expect(selectedId()).toBe(cont.id);
    await user.type(field(), 'Dm');
    expect(current().chords[cont.id]).toMatchObject({ ok: true, raw: 'Dm' });
    expect(chordOnSheet(cont.id)).toBe('Dm');
  });

  it('buttons insert at the caret; "( )" puts the caret inside', async () => {
    await chords('fl');
    await clickEvent(firstEvent().id);
    await screen.findByRole('textbox', { name: 'Chord' });
    const f = field();
    expect(within(panel()).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([
      'Insert ♭', 'Insert ♯', 'Insert m', 'Insert °', 'Insert ø', 'Insert Δ7', 'Insert 7', 'Insert sus4', 'Insert add9', 'Insert 6', 'Insert /', 'Insert ( )',
    ]);
    await user.clear(f);
    await user.type(f, 'C');
    await user.click(within(panel()).getByRole('button', { name: 'Insert ( )' }));
    expect(f).toHaveValue('C()');
    expect(f).toHaveFocus();
    expect(f.selectionStart).toBe(2);
    await user.keyboard('9');
    expect(f).toHaveValue('C(9)');
    f.setSelectionRange(4, 4);
    await user.click(within(panel()).getByRole('button', { name: 'Insert Δ7' }));
    expect(f).toHaveValue('C(9)Δ7');
    expect(f).toHaveFocus();
    expect(f.selectionStart).toBe(6);
    f.setSelectionRange(1, 1);
    await user.click(within(panel()).getByRole('button', { name: 'Insert ♯' }));
    expect(f).toHaveValue('C♯(9)Δ7');
    expect(current().chords[firstEvent().id]).toMatchObject({ ok: true, rest: '(9)Δ7' });
  });

  it('Enter moves to the next event including rests; one undo step per chord', async () => {
    const d = sampleDoc('fl');
    const k = d.score.flatMap(b => b.ev).findIndex((x, j, all) => j > 0 && !(x.id in d.chords) && !(all[j + 1]?.id in d.chords));
    const all0 = d.score.flatMap(b => b.ev);
    const restDoc = toggleRest(d, all0[k + 1].id)!;
    await chords('fl', { score: restDoc.score });
    const [a, rest, after] = [all0[k], all0[k + 1], all0[k + 2]];
    await clickEvent(a.id);
    await user.type(await screen.findByRole('textbox', { name: 'Chord' }), 'G{Enter}');
    expect(selectedId()).toBe(rest.id);
    expect(field()).toHaveFocus();
    await user.type(field(), 'C7{Tab}');
    expect(selectedId()).toBe(after.id);
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(selectedId()).toBe(rest.id);
    expect(field()).toHaveValue('C7');
    await user.keyboard('{Control>}z{/Control}');
    expect(current().chords[rest.id]).toBeUndefined();
    expect(field()).toHaveValue('');
    expect(current().chords[a.id]).toMatchObject({ raw: 'G' });
    await user.keyboard('{Control>}z{/Control}');
    expect(current().chords[a.id]).toBeUndefined();
    expect(useApp.getState().past).toHaveLength(0);
    await user.keyboard('{Escape}');
    expect(selectedId()).toBeNull();
    expect(screen.queryByRole('group', { name: 'Chords panel' })).toBeNull();
  });

  it('at the first and last event Tab leaves the panel', async () => {
    await chords('fl');
    const all = events();
    await clickEvent(all[0].id);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    await screen.findByRole('textbox', { name: 'Chord' });
    act(() => { field().dispatchEvent(back); });
    expect(back.defaultPrevented).toBe(true);   // back to the sheet, the selection stays
    expect(screen.getByRole('group', { name: /Sheet music/ })).toHaveFocus();
    expect(selectedId()).toBe(all[0].id);
    await clickEvent(all[all.length - 1].id);
    const on = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => { field().dispatchEvent(on); });
    expect(on.defaultPrevented).toBe(false);
    await user.keyboard('{Enter}');
    expect(selectedId()).toBe(all[all.length - 1].id);
  });
});

it('redirects without a doc', () => {
  useApp.setState({ doc: null });
  renderSheet();
  expect(currentPath()).toBe('/');
});

describe('play mode', () => {
  const region = () => screen.queryByRole('region', { name: 'Play mode' });

  it('opens with the Play mode button and closes with Esc, back on the button', async () => {
    open('asax');
    await user.click(screen.getByRole('button', { name: 'Play mode' }));
    await screen.findByRole('region', { name: 'Play mode' });
    expect(within(region()!).getByRole('heading', { level: 1 })).toHaveTextContent('The Water Is Wide');
    expect(screen.getByRole('textbox', { name: 'Sheet title' }).closest('[inert]')).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(region()).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Sheet title' }).closest('[inert]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play mode' })).toHaveFocus();
  });

  it('stops the audio on the way in', async () => {
    open('asax');
    fakePlayer.play.mockImplementation(() => { fakePlayer.playing = true; });
    fakePlayer.stop.mockImplementation(() => { fakePlayer.playing = false; });
    await user.click(screen.getByRole('button', { name: 'Listen' }));
    fakePlayer.stop.mockClear();
    await user.click(screen.getByRole('button', { name: 'Play mode' }));
    await screen.findByRole('region', { name: 'Play mode' });
    expect(fakePlayer.stop).toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Listen' })).toBeInTheDocument();
  });

  it('leaves the edit mode and the selection behind', async () => {
    const { container } = open('asax');
    await user.click(screen.getByRole('radio', { name: /Edit notes/ }));
    await user.click(container.querySelector('[data-hit]')!);
    expect(screen.getByRole('button', { name: 'Listen from selected' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play mode' }));
    await screen.findByRole('region', { name: 'Play mode' });
    await user.keyboard('{Escape}');
    expect(screen.getByRole('radio', { name: /View/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Listen' })).toBeInTheDocument();
  });

  it('changes nothing in the document: undo, redo and save shortcuts are off', async () => {
    open('asax');
    act(() => useApp.getState().patchDoc({ tempo: 120 }));
    const before = useApp.getState().doc;
    await user.click(screen.getByRole('button', { name: 'Play mode' }));
    await screen.findByRole('region', { name: 'Play mode' });
    await user.keyboard('{Control>}z{/Control}');
    await user.keyboard('{Control>}s{/Control}');
    expect(useApp.getState().doc).toBe(before);
    expect(listEntries()).toHaveLength(0);
  });
});

describe('jump marks: the Bar section and the notice', () => {
  const hit = (id: string) => document.querySelector(`[data-hit="${id}"]`)!;
  const sheet = () => screen.getByRole('group', { name: /Sheet music/ });
  const live = () => sheet().querySelector('[aria-live="polite"]')!;
  const panel = () => screen.getByRole('group', { name: 'Edit notes panel' });
  const bar = () => within(panel()).getByRole('group', { name: 'Bar' });
  const current = () => useApp.getState().doc!;
  const region = () => screen.queryByRole('status', { name: 'Jump marks' });
  /** The notice as the player sees it: the region with something in it. */
  const notice = () => (region()?.textContent ? region() : null);
  const IGNORED = 'Playback ignores the jump.';
  /** The sample, with `marks` applied; bar indices as in the document. */
  const openMarked = async (marks: (d: Doc) => Doc = d => d) => {
    open('asax', marks(sampleDoc('asax')));
    await user.click(screen.getByRole('radio', { name: 'Edit notes' }));
  };
  const selectBar = async (k: number) => {
    await user.click(hit(current().score[k].ev[0].id));
    await screen.findByRole('group', { name: 'Edit notes panel' });
  };
  const label = (k: number) => barLabelOf(current(), k);
  const doc0 = () => sampleDoc('asax');

  it('shows the section Bar with four toggles and a select, for the bar of the selected note', async () => {
    await openMarked();
    await selectBar(2);
    for (const name of ['Segno', 'Coda', 'Fine', 'To Coda']) {
      expect(within(bar()).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    const select = within(bar()).getByLabelText('Jump at the end of the bar');
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(
      ['None', 'D.C.', 'D.C. al Fine', 'D.C. al Coda', 'D.S.', 'D.S. al Fine', 'D.S. al Coda']);
  });

  it('a toggle sets the mark on that bar as one undo step; Undo takes it back', async () => {
    await openMarked();
    await selectBar(2);
    const before = current();
    await user.click(within(bar()).getByRole('button', { name: 'Segno' }));
    expect(current().score[2].segno).toBe(true);
    expect(within(bar()).getByRole('button', { name: 'Segno' })).toHaveAttribute('aria-pressed', 'true');
    expect(live()).toHaveTextContent(`Bar ${label(2)}: Segno`);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useApp.getState().doc).toBe(before);
    expect(useApp.getState().past).toHaveLength(0);
  });

  it('the select sets the jump; "None" clears it', async () => {
    await openMarked();
    await selectBar(3);
    const select = within(bar()).getByLabelText('Jump at the end of the bar');
    await user.selectOptions(select, 'D.S. al Coda');
    expect(current().score[3].jump).toBe('dsCoda');
    expect(live()).toHaveTextContent(`Bar ${label(3)}: D.S. al Coda`);
    await user.selectOptions(select, 'None');
    expect('jump' in current().score[3]).toBe(false);
    expect(live()).toHaveTextContent(`Bar ${label(3)}: D.S. al Coda removed`);
  });

  it('a mark set on a second bar moves; Undo brings it back to the first and says so', async () => {
    await openMarked(d => setBarMark(d, 1, 'fine', true));
    await selectBar(3);
    await user.click(within(bar()).getByRole('button', { name: 'Fine' }));
    expect(current().score.map(b => b.fine)).toEqual(current().score.map((_b, k) => (k === 3 ? true : undefined)));
    expect(live()).toHaveTextContent(`Bar ${label(3)}: Fine moved from bar ${label(1)}`);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(current().score[1].fine).toBe(true);
    expect('fine' in current().score[3]).toBe(false);
  });

  it('the notice names a jump without a Segno, and goes when the marks add up', async () => {
    await openMarked(d => setJump(d, 17, 'ds'));     // the last bar: bars 2 to 17 are a repeated section
    expect(notice()).toHaveTextContent(`D.S. in bar ${label(17)} needs a Segno.`);
    expect(notice()).toHaveTextContent(IGNORED);
    await selectBar(1);
    await user.click(within(bar()).getByRole('button', { name: 'Segno' }));
    expect(notice()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(notice()).not.toBeNull();
  });

  it('removing the Segno bar of a D.S. song shows the notice; Undo removes it', async () => {
    await openMarked(d => setJump(setBarMark(d, 1, 'segno', true), 17, 'ds'));
    expect(notice()).toBeNull();
    await selectBar(1);
    await user.click(within(panel()).getByRole('button', { name: 'Remove bar' }));
    expect(notice()).toHaveTextContent('needs a Segno');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(notice()).toBeNull();
  });

  it('the notice sits above the paper and below the other banner, which keeps its own message', async () => {
    await openMarked(d => setJump(d, 3, 'ds'));
    expect(screen.getByText(/Suggested key applied/)).toBeInTheDocument();
    const n = notice()!;
    expect(n.closest('[data-print-hide]')).not.toBeNull();
    expect(document.querySelector('[data-print-paper]')!.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.getByText(/Suggested key applied/).compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lists the sentences an import left out', () => {
    open('asax', { source: { ...doc0().source, dropped: ['A coda sign in bar 9 was left out.'] } });
    expect(notice()).toHaveTextContent('A coda sign in bar 9 was left out.');
  });

  it('is not shown without a problem or a dropped sentence', () => {
    open('asax');
    expect(notice()).toBeNull();
  });

  it('the sheet keys do nothing while the select has focus: D does not change the pitch', async () => {
    await openMarked();
    await selectBar(2);
    const id = current().score[2].ev[0].id;
    const m = locate(current(), id)!.ev.m;
    const select = within(bar()).getByLabelText('Jump at the end of the bar');
    select.focus();
    await user.keyboard('d');
    expect(locate(current(), id)!.ev.m).toBe(m);
    expect(useApp.getState().past).toHaveLength(0);
  });

  it('the toggles work with Space and Enter and the select is next in the Tab order', async () => {
    await openMarked();
    await selectBar(2);
    within(bar()).getByRole('button', { name: 'Coda' }).focus();
    await user.keyboard(' ');
    expect(current().score[2].coda).toBe(true);
    await user.keyboard('{Enter}');
    expect('coda' in current().score[2]).toBe(false);
    await user.tab();
    await user.tab();
    await user.tab();
    expect(within(bar()).getByLabelText('Jump at the end of the bar')).toHaveFocus();   // the arrow keys are in e2e/jump-edit.spec.ts
  });

  it('the status region that exists before a problem receives its text, and is empty again after Undo', async () => {
    await openMarked(d => setJump(setBarMark(d, 1, 'segno', true), 17, 'ds'));
    const before = region()!;
    expect(before).toBeEmptyDOMElement();
    await selectBar(1);
    await user.click(within(panel()).getByRole('button', { name: 'Remove bar' }));
    expect(region()).toBe(before);
    expect(before).toHaveTextContent('needs a Segno');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(region()).toBe(before);
    expect(before).toBeEmptyDOMElement();
  });

  it('is not rendered while play mode is on', async () => {
    open('asax', setJump(sampleDoc('asax'), 3, 'ds'));
    expect(notice()).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Play mode' }));
    await screen.findByRole('region', { name: 'Play mode' });
    expect(region()).toBeNull();
  });

  it('moving the jump to another bar is one undo step, announced with its origin', async () => {
    await openMarked(d => setJump(d, 1, 'dc'));
    await selectBar(3);
    const before = current();
    await user.selectOptions(within(bar()).getByLabelText('Jump at the end of the bar'), 'D.C.');
    expect(current().score.map(b => b.jump)).toEqual(current().score.map((_b, k) => (k === 3 ? 'dc' : undefined)));
    expect(live()).toHaveTextContent(`Bar ${label(3)}: D.C. moved from bar ${label(1)}`);
    expect(useApp.getState().past).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useApp.getState().doc).toBe(before);
  });

  it('changing the jump select again on the same bar is one undo step; another bar, a toggle or another edit starts a new one', async () => {
    await openMarked();
    await selectBar(3);
    const before = current();
    const select = () => within(bar()).getByLabelText('Jump at the end of the bar');
    await user.selectOptions(select(), 'D.C.');
    await user.selectOptions(select(), 'D.C. al Fine');
    expect(current().score[3].jump).toBe('dcFine');
    expect(useApp.getState().past).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useApp.getState().doc).toBe(before);

    await user.selectOptions(select(), 'D.C.');
    await user.click(within(bar()).getByRole('button', { name: 'Fine' }));     // a toggle in between
    await user.selectOptions(select(), 'D.C. al Fine');
    expect(useApp.getState().past).toHaveLength(3);
    await selectBar(1);
    await user.selectOptions(select(), 'D.S.');                                  // another bar
    expect(useApp.getState().past).toHaveLength(4);
    await user.selectOptions(select(), 'D.S. al Fine');
    expect(useApp.getState().past).toHaveLength(4);
  });

  it('with a rest selected the Bar section acts on the bar of the rest', async () => {
    const d = sampleDoc('asax');
    const note = d.score[2].ev.find(e => !e.r)!;
    await openMarked(x => toggleRest(x, note.id)!);
    await user.click(hit(note.id));
    await screen.findByRole('group', { name: 'Edit notes panel' });
    await user.click(within(bar()).getByRole('button', { name: 'Segno' }));
    expect(current().score.map(b => b.segno)).toEqual(current().score.map((_b, k) => (k === 2 ? true : undefined)));
  });

  it('with a note inside a triplet selected the Bar section acts on the bar of the triplet', async () => {
    const d = sampleDoc('asax');
    const k = 2;
    const quarter = d.score[k].ev.find(e => !e.r && e.d === 12)!;
    const made = toggleTriplet(d, quarter.id)!;
    await openMarked(() => made.doc);
    const second = made.doc.score[k].ev[made.doc.score[k].ev.findIndex(e => e.id === quarter.id) + 1];
    await user.click(hit(second.id));
    await screen.findByRole('group', { name: 'Edit notes panel' });
    await user.click(within(bar()).getByRole('button', { name: 'Fine' }));
    expect(current().score.map(b => b.fine)).toEqual(current().score.map((_b, i) => (i === k ? true : undefined)));
  });
});
