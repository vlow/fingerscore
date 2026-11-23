import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { sampleDoc } from '../domain/fixture';
import { useApp } from '../state/store';
import Scales from './Scales';

const user = userEvent.setup();

const renderScales = () => render(<MemoryRouter initialEntries={['/scales']}><Scales /></MemoryRouter>);
const renderApp = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
const noteNames = () => [...document.querySelectorAll('[data-name]')].map(e => e.textContent);

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ instId: 'asax', doc: null });
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
