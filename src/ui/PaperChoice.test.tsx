import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTheme } from '../shell/theme';
import PaperChoice from './PaperChoice';

function setup(theme: 'light' | 'dark' | null, variant: 'card' | 'toolbar', systemDark = false, onKeyDown?: () => void) {
  localStorage.clear();
  if (theme) localStorage.setItem('fingerscore.theme', theme);
  vi.stubGlobal('matchMedia', () => ({ matches: systemDark, addEventListener() {}, removeEventListener() {} }));
  initTheme();
  // The parent stands for a page that has keys of its own, as play mode does.
  const view = render(<div onKeyDown={onKeyDown}><PaperChoice variant={variant} /></div>); // NOSONAR typescript:S6847
  return { user: userEvent.setup(), ...view };
}
afterEach(() => vi.unstubAllGlobals());

describe('PaperChoice', () => {
  it.each(['card', 'toolbar'] as const)('shows nothing in light mode (%s)', variant => {
    expect(setup('light', variant).container.firstElementChild).toBeEmptyDOMElement();
  });

  it('shows nothing under System on a light system, and the choice on a dark one', () => {
    const light = setup(null, 'card', false);
    expect(light.container.firstElementChild).toBeEmptyDOMElement();
    light.unmount();
    setup(null, 'card', true);
    expect(screen.getByRole('radiogroup', { name: 'Paper' })).toBeInTheDocument();
  });

  it('card: a choice of Night, Dimmed and Sepia, Night first', async () => {
    const { user } = setup('dark', 'card');
    const group = screen.getByRole('radiogroup', { name: 'Paper' });
    expect(within(group).getAllByRole('radio').map(r => r.textContent)).toEqual(['Night', 'Dimmed', 'Sepia']);
    expect(within(group).getByRole('radio', { name: 'Night' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'Sepia' }));
    expect(within(group).getByRole('radio', { name: 'Sepia' })).toBeChecked();
    expect(localStorage.getItem('fingerscore.paper')).toBe('sepia');
  });

  it('toolbar: a button that names the paper and opens a menu of the three', async () => {
    const { user } = setup('dark', 'toolbar');
    await user.click(screen.getByRole('button', { name: 'Paper: Night' }));
    const menu = screen.getByRole('menu', { name: 'Paper' });
    expect(within(menu).getAllByRole('menuitemradio').map(i => i.textContent)).toEqual(['Night', 'Dimmed', 'Sepia']);
    expect(within(menu).getByRole('menuitemradio', { name: 'Night' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Dimmed' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Paper: Dimmed' })).toBeInTheDocument();
    expect(localStorage.getItem('fingerscore.paper')).toBe('dimmed');
  });

  it('toolbar: the keys of the menu stay in the menu', async () => {
    const outer = vi.fn();
    const { user } = setup('dark', 'toolbar', false, outer);
    await user.click(screen.getByRole('button', { name: 'Paper: Night' }));
    outer.mockClear();
    await user.keyboard('{ArrowDown}{ArrowUp}{Home}{End}{Escape}');
    expect(outer).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Paper: Night' })).toHaveFocus();
  });
});
