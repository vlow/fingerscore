import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTheme } from './theme';
import ThemeMenu from './ThemeMenu';

const button = (name: string) => screen.getByRole('button', { name });
const item = (name: string) => within(screen.getByRole('menu', { name: 'Theme' })).getByRole('menuitemradio', { name });
const html = () => document.documentElement;

function setup() {
  localStorage.clear();
  delete html().dataset.theme;
  initTheme();
  render(<><ThemeMenu /><button type="button">Elsewhere</button></>);
  return userEvent.setup();
}

describe('ThemeMenu', () => {
  it('shows the chosen theme on a button that announces a menu', () => {
    setup();
    const b = button('Theme: System');
    expect(b).toHaveAttribute('aria-haspopup', 'menu');
    expect(b).toHaveAttribute('aria-expanded', 'false');
    expect(b).toHaveTextContent('System');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens three choices, the chosen one checked and focused', async () => {
    const user = setup();
    await user.click(button('Theme: System'));
    expect(button('Theme: System')).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('menu', { name: 'Theme' })).getAllByRole('menuitemradio').map(i => i.textContent)).toEqual(['System', 'Light', 'Dark']);
    expect(item('System')).toHaveAttribute('aria-checked', 'true');
    expect(item('Light')).toHaveAttribute('aria-checked', 'false');
    expect(item('Dark')).toHaveAttribute('aria-checked', 'false');
    expect(item('System')).toHaveFocus();
  });

  it('moves with the arrow keys, Home and End, and wraps', async () => {
    const user = setup();
    await user.click(button('Theme: System'));
    await user.keyboard('{ArrowDown}');
    expect(item('Light')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(item('System')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(item('Dark')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(item('System')).toHaveFocus();
    await user.keyboard('{End}');
    expect(item('Dark')).toHaveFocus();
  });

  it('chooses with Enter: the theme applies, the menu closes, focus is back on the button', async () => {
    const user = setup();
    await user.click(button('Theme: System'));
    await user.keyboard('{End}{Enter}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button('Theme: Dark')).toHaveFocus();
    expect(html().dataset.theme).toBe('dark');
    expect(localStorage.getItem('fingerscore.theme')).toBe('dark');
  });

  it('chooses with Space', async () => {
    const user = setup();
    await user.click(button('Theme: System'));
    await user.keyboard('{ArrowDown} ');
    expect(button('Theme: Light')).toBeInTheDocument();
    expect(html().dataset.theme).toBe('light');
  });

  it('reaches each theme from each other one', async () => {
    const user = setup();
    for (const [from, to] of [['System', 'Dark'], ['Dark', 'Light'], ['Light', 'System'], ['System', 'Light'], ['Light', 'Dark'], ['Dark', 'System']]) {
      await user.click(button(`Theme: ${from}`));
      expect(item(from)).toHaveAttribute('aria-checked', 'true');
      await user.click(item(to));
      expect(button(`Theme: ${to}`)).toBeInTheDocument();
    }
    expect(html().dataset.theme).toBeUndefined();
    expect(localStorage.getItem('fingerscore.theme')).toBeNull();
  });

  it('closes on Escape without a change and returns focus', async () => {
    const user = setup();
    await user.click(button('Theme: System'));
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button('Theme: System')).toHaveFocus();
    expect(html().dataset.theme).toBeUndefined();
  });

  it('closes on a click outside and on a second click on the button', async () => {
    const user = setup();
    await user.click(button('Theme: System'));
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(button('Theme: System'));
    await user.click(button('Theme: System'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with the down arrow on the button', async () => {
    const user = setup();
    button('Theme: System').focus();
    await user.keyboard('{ArrowDown}');
    expect(item('System')).toHaveFocus();
  });

  it('closes when the focus leaves it by Tab', async () => {
    const user = setup();
    await user.click(button('Theme: System'));
    await user.tab();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
