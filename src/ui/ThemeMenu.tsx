import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTheme, type Theme } from '../state/theme';
import s from './ThemeMenu.module.css';

const MONITOR = ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'];
const SUN = ['M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'];
const MOON = ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'];
const CHOICES: { value: Theme; label: string; icon: string[] }[] = [
  { value: 'system', label: 'System', icon: MONITOR },
  { value: 'light', label: 'Light', icon: SUN },
  { value: 'dark', label: 'Dark', icon: MOON },
];

const Icon = ({ d }: { d: string[] }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map(p => <path key={p} d={p} />)}
  </svg>
);

/**
 * The theme switch of the header (dark mode design 4.2): System follows the device, Light and Dark override it. A menu
 * of three radio items, built like the File menu: arrow keys move, Enter and Space choose, Esc closes.
 */
export default function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = CHOICES.find(c => c.value === theme)!;

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];

  function close(focusButton: boolean) {
    if (focusButton) buttonRef.current?.focus();
    setOpen(false);
  }

  // Focus the chosen item once the menu is in the page.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [open]);

  // A click outside closes; the focus goes where the click went.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && (menuRef.current?.contains(t) || buttonRef.current?.contains(t))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (k: number) => { e.preventDefault(); all[(k + all.length) % all.length]?.focus(); };
    switch (e.key) {
      case 'ArrowDown': focus(at + 1); break;
      case 'ArrowUp': focus(at - 1); break;
      case 'Home': focus(0); break;
      case 'End': focus(-1); break;
      case 'Escape': e.preventDefault(); close(true); break;
      case 'Tab': close(false); break;
      default: return;
    }
    e.stopPropagation();
  }

  function choose(value: Theme) {
    setTheme(value);
    close(true);
  }

  return (
    <div className={s.wrap}>
      <button ref={buttonRef} type="button" className={s.button} aria-label={`Theme: ${current.label}`} aria-haspopup="menu"
        aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(o => !o)} onKeyDown={onButtonKey}>
        <Icon d={current.icon} />
        <span className={s.label}>{current.label}</span>
      </button>
      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label="Theme" className={s.menu} onKeyDown={onMenuKey}>
          {CHOICES.map(c => (
            <button key={c.value} type="button" role="menuitemradio" aria-checked={c.value === theme} tabIndex={-1}
              className={s.item} onClick={() => choose(c.value)}>
              <Icon d={c.icon} />
              <span className={s.itemLabel}>{c.label}</span>
              {c.value === theme && (
                <svg className={s.check} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
