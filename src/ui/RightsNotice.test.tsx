import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { sampleDoc } from '../domain/fixture';
import { saveEntry } from '../state/library';
import FileMenu from './FileMenu';
import Gallery from './Gallery';
import RightsNotice from './RightsNotice';

const TEXT = 'Only import songs you have the rights to.';

beforeEach(() => localStorage.clear());

it('Gallery: the library foot holds the notice next to Import…', () => {
  saveEntry(sampleDoc(), null);
  render(<MemoryRouter><Gallery open /></MemoryRouter>);
  const importBtn = screen.getByRole('button', { name: 'Import…' });
  const foot = importBtn.closest('[class*=libFoot]') as HTMLElement;
  expect(foot).not.toBeNull();
  expect(within(foot).getByText(TEXT, { exact: false })).toBeInTheDocument();
  expect(within(foot).getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms');
});

it('Gallery: the one-line strip has no notice', () => {
  saveEntry(sampleDoc(), null);
  render(<MemoryRouter><Gallery /></MemoryRouter>);
  expect(screen.queryByText(TEXT, { exact: false })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Terms of Use' })).toBeNull();
});

function renderMenu() {
  const fns = { onPdf: vi.fn(), onPrint: vi.fn(), onDownload: vi.fn(), onOpenFile: vi.fn(), onNew: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn() };
  render(<MemoryRouter><FileMenu entries={[]} currentId={null} pdfBusy={false} {...fns} /></MemoryRouter>);
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'File' }));
  return screen.getByRole('menu', { name: 'File' });
}

describe('FileMenu', () => {
  it('draws the notice right after "Open JSON file…", its link a menu item described by the sentence', async () => {
    renderMenu();
    const menu = await openMenu();
    const open = within(menu).getByRole('menuitem', { name: /Open JSON file/ });
    const link = within(menu).getByRole('menuitem', { name: 'Terms of Use' });
    expect(link).toHaveAttribute('href', '/terms');
    expect(link).toHaveAttribute('tabindex', '-1');
    expect(link).toHaveAccessibleDescription(TEXT);
    expect(link.closest('p')).toHaveAttribute('role', 'none');
    expect(screen.getByText(TEXT)).toBeVisible();
    // document order: Open JSON file…, Terms of Use, New sheet
    const all = [...menu.querySelectorAll('[role=menuitem]')];
    const i = all.indexOf(open);
    expect(all[i + 1]).toBe(link);
    expect(all[i + 2]).toBe(within(menu).getByRole('menuitem', { name: /New sheet/ }));
  });

  it('puts the link in the arrow-key order, between "Open JSON file…" and "New sheet"', async () => {
    renderMenu();
    const menu = await openMenu();
    within(menu).getByRole('menuitem', { name: /Open JSON file/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Terms of Use' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: /New sheet/ })).toHaveFocus();
  });

  it.each(['Open JSON file', 'Terms of Use', 'New sheet'])('closes the menu on Tab from %s', async name => {
    renderMenu();
    const menu = await openMenu();
    within(menu).getByRole('menuitem', { name: new RegExp(name) }).focus();
    await userEvent.tab();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu when the link is clicked', async () => {
    renderMenu();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Terms of Use' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

it('RightsNotice: the link is described by the sentence', () => {
  render(<MemoryRouter><RightsNotice /></MemoryRouter>);
  const link = screen.getByRole('link', { name: 'Terms of Use' });
  expect(link).toHaveAccessibleDescription('Only import songs you have the rights to.');
});

it('RightsNotice outside a menu: a plain link, no role on it or its wrapper', () => {
  render(<MemoryRouter><RightsNotice /></MemoryRouter>);
  const link = screen.getByRole('link', { name: 'Terms of Use' });
  expect(link).not.toHaveAttribute('role');
  expect(link).not.toHaveAttribute('tabindex');
  expect(link.closest('p')).not.toHaveAttribute('role');
});
