import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../shell/App';
import { sampleDoc } from '../domain/fixture';
import { buildScale, scaleFingerings } from '../domain/scales';
import { PdfError } from '../pdf/errors';
import { requestScalePdf, scalePdfModule } from '../pdf/request';
import { useApp } from '../state/store';
import type { ScalePdfInput } from '../pdf/scalePdf';
import Scales from './Scales';
import { fingeringPanelModule } from '../ui/fingering/useFingeringPanel';

vi.mock('../pdf/request', () => ({ requestScalePdf: vi.fn(async () => {}), scalePdfModule: { prefetch: vi.fn() } }));

const user = userEvent.setup();

const renderScales = () => render(<MemoryRouter initialEntries={['/scales']}><Scales /></MemoryRouter>);
const renderApp = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
const noteNames = () => [...document.querySelectorAll('[data-name]')].map(e => e.textContent);

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ instId: 'asax', doc: null });
  vi.mocked(requestScalePdf).mockReset();
  vi.mocked(requestScalePdf).mockResolvedValue(undefined);
});

it('opens with the preferred instrument, C major, one octave up', () => {
  renderScales();
  expect(screen.getByRole('heading', { level: 1, name: 'Scales with fingerings' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Instrument' })).toHaveValue('asax');
  expect(screen.getByRole('combobox', { name: 'Scale' })).toHaveValue('maj');
  expect(within(screen.getByRole('radiogroup', { name: 'Key' })).getByRole('radio', { name: 'C · sounds E♭' })).toBeChecked();
  expect(screen.getByRole('radio', { name: '1 octave' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Up' })).toBeChecked();
  expect(within(screen.getByRole('region', { name: 'Scale' })).getByText('Alto sax in E♭ · C major · sounds E♭ major')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-note]')).toHaveLength(8);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('header navigation', async () => {
  renderApp('/scales');
  expect(await screen.findByRole('heading', { level: 1, name: 'Scales with fingerings' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Scales' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Songs' })).not.toHaveAttribute('aria-current');
});

it('scale, key, range and direction change the notation', async () => {
  renderScales();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Scale' }), 'blues');
  await user.click(screen.getByRole('radio', { name: /^E · sounds G$/ }));
  expect(noteNames()).toEqual(['E4', 'G4', 'A4', 'B♭4', 'B4', 'D5', 'E5']);
  await user.click(screen.getByRole('radio', { name: 'Up & down' }));
  expect(noteNames()).toHaveLength(13);
  await user.click(screen.getByRole('radio', { name: '2 octaves' }));
  expect(noteNames().length).toBeGreaterThan(13);
});

it('name keys by what sounds', async () => {
  renderScales();
  await user.click(screen.getByRole('radio', { name: 'Sounds in' }));
  const chips = within(screen.getByRole('radiogroup', { name: 'Key' })).getAllByRole('radio');
  expect(chips[0]).toHaveAccessibleName('C · you read A');
  expect(chips.find(c => c.getAttribute('aria-checked') === 'true')).toHaveAccessibleName('E♭ · you read C');
});

it('non-transposing instruments have plain chips and no naming toggle', async () => {
  renderScales();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'fl');
  expect(screen.queryByRole('radiogroup', { name: 'Name keys by' })).toBeNull();
  expect(within(screen.getByRole('radiogroup', { name: 'Key' })).getAllByRole('radio')[0]).toHaveAccessibleName('C');
  expect(within(screen.getByRole('region', { name: 'Scale' })).getByText('Flute in C · C major')).toBeInTheDocument();
});

it('the instrument changes keep the key by its written pitch class', async () => {
  renderScales();
  await user.click(screen.getByRole('radio', { name: 'D · sounds F' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'cl');
  expect(screen.getByRole('radio', { name: 'D · sounds C' })).toBeChecked();
});

it('the notice shows for scales that leave the normal range', async () => {
  renderScales();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'xc');
  await user.click(screen.getByRole('radio', { name: 'B' }));
  await user.click(screen.getByRole('radio', { name: '2 octaves' }));
  expect(screen.getByRole('status')).toHaveTextContent('The second octave does not fit this instrument. Shown up to B5.');
  await user.click(screen.getByRole('radio', { name: '1 octave' }));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('chart style or recorder system by instrument family', async () => {
  renderScales();
  expect(screen.getByRole('radiogroup', { name: 'Chart style' })).toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'rs');
  expect(screen.getByRole('radiogroup', { name: 'Recorder system' })).toBeInTheDocument();
  expect(screen.queryByRole('radiogroup', { name: 'Chart style' })).toBeNull();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'xc');
  expect(screen.queryByRole('radiogroup', { name: /Chart style|Recorder system/ })).toBeNull();
});

it('checkboxes: note names and alternates', async () => {
  renderScales();
  expect(screen.getByLabelText('Note names')).toBeChecked();
  expect(screen.getByLabelText('Show alternate fingerings')).not.toBeChecked();
  await user.click(screen.getByLabelText('Note names'));
  expect(document.querySelectorAll('[data-name]')).toHaveLength(0);
  await user.click(screen.getByRole('radio', { name: /^F · sounds A♭$/ }));
  expect(document.querySelectorAll('[data-alt]')).toHaveLength(0);
  await user.click(screen.getByLabelText('Show alternate fingerings'));
  expect(document.querySelectorAll('[data-alt]').length).toBeGreaterThan(0);
});

it('settings are remembered; the preferred instrument and an open sheet are untouched', async () => {
  const doc = sampleDoc('asax');
  useApp.setState({ doc });
  const first = renderScales();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'cl');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Scale' }), 'hmin');
  await user.click(screen.getByRole('radio', { name: 'Whole range' }));
  await user.click(screen.getByRole('radio', { name: 'Full key map' }));
  first.unmount();
  expect(useApp.getState().instId).toBe('asax');
  expect(useApp.getState().doc).toBe(doc);
  renderScales();
  expect(screen.getByRole('combobox', { name: 'Instrument' })).toHaveValue('cl');
  expect(screen.getByRole('combobox', { name: 'Scale' })).toHaveValue('hmin');
  expect(screen.getByRole('radio', { name: 'Whole range' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Full key map' })).toBeChecked();
});

it('foreign stored settings fall back field by field (review focus 5)', () => {
  localStorage.setItem('fingerscore.scales', JSON.stringify({ inst: 'oboe', scale: 'lydian', tonicPc: 99, range: 7, direction: null, showNames: 'yes', by: 'sound' }));
  renderScales();
  expect(screen.getByRole('combobox', { name: 'Instrument' })).toHaveValue('asax');
  expect(screen.getByRole('combobox', { name: 'Scale' })).toHaveValue('maj');
  expect(screen.getByRole('radio', { name: '1 octave' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Up' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'E♭ · you read C' })).toBeChecked();
  expect(screen.getByLabelText('Note names')).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Sounds in' })).toBeChecked();
  localStorage.setItem('fingerscore.scales', '{oops');
  cleanup();
  expect(() => renderScales()).not.toThrow();
  expect(screen.getByRole('combobox', { name: 'Instrument' })).toHaveValue('asax');
});

it('Print prints', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  renderScales();
  await user.click(screen.getByRole('button', { name: 'Print' }));
  expect(print).toHaveBeenCalled();
  print.mockRestore();
});

it('only the scale section is marked for print', () => {
  renderScales();
  expect(screen.getByRole('region', { name: 'Scale' })).toHaveAttribute('data-print-scale');
  expect(screen.getByRole('button', { name: 'Print' }).closest('[data-print-hide]')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Download PDF' }).closest('[data-print-hide]')).not.toBeNull();
});

describe('Play mode', () => {
  it('shows the scale alone, paced one note per beat, and Esc returns to the button', async () => {
    renderScales();
    const button = screen.getByRole('button', { name: 'Play mode' });
    expect(button.closest('[data-print-hide]')).not.toBeNull();
    await user.click(button);
    const region = await screen.findByRole('region', { name: 'Play mode' });
    const sheet = within(region).getByRole('region', { name: 'Scale' });
    expect(within(sheet).getByRole('heading', { level: 2 })).toHaveTextContent(screen.getAllByRole('heading', { level: 2 })[0].textContent!);
    expect(sheet).not.toHaveAttribute('data-print-scale');
    expect(region.querySelectorAll('[data-note]')).toHaveLength(8);
    expect(region.querySelectorAll('[data-play-line]')).toHaveLength(1);
    expect(within(region).getByText('♩ = 60 · 100% · 1 line / 8 s')).toBeInTheDocument();
    expect(within(region).getByText('Page 1 / 1')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Play mode' })).toBeNull();
    expect(button).toHaveFocus();
  });

  it('starts the tempo at 60 on every visit and stores none', async () => {
    renderScales();
    await user.click(screen.getByRole('button', { name: 'Play mode' }));
    const region = await screen.findByRole('region', { name: 'Play mode' });
    const slider = within(region).getByRole('slider', { name: 'Tempo' });
    expect(slider).toHaveValue('60');
    expect(slider).toHaveAttribute('min', '20');
    expect(slider).toHaveAttribute('max', '90');
    fireEvent.change(slider, { target: { value: '45' } });
    expect(within(region).getByText('♩ = 45 · 75% · 1 line / 11 s')).toBeInTheDocument();
    expect(localStorage.getItem('fingerscore.playtempo')).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Play mode' }));
    const again = await screen.findByRole('region', { name: 'Play mode' });
    expect(within(again).getByRole('slider', { name: 'Tempo' })).toHaveValue('60');
  });

  it('keeps the picks and drops the pills', async () => {
    localStorage.setItem('fingerscore.scales', JSON.stringify({ inst: 'asax', scale: 'maj', tonicPc: 5, showAlternates: false }));
    renderScales();
    const page = screen.getAllByRole('region', { name: 'Scale' })[0];
    const pill = within(page).getAllByRole('button', { name: /⇅/ })[0];
    await user.click(pill);
    const dialog = screen.getByRole('dialog');
    const other = within(dialog).getAllByRole('button').find(b => !/auto/.test(b.textContent!))!;
    await user.click(other);
    const options = () => [...page.querySelectorAll('[data-chart]')].map(c => c.getAttribute('data-option'));
    const picked = options();
    await user.click(screen.getByRole('button', { name: 'Play mode' }));
    const region = await screen.findByRole('region', { name: 'Play mode' });
    expect([...region.querySelectorAll('[data-chart]')].map(c => c.getAttribute('data-option'))).toEqual(picked);
    expect(within(region).queryAllByRole('button', { name: /⇅/ })).toHaveLength(0);
  });
});

it('radiogroups work with arrow keys', async () => {
  renderScales();
  screen.getByRole('radio', { name: '1 octave' }).focus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('radio', { name: '2 octaves' })).toBeChecked();
  expect(screen.getByRole('radio', { name: '2 octaves' })).toHaveFocus();
  expect(screen.getByRole('radio', { name: '2 octaves' })).toHaveAttribute('tabindex', '0');
  expect(screen.getByRole('radio', { name: '1 octave' })).toHaveAttribute('tabindex', '-1');
});

describe('choosable alternate fingerings', () => {
  const pills = () => screen.queryAllByRole('button', { name: /^⇅ \d+ alternate fingerings for / });
  const fMajor = async () => user.click(screen.getByRole('radio', { name: /^F · sounds A♭$/ }));
  /** Opens the first pill and picks an option that is not the automatic one. */
  async function pickOne() {
    await user.click(pills()[0]);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getAllByRole('button').find(b => !/auto/.test(b.textContent!))!);
  }
  const changed = () => screen.queryByText(/· 1 changed by you$/);

  it('pills only under notes with two or more fingerings; the summary counts them', async () => {
    renderScales();   // alto sax C major: only C5 has two fingerings
    expect(pills().map(p => p.getAttribute('aria-label'))).toEqual(['⇅ 2 alternate fingerings for C5']);
    expect(pills()[0]).toHaveAttribute('aria-haspopup', 'dialog');
    expect(pills()[0]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('1 note has alternate fingerings · 0 changed by you')).toBeInTheDocument();
    await fMajor();   // B♭4 has 4, C5 has 2
    expect(pills().map(p => p.getAttribute('aria-label'))).toEqual(['⇅ 4 alternate fingerings for B♭4', '⇅ 2 alternate fingerings for C5']);
    expect(screen.getByText('2 notes have alternate fingerings · 0 changed by you')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset all to auto' })).toBeNull();
    await user.click(screen.getByLabelText('Show alternate fingerings'));
    expect(pills()).toHaveLength(2);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'xc');
    expect(pills()).toHaveLength(0);
    expect(screen.queryByText(/alternate fingerings ·/)).toBeNull();
  });

  it('open, pick, summary, teal pill, reset', async () => {
    renderScales();
    await fMajor();
    const pill = pills()[0];
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog', { name: 'Alternate fingerings for B♭4' });
    expect(dialog).toHaveTextContent(/^B♭4 — pick a fingering/);
    // The fingerings, then "Show on instrument" at the foot.
    const options = within(dialog).getAllByRole('button').filter(b => b.textContent !== 'Show on instrument');
    expect(options).toHaveLength(4);
    expect(within(dialog).getByRole('button', { name: 'Show on instrument' })).toBeInTheDocument();
    expect(within(dialog).getByText('auto')).toBeInTheDocument();
    const before = document.querySelectorAll('[data-note]')[3].querySelector('[data-chart]')!.getAttribute('data-option');
    const other = options.findIndex(b => !/auto/.test(b.textContent!));
    await user.click(options[other]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pill).toHaveFocus();
    expect(screen.getByText('2 notes have alternate fingerings · 1 changed by you')).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-overridden', 'true');
    const chart = document.querySelectorAll('[data-note]')[3].querySelector('[data-chart]')!;
    expect(chart).toHaveAttribute('data-option', String(other));
    expect(chart).toHaveAttribute('data-overridden', 'true');
    expect(String(other)).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Reset all to auto' }));
    expect(screen.getByText('2 notes have alternate fingerings · 0 changed by you')).toBeInTheDocument();
    expect(pills()[0]).not.toHaveAttribute('data-overridden');
    expect(document.querySelectorAll('[data-overridden]')).toHaveLength(0);
  });

  it('picking the auto option removes the override; Esc and outside click close and return the focus', async () => {
    renderScales();
    await fMajor();
    await pickOne();
    expect(changed()).toBeInTheDocument();
    const pill = pills()[0];
    await user.click(pill);
    await user.click(within(screen.getByRole('dialog')).getByText('auto').closest('button')!);
    expect(changed()).toBeNull();

    await user.click(pill);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pill).toHaveFocus();
    expect(pill).toHaveAttribute('aria-expanded', 'false');

    await user.click(pill);
    await user.click(screen.getByRole('heading', { level: 1 }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pill).toHaveFocus();
  });

  it('picks clear when the notes or their fingering tables change, and survive display changes', async () => {
    renderScales();
    await fMajor();
    await pickOne();
    await user.click(screen.getByRole('radio', { name: 'Full key map' }));
    await user.click(screen.getByLabelText('Note names'));
    await user.click(screen.getByLabelText('Show alternate fingerings'));
    await user.click(screen.getByRole('radio', { name: 'Sounds in' }));
    expect(changed()).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'You read' }));

    const changes: (() => Promise<void>)[] = [
      () => user.selectOptions(screen.getByRole('combobox', { name: 'Scale' }), 'mmin').then(() => user.selectOptions(screen.getByRole('combobox', { name: 'Scale' }), 'maj')),
      () => user.click(screen.getByRole('radio', { name: 'C · sounds E♭' })).then(fMajor),
      () => user.click(screen.getByRole('radio', { name: '2 octaves' })).then(() => user.click(screen.getByRole('radio', { name: '1 octave' }))),
      () => user.click(screen.getByRole('radio', { name: 'Up & down' })).then(() => user.click(screen.getByRole('radio', { name: 'Up' }))),
      () => user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'tsax').then(() => user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'asax')),
    ];
    for (const change of changes) {
      if (!changed()) await pickOne();
      expect(changed()).toBeInTheDocument();
      await change();
      expect(changed()).toBeNull();
    }

    await user.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'rs');
    await user.click(screen.getByRole('radio', { name: 'C' }));
    await pickOne();   // soprano recorder C major: B4 has two fingerings
    expect(changed()).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'German fingering' }));
    expect(changed()).toBeNull();
  });

  it('picks are stored with the settings; a stale stored pick is dropped', async () => {
    const first = renderScales();
    await fMajor();
    await pickOne();
    first.unmount();
    renderScales();
    expect(changed()).toBeInTheDocument();
    cleanup();

    // F major on alto sax: index 3 is B♭4 (4 options), 4 is C5 (2 options), 0 is F4 (1 option).
    localStorage.setItem('fingerscore.scales', JSON.stringify({
      inst: 'asax', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up', overrides: { 0: 1, 3: 9, 4: 1, 40: 0, x: 1 },
    }));
    renderScales();
    expect(screen.getByText('2 notes have alternate fingerings · 1 changed by you')).toBeInTheDocument();
    expect(pills()[1]).toHaveAttribute('data-overridden', 'true');
    expect(JSON.parse(localStorage.getItem('fingerscore.scales')!).overrides).toEqual({ 4: 1 });
  });

  it('stored picks: only plain index keys, and never the automatic option', () => {
    const notes = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up' }).notes;
    const auto = scaleFingerings('asax', notes, 'baroque', {})[3].auto!;   // B♭4
    const other = auto === 0 ? 1 : 0;
    localStorage.setItem('fingerscore.scales', JSON.stringify({
      inst: 'asax', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up', overrides: { '04': other, '3.0': other, ' 3': other, '+3': other, 4: 1 },
    }));
    renderScales();
    expect(JSON.parse(localStorage.getItem('fingerscore.scales')!).overrides).toEqual({ 4: 1 });
    cleanup();
    localStorage.setItem('fingerscore.scales', JSON.stringify({
      inst: 'asax', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up', overrides: { 3: auto, 4: 1 },
    }));
    renderScales();
    expect(screen.getByText('2 notes have alternate fingerings · 1 changed by you')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('fingerscore.scales')!).overrides).toEqual({ 4: 1 });
  });

  it('keyboard: Tab reaches the pill after the controls, Enter opens it on the current option, Esc returns', async () => {
    renderScales();
    await fMajor();
    screen.getByLabelText('Note names').focus();
    await user.tab();
    const pill = pills()[0];
    expect(pill).toHaveFocus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Alternate fingerings for B♭4' });
    const current = within(dialog).getAllByRole('button').find(b => b.getAttribute('aria-pressed') === 'true')!;
    expect(current).toHaveFocus();
    expect(current).toHaveTextContent('auto');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pill).toHaveFocus();
    await user.tab();
    expect(pills()[1]).toHaveFocus();
  });

  it('the popover is an overlay outside the paper, so the paper cannot clip it', async () => {
    renderScales();
    await fMajor();
    await user.click(pills()[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByRole('region', { name: 'Scale' })).not.toContainElement(dialog);
  });

  it('pills, popover and summary do not print', async () => {
    renderScales();
    await fMajor();
    await user.click(pills()[0]);
    for (const el of [pills()[0], screen.getByRole('dialog'), screen.getByText(/alternate fingerings ·/)]) {
      expect(el.closest('[data-print-hide]')).not.toBeNull();
    }
  });
});

