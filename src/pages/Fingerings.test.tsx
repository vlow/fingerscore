import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from '../state/store';
import Fingerings from './Fingerings';

const user = userEvent.setup();

function Address() {
  return <output data-testid="address">{useLocation().search}</output>;
}

const renderAt = (query: string) => render(
  <MemoryRouter initialEntries={[`/fingerings${query}`]}>
    <Routes><Route path="/fingerings" element={<><Fingerings /><Address /></>} /></Routes>
  </MemoryRouter>,
);

const view = () => screen.getByRole('region', { name: /^Fingering for / });
const note = () => within(view()).getAllByRole('paragraph')[0].textContent;
/** The note bar over the stage, and the popover its Staff button opens. */
const noteBar = () => screen.getByRole('group', { name: 'Choose a note' });
const openPopover = async () => { await user.click(within(noteBar()).getByRole('button', { name: 'Staff' })); return screen.getByRole('dialog', { name: /^Pick a note/ }); };
const address = () => screen.getByTestId('address').textContent;
const info = () => within(view()).getByRole('status').textContent;
/** The Press section: the keys the fingering holds down. */
const pressSection = () => screen.queryByRole('heading', { name: 'Press' })?.parentElement ?? null;
const press = () => { const p = pressSection(); return p ? within(p).queryAllByRole('listitem').map(li => li.textContent) : []; };
/** A key's button in the Press list (the chart's and drawings' keys are buttons too). */
const pressButton = (name: RegExp) => within(pressSection()!).getByRole('button', { name });

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ instId: 'asax' });
});

it('opens on the note of the address, with the keys to press and every sourced fingering', () => {
  renderAt('?inst=asax&note=Bb4');
  expect(screen.getByRole('heading', { level: 1, name: 'Fingerings' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'for instrument' })).toHaveValue('asax');
  expect(note()).toBe('B♭4');
  expect(within(view()).getByText('written · sounds D♭4')).toBeInTheDocument();
  expect(press()).toEqual(['B keyleft index · pressed', 'A keyleft middle · pressed', 'Side B♭right index, side · pressed']);
  const alternates = within(noteBar()).getAllByRole('button', { name: /^(Standard|Alternate)/ });
  expect(alternates.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
});

it('opens on the preferred instrument and its written C5 without an address', () => {
  useApp.setState({ instId: 'cl' });
  renderAt('');
  expect(screen.getByRole('combobox', { name: 'for instrument' })).toHaveValue('cl');
  expect(note()).toBe('C5');
});

it('shows a picked alternate, names it and keeps it in the address', async () => {
  renderAt('?inst=asax&note=Bb4');
  await user.click(within(noteBar()).getByRole('button', { name: /^Alternate 1/ }));
  expect(within(view()).getByText('Alternate 1')).toBeInTheDocument();
  expect(address()).toBe('?inst=asax&note=Bb4&alt=2');
  expect(press()).toContain('Bis B♭left index · pressed');
});

it('highlights a key from the press list in the chart and on the drawing, and pins it until Esc', async () => {
  renderAt('?inst=asax&note=Bb4');
  await user.hover(pressButton(/Side B♭/));
  expect(info()).toBe('Side B♭ · right index, side · pressed');
  // The chart's key and both drawings' key show the accent ring.
  expect(document.querySelectorAll('[data-key="sBb"] [stroke-width="0.9"], [data-key="sBb"] [stroke-width="3"]').length).toBeGreaterThanOrEqual(2);
  await user.click(pressButton(/Side B♭/));
  await user.unhover(pressButton(/Side B♭/));
  expect(info()).toBe('Side B♭ · right index, side · pressed');
  await user.keyboard('{Escape}');
  expect(info()).toMatch(/^Point at a key/);
});

it('reaches every key from the keyboard through the All keys list; the chart and drawings are pointer-only', async () => {
  renderAt('?inst=asax&note=Bb4');
  // The chart's and drawings' keys sit too close together to be controls: no button role, no tab stop.
  expect(document.querySelectorAll('[data-key][role], [data-key][tabindex]')).toHaveLength(0);
  const all = screen.getByText('All keys of the alto saxophone').closest('details')!;
  await user.click(screen.getByText('All keys of the alto saxophone'));
  const buttons = within(all).getAllByRole('button');
  expect(buttons).toHaveLength(23);
  await user.tab();
  fireEvent.focus(within(all).getByRole('button', { name: /^Palm D/ }));
  expect(info()).toBe('Palm D · left palm');
  fireEvent.focus(within(all).getByRole('button', { name: /^B key/ }));
  expect(info()).toBe('B key · left index · pressed');
});

it('changes the note with the keys, not while typing', async () => {
  renderAt('?inst=asax&note=Bb4');
  fireEvent.keyDown(window, { key: 'ArrowUp' });
  expect(note()).toBe('B4');
  fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });
  expect(note()).toBe('B3');
  fireEvent.keyDown(window, { key: 'e' });
  expect(note()).toBe('E4');
  fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });
  expect(note()).toBe('E4'); // E3 is below the alto's range
  await user.click(screen.getByRole('textbox', { name: 'Type a note' }));
  await user.keyboard('g');
  expect(note()).toBe('E4');
});

