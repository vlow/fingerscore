import { forwardRef, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { KeyCaps, Kbd } from './KeyCaps';
import type { Mode } from './ModeSwitch';
import { GROUPS, keyName, keysOf, matches, nowGroup } from './shortcuts';
import s from './KeysPanel.module.css';

export const PANEL_ID = 'keys-panel';

/** The keyboard icon of the Keys button. */
function KeyboardIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15.5h6" />
    </svg>
  );
}

/** "Keys" in the page bar, next to Undo and Redo: opens and closes the shortcuts panel. */
export const KeysButton = forwardRef<HTMLButtonElement, { open: boolean; onToggle(): void }>(function KeysButton({ open, onToggle }, ref) {
  return (
    <button ref={ref} type="button" className={s.keysButton} aria-expanded={open} aria-controls={open ? PANEL_ID : undefined}
      aria-keyshortcuts="?" title="Keyboard shortcuts (?)" onClick={onToggle}>
      <KeyboardIcon />Keys
    </button>
  );
});

interface Props {
  mode: Mode;
  apple: boolean;
  /** The row whose key was just pressed. */
  flash: string | null;
  searchRef: RefObject<HTMLInputElement>;
  onClose(): void;
}

/**
 * Every shortcut, in groups that keep their order; the group of the current mode is marked "Now" and scrolled into view.
 * Docked beside the sheet on wide screens, a drawer or a bottom sheet on narrow ones. Not a dialog: the sheet keeps
 * working, so a key can be tried while the list is open.
 */
export function KeysPanel({ mode, apple, flash, searchRef, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('');
  const now = nowGroup(mode);
  const nowRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const shownFor = useRef(now);

  // A change of mode scrolls the panel, and only the panel, to the group of the new mode.
  useEffect(() => {
    if (shownFor.current === now) return;
    shownFor.current = now;
    const panel = panelRef.current;
    const group = nowRef.current;
    if (!panel || !group) return;
    // Below the sticky search, above the sticky foot.
    const shown = panel.querySelector('[data-keys-top]')?.getBoundingClientRect().bottom ?? panel.getBoundingClientRect().top;
    const end = panel.querySelector('[data-keys-foot]')?.getBoundingClientRect().top ?? panel.getBoundingClientRect().bottom;
    const box = group.getBoundingClientRect();
    if (box.top < shown || box.bottom > end) panel.scrollTop += box.top - shown;
  }, [now]);

  const groups = GROUPS
    .map(g => ({ g, rows: g.rows.filter(r => matches(r, g, query, apple)) }))
    .filter(x => x.rows.length > 0);

  /** Esc in the search field or on the close button closes the panel. */
  function onKey(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }

  return (
    <aside ref={panelRef} id={PANEL_ID} data-keys-panel="" data-print-hide="" aria-label="Keyboard shortcuts" className={s.panel}>
      <div className={s.top} data-keys-top="">
        <div className={s.head}>
          <h2 className={s.title}>Keyboard shortcuts</h2>
          <button type="button" className={s.close} aria-label="Close" title="Close (?)" onClick={onClose} onKeyDown={onKey}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className={s.searchWrap}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input ref={searchRef} type="search" className={s.search} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
            placeholder="Find a key or action" aria-label="Find a key or action" />
        </div>
      </div>
      <div className={s.list}>
        {groups.map(({ g, rows }) => {
          const isNow = g.id === now;
          return (
            <section key={g.id} ref={isNow ? nowRef : undefined} aria-labelledby={`keys-${g.id}`} className={`${s.group} ${isNow ? s.now : ''}`}>
              <div className={s.groupHead}>
                <h3 id={`keys-${g.id}`} className={s.groupTitle}>{g.title}</h3>
                <span className={s.groupSub}>{g.sub}</span>
                {isNow && <span className={s.badge}>Now</span>}
              </div>
              <ul className={s.rows}>
                {rows.map(r => (
                  <li key={r.id} className={`${s.row} ${flash === r.id ? s.flash : ''}`} data-row={r.id}>
                    <span className={s.label}>{r.label}</span>
                    <KeyCaps parts={keysOf(r, apple)} apple={apple} />
                  </li>
                ))}
              </ul>
              {g.note && query === '' && <p className={s.note}>{g.note(keyName('Shift', apple))}</p>}
            </section>
          );
        })}
        {groups.length === 0 && (
          <p className={s.empty}>
            No shortcut matches “{query}”.<br />Try a key like <b>T</b> or a word like <b>octave</b>.
          </p>
        )}
      </div>
      <p className={s.foot} data-keys-foot="">
        Press <Kbd k="?" size="sm" apple={apple} /> to close · showing <b>{apple ? 'Mac' : 'Windows and Linux'}</b> keys
      </p>
    </aside>
  );
}