it('six accidentals: F♯ and G♭ are separate keys, and the choice is remembered', async () => {
  const { unmount } = renderScales();
  const keys = within(screen.getByRole('radiogroup', { name: 'Key' }));
  expect(keys.getAllByRole('radio')).toHaveLength(13);
  await user.click(keys.getByRole('radio', { name: 'F♯ · sounds A' }));
  const paper = within(screen.getByRole('region', { name: 'Scale' }));
  expect(paper.getByText('Alto sax in E♭ · F♯ major · sounds A major')).toBeInTheDocument();
  expect(noteNames().map(n => n!.replace(/\d+$/, ''))).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯', 'F♯']);
  expect(document.querySelectorAll('[data-keysig] [data-acc="sharp"]')).toHaveLength(6);
  expect(keys.getByRole('radio', { name: 'G♭ · sounds A' })).not.toBeChecked();
  unmount();
  renderScales();
  expect(within(screen.getByRole('radiogroup', { name: 'Key' })).getByRole('radio', { name: 'F♯ · sounds A' })).toBeChecked();
  await user.click(within(screen.getByRole('radiogroup', { name: 'Key' })).getByRole('radio', { name: 'G♭ · sounds A' }));
  expect(within(screen.getByRole('region', { name: 'Scale' })).getByText('Alto sax in E♭ · G♭ major · sounds A major')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-keysig] [data-acc="flat"]')).toHaveLength(6);
});

