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
  it('draws the notice right after "Open JSON file…", outside the menu items', async () => {
    renderMenu();
    const menu = await openMenu();
    const open = within(menu).getByRole('menuitem', { name: /Open JSON file/ });
    const p = screen.getByText(TEXT, { exact: false }).closest('p')!;
    expect(p).not.toHaveAttribute('role', 'menuitem');
    expect(p.closest('[role=menuitem]')).toBeNull();
    // document order: Open JSON file…, notice, New sheet
    const all = [...menu.querySelectorAll('[role=menuitem], p')];
    const i = all.indexOf(open);
    expect(all[i + 1]).toBe(p);
    expect(all[i + 2]).toBe(within(menu).getByRole('menuitem', { name: /New sheet/ }));
  });

  it('keeps the arrow keys on the items: ArrowDown from "Open JSON file…" focuses "New sheet"', async () => {
    renderMenu();
    const menu = await openMenu();
    within(menu).getByRole('menuitem', { name: /Open JSON file/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: /New sheet/ })).toHaveFocus();
  });

  it('reaches the link with Tab', async () => {
    renderMenu();
    const menu = await openMenu();
    const link = within(menu).getByRole('link', { name: 'Terms of Use' });
    expect(link).not.toHaveAttribute('tabindex', '-1');
    within(menu).getByRole('menuitem', { name: /Open JSON file/ }).focus();
    await userEvent.tab();
    expect(link).toHaveFocus();
  });

  it('does not take Tab from the items after the link: it closes the menu', async () => {
    renderMenu();
    const menu = await openMenu();
    within(menu).getByRole('menuitem', { name: /New sheet/ }).focus();
    await userEvent.tab();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves focus from the link back to "Open JSON file…" with Shift+Tab', async () => {
    renderMenu();
    const menu = await openMenu();
    within(menu).getByRole('link', { name: 'Terms of Use' }).focus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Open JSON file/ })).toHaveFocus();
  });

  it('closes the menu on Tab from the link', async () => {
    renderMenu();
    const menu = await openMenu();
    within(menu).getByRole('link', { name: 'Terms of Use' }).focus();
    await userEvent.tab();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu when the link is clicked', async () => {
    renderMenu();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('link', { name: 'Terms of Use' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

it('RightsNotice: the link is described by the sentence', () => {
  render(<MemoryRouter><RightsNotice /></MemoryRouter>);
  const link = screen.getByRole('link', { name: 'Terms of Use' });
  expect(link).toHaveAccessibleDescription('Only import songs you have the rights to.');
});
