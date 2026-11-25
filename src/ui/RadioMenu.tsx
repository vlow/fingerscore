import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import s from './RadioMenu.module.css';

export interface RadioMenuChoice<T extends string> { value: T; label: string; icon?: ReactNode }

/**
 * A button that opens a menu of a few radio items, built like the File menu: the chosen item is checked and takes the
 * focus, arrow keys move, Enter and Space choose, Esc closes and returns the focus to the button. The menu keeps its
 * keys to itself, so a page that listens for arrows or Esc (play mode) does not act on them.
 */
export default function RadioMenu<T extends string>(p: {
  /** Name of the menu: "Theme". */
  label: string;
  /** Accessible name of the button: "Theme: Dark". */
  buttonName: string;
  /** What the button shows. */
  children: ReactNode;
  choices: RadioMenuChoice<T>[];
  value: T;
  onChange(value: T): void;
  /** Where the menu opens: below the button (a header) or above it (a bar at the bottom of the screen). */
  placement?: 'below' | 'above';
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

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
    if (e.key === 'ArrowDown' && !open) { e.preventDefault(); e.stopPropagation(); setOpen(true); }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const all = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (k: number) => { e.preventDefault(); all[(k + all.length) % all.length]?.focus(); };
    switch (e.key) {
      case 'ArrowDown': focus(at + 1); break;
      case 'ArrowUp': focus(at - 1); break;
      case 'Home': focus(0); break;
      case 'End': focus(-1); break;
      case 'Escape': e.preventDefault(); close(true); break;
      case 'Tab': close(false); return;
      // A button takes Enter and Space itself; the page around the menu must not.
      case 'Enter': case ' ': break;
      default: return;
    }
    e.stopPropagation();
  }

  function choose(value: T) {
    p.onChange(value);
    close(true);
  }

  return (
    <div className={s.wrap}>
      <button ref={buttonRef} type="button" className={p.buttonClassName ?? s.button} aria-label={p.buttonName} aria-haspopup="menu"
        aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(o => !o)} onKeyDown={onButtonKey}>
        {p.children}
      </button>
      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label={p.label} tabIndex={-1} className={`${s.menu} ${p.placement === 'above' ? s.above : s.below}`} onKeyDown={onMenuKey}>
          {p.choices.map(c => (
            <button key={c.value} type="button" role="menuitemradio" aria-checked={c.value === p.value} tabIndex={-1}
              className={s.item} onClick={() => choose(c.value)}>
              {c.icon}
              <span className={s.itemLabel}>{c.label}</span>
              {c.value === p.value && (
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