describe('Download PDF', () => {
  const pdfButton = () => screen.getByRole('button', { name: /^(Download PDF|Preparing PDF…)$/ });
  const lastInput = () => vi.mocked(requestScalePdf).mock.calls[0][0] as ScalePdfInput;

  it('focusing Download PDF prefetches the engine once', () => {
    renderScales();
    vi.mocked(scalePdfModule.prefetch).mockClear();
    fireEvent.focus(pdfButton());
    expect(scalePdfModule.prefetch).toHaveBeenCalledTimes(1);
  });

  it('has a primary Download PDF and a plain Print button', () => {
    renderScales();
    expect(pdfButton()).toHaveTextContent('Download PDF');
    expect(pdfButton().className).toMatch(/primary/);
    expect(pdfButton()).toHaveAttribute('data-primary');
    expect(screen.getByRole('button', { name: 'Print' })).not.toHaveAttribute('data-primary');
    expect(screen.getByRole('button', { name: 'Print' }).className).not.toMatch(/primary/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('requests the PDF of the current settings', async () => {
    renderScales();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scale' }), 'hmin');
    await user.click(screen.getByLabelText('Show alternate fingerings'));
    await user.click(screen.getByLabelText('Note names'));
    await user.click(pdfButton());
    expect(requestScalePdf).toHaveBeenCalledTimes(1);
    const input = lastInput();
    expect(input).toMatchObject({
      inst: 'asax', scaleName: 'harmonic minor', caption: 'Alto sax in E♭ · C harmonic minor · sounds E♭ harmonic minor',
      chartStyle: 'compact', recorderSystem: 'baroque', showNames: false, showAlternates: true, overrides: {},
    });
    expect(input.scale.tonic).toBe('C');
    expect(input.scale.notes).toHaveLength(8);
  });

  it('passes the picks', async () => {
    renderScales();
    await user.click(screen.getByRole('radio', { name: /^F · sounds A♭$/ }));
    await user.click(screen.getAllByRole('button', { name: /^⇅ \d+ alternate fingerings for / })[0]);
    await user.click(within(screen.getByRole('dialog')).getAllByRole('button').find(b => !/auto/.test(b.textContent!))!);
    await user.click(pdfButton());
    expect(Object.keys(lastInput().overrides)).toHaveLength(1);
  });

  it('reads "Preparing PDF…", is disabled and ignores a second click while the PDF is made', async () => {
    let finish!: () => void;
    vi.mocked(requestScalePdf).mockImplementation(() => new Promise<void>(res => { finish = res; }));
    renderScales();
    await user.click(pdfButton());
    expect(pdfButton()).toHaveTextContent('Preparing PDF…');
    expect(pdfButton()).toHaveAttribute('aria-disabled', 'true');
    pdfButton().focus();
    expect(pdfButton()).toHaveFocus();
    await user.click(pdfButton());
    expect(requestScalePdf).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(pdfButton()).toHaveTextContent('Download PDF');
    expect(pdfButton()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('a repeated identical failure is announced again', async () => {
    vi.mocked(requestScalePdf).mockRejectedValue(new PdfError('The PDF could not be made. Use Print instead.'));
    renderScales();
    await user.click(pdfButton());
    const first = await screen.findByRole('alert');
    await user.click(pdfButton());
    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first));
  });

  it('shows a PdfError in the alert line; a later success clears it', async () => {
    vi.mocked(requestScalePdf).mockRejectedValueOnce(new PdfError('The PDF could not be made. Use Print instead.'));
    renderScales();
    await user.click(pdfButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('The PDF could not be made. Use Print instead.');
    await user.click(pdfButton());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('shows the page in the live line only for more than 10 pages, and clears it afterwards', async () => {
    let finish!: () => void;
    vi.mocked(requestScalePdf).mockImplementation(() => new Promise<void>(res => { finish = res; }));
    renderScales();
    await user.click(pdfButton());
    const onProgress = vi.mocked(requestScalePdf).mock.calls[0][1].onProgress!;
    act(() => onProgress(2, 10));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    act(() => onProgress(4, 11));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    act(() => onProgress(10, 11));
    expect(screen.getByRole('status')).toHaveTextContent('Preparing PDF, page 10 of 11');
    await act(async () => finish());
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('leaving the page aborts the request', async () => {
    vi.mocked(requestScalePdf).mockImplementation(() => new Promise<void>(() => {}));
    const view = renderScales();
    await user.click(pdfButton());
    const { signal } = vi.mocked(requestScalePdf).mock.calls[0][1];
    expect(signal!.aborted).toBe(false);
    view.unmount();
    expect(signal!.aborted).toBe(true);
  });
});

describe('Fingering panel', () => {
  // The panel's code loads on demand; loaded once here, so no test waits on a cold import (slow under coverage in CI).
  beforeAll(async () => { await fingeringPanelModule.load(); });
  const panel = () => screen.queryByRole('complementary', { name: 'Fingering' });
  const shownNote = () => within(within(panel()!).getByRole('region', { name: /^Fingering for / })).getAllByRole('paragraph')[0].textContent;
  const chartHits = () => [...document.querySelectorAll<SVGRectElement>('[data-chart-hit]')];

  it('opens from a chart on that note; ← → in the panel walk the scale; Esc closes it back on the button', async () => {
    renderScales();
    fireEvent.click(chartHits()[2]);
    expect(await screen.findByRole('complementary', { name: 'Fingering' })).toBeInTheDocument();
    expect(shownNote()).toBe('E4');
    expect(within(panel()!).getByText('note 3 of 8')).toBeInTheDocument();
    const next = within(panel()!).getByRole('button', { name: 'Next note' });
    next.focus();
    await user.keyboard('{ArrowRight}');
    expect(shownNote()).toBe('F4');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(shownNote()).toBe('D4');
    await user.keyboard('{Escape}');
    expect(panel()).toBeNull();
    expect(screen.getByRole('button', { name: 'Fingering' })).toHaveFocus();
  });

  it('picks an alternate as the scale\'s pick, and opens from the popover and with I', async () => {
    renderScales();
    await user.click(screen.getByRole('radio', { name: /^F · sounds A♭$/ }));
    await user.click(screen.getAllByRole('button', { name: /^⇅ \d+ alternate fingerings for / })[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show on instrument' }));
    expect(await screen.findByRole('complementary', { name: 'Fingering' })).toBeInTheDocument();
    expect(shownNote()).toBe('B♭4');
    await user.click(within(panel()!).getByRole('button', { name: /^Alternate 1/ }));
    expect(screen.getByText(/· 1 changed by you/)).toBeInTheDocument();
    await user.keyboard('i');
    expect(panel()).toBeNull();
    await user.keyboard('i');
    expect(await screen.findByRole('complementary', { name: 'Fingering' })).toBeInTheDocument();
  });
});