it('reads a typed note name, and says when it cannot', async () => {
  renderAt('?inst=asax&note=Bb4');
  const field = screen.getByRole('textbox', { name: 'Type a note' });
  await user.type(field, 'Fis5{Enter}');
  expect(note()).toBe('G♭5');
  await user.type(field, 'C2{Enter}');
  expect(screen.getByRole('alert')).toHaveTextContent('That note is outside the range of the Alto sax in E♭.');
  await user.clear(field);
  await user.type(field, 'Q{Enter}');
  expect(screen.getByRole('alert')).toHaveTextContent('Type a note name such as C, F♯5, Bb or Fis.');
});

it('steps a semitone from the bar, and not past the range', async () => {
  renderAt('?inst=asax&note=B3');
  await user.click(within(noteBar()).getByRole('button', { name: 'Semitone up' }));
  expect(note()).toBe('C4');
  await user.click(within(noteBar()).getByRole('button', { name: 'Semitone down' }));
  await user.click(within(noteBar()).getByRole('button', { name: 'Semitone down' }));
  expect(note()).toBe('B♭3');
  expect(within(noteBar()).getByRole('button', { name: 'Semitone down' })).toBeDisabled();
});

it('opens the staff and names in a popover that Esc and a click outside close', async () => {
  renderAt('?inst=asax&note=Bb4');
  const staff = within(noteBar()).getByRole('button', { name: 'Staff' });
  expect(staff).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('dialog')).toBeNull();
  await openPopover();
  expect(staff).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(staff).toHaveFocus();
  await openPopover();
  await user.click(screen.getByRole('heading', { level: 1 }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('picks a note by letter, accidental and octave; a note out of range is not offered', async () => {
  const { unmount } = renderAt('?inst=asax&note=Bb4');
  await openPopover();
  await user.click(screen.getByRole('button', { name: 'E' }));
  expect(note()).toBe('E4');
  await user.click(screen.getByRole('button', { name: 'Flat' }));
  expect(note()).toBe('E♭4');
  await user.click(screen.getByRole('button', { name: 'Octave up' }));
  expect(note()).toBe('E♭5');
  unmount();
  renderAt('?inst=asax&note=B3');
  await openPopover();
  expect(screen.getByRole('button', { name: 'Octave down' })).toBeDisabled();
});

it('offers the soprano saxophone straight or curved and remembers the choice', async () => {
  renderAt('?inst=ssax&note=C5');
  expect(screen.getByRole('group', { name: /^Soprano saxophone: front/ })).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'Curved' }));
  expect(screen.getByRole('group', { name: /^Curved soprano saxophone/ })).toBeInTheDocument();
  expect(address()).toBe('?inst=ssax&note=C5&shape=curved');
  expect(JSON.parse(localStorage.getItem('fingerscore.fingerings')!)).toEqual({ soprano: 'curved' });
});

it('says so when a note has no sourced fingering, and presses nothing', () => {
  renderAt('?inst=ssax&note=Bb6'); // a documented gap (fingering-gaps.json)
  expect(within(view()).getByText('No sourced fingering for this note. fingerscore never guesses.')).toBeInTheDocument();
  expect(press()).toEqual([]);
});

describe('range strip', () => {
  const strip = () => screen.getByRole('group', { name: 'Notes of the range' });
  const shownNotes = () => within(strip()).getAllByRole('button').map(b => b.textContent);

  it('lists the whole range while unmeasured, marks alternates and extended notes, and picks a note', async () => {
    renderAt('?inst=asax&note=Bb4');
    expect(shownNotes()).toHaveLength(39); // B♭3 … C7
    expect(within(strip()).getByRole('button', { name: 'B♭4, more than one fingering' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(strip()).getByRole('button', { name: /^C7, .*extended$/ })).toBeInTheDocument();
    await user.click(within(strip()).getByRole('button', { name: /^D5/ }));
    expect(note()).toBe('D5');
    expect(address()).toBe('?inst=asax&note=D5');
  });

  describe('narrower than the range', () => {
    const original = globalThis.ResizeObserver;
    beforeEach(() => {
      // Ten notes of 36 px fit in 360 px.
      globalThis.ResizeObserver = class {
        constructor(private readonly report: ResizeObserverCallback) {}
        observe() { this.report([{ contentRect: { width: 360 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    });
    afterEach(() => { globalThis.ResizeObserver = original; });

    it('shows what fits around the note, names the rest as page buttons, and follows a note chosen elsewhere', async () => {
      renderAt('?inst=asax&note=Bb3');
      expect(shownNotes()).toEqual(['B♭3', 'B3', 'C4', 'D♭4', 'D4', 'E♭4', 'E4', 'F4', 'G♭4', 'G4']);
      expect(screen.queryByRole('button', { name: /^Show lower notes/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Show higher notes, A♭4 – C7' }));
      expect(shownNotes()[0]).toBe('G♭4'); // eight notes on: a screenful of ten minus two
      expect(screen.getByRole('button', { name: 'Show lower notes, B♭3 – F4' })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'ArrowUp', ctrlKey: true });
      expect(note()).toBe('B♭4');
      await user.type(screen.getByRole('textbox', { name: 'Type a note' }), 'C7{Enter}');
      expect(shownNotes()[shownNotes().length - 1]).toBe('C7');
      fireEvent.wheel(strip(), { deltaX: -80 });
      expect(shownNotes()[shownNotes().length - 1]).toBe('B♭6');
    });
  });
});

it('draws the staff with the chosen note and a picker caption', async () => {
  renderAt('?inst=asax&note=Bb4');
  await openPopover();
  expect(screen.getByRole('img', { name: /^Staff showing B♭4\./ })).toBeInTheDocument();
  expect(screen.getByText(/Shaded: outside the range of the instrument\./)).toBeInTheDocument();
});
