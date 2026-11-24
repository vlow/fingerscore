import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { timeAgo } from '../domain/timeAgo';
import type { LibraryEntry } from '../state/library';
import RightsNotice from './RightsNotice';
import s from './FileMenu.module.css';

interface Props {
  entries: LibraryEntry[];
  currentId: string | null;
  onPdf(): void;
  /** A PDF is being prepared: the entry reads "Preparing PDF…" and is disabled. */
  pdfBusy: boolean;
  onPrint(): void;
  onDownload(): void;
  onOpenFile(file: File): void;
  onNew(): void;
  onOpen(id: string): void;
  onDelete(id: string): void;
  /** Called each time the menu opens, so the caller can read the library afresh. */
  onOpenMenu?(): void;
}

const INTERACTIVE = 'a, button, input, select, textarea, [tabindex]';

const Icon = ({ d }: { d: string[] }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map(p => <path key={p} d={p} />)}
  </svg>
);
const DOWN = ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'];
const UP = ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'];
const PRINT = ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'];
const PLUS = ['M12 5v14M5 12h14'];
const TRASH = ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'];

/** File ▾ menu of the sheet page (design 4.4): file actions, the saved sheets, the storage note. */
export default function FileMenu(p: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openFileRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];

  function openMenu() {
    p.onOpenMenu?.();
    setOpen(true);
  }

  function close(focusButton: boolean) {
    if (focusButton) buttonRef.current?.focus();
    setOpen(false);
  }

  // Focus the first item once the menu is in the page.
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  // Outside click closes, as in the alternate-fingering popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t || menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close(!(t instanceof Element && t.closest(INTERACTIVE) !== null));
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' && !open) { e.preventDefault(); openMenu(); }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (k: number) => { e.preventDefault(); all[(k + all.length) % all.length]?.focus(); };
    switch (e.key) {
      case 'ArrowDown': focus(at + 1); break;
      case 'ArrowUp': focus(at < 0 ? -1 : at - 1); break;
      case 'Home': focus(0); break;
      case 'End': focus(-1); break;
      case 'Escape': e.preventDefault(); close(true); break;
      // Tab from an item above the notice link goes to the link; Shift+Tab from the link goes back to "Open JSON file…".
      // Anywhere else focus returns to the button first, so Tab moves on from there.
      case 'Tab': {
        const a = menuRef.current?.querySelector('a');
        const here = document.activeElement;
        if (a && !e.shiftKey && here && here !== a && !here.contains(a) && here.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) {
          e.preventDefault();
          a.focus();
        } else if (a && e.shiftKey && here === a && openFileRef.current) {
          e.preventDefault();
          openFileRef.current.focus();
        } else close(true);
        break;
      }
      default: return;
    }
    e.stopPropagation();
  }

  /** Choosing an item closes the menu and returns focus to its button. */
  const choose = (run: () => void) => () => { close(true); run(); };

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';   // the same file can be chosen again
    if (file) p.onOpenFile(file);
  }

  return (
    <div className={s.wrap}>
      <button ref={buttonRef} type="button" className={s.button} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? menuId : undefined} onClick={() => (open ? close(false) : openMenu())} onKeyDown={onButtonKey}>
        File
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <input ref={inputRef} type="file" accept=".json,application/json" aria-label="Open JSON file" tabIndex={-1}
        className={s.fileInput} onChange={onFile} />
      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label="File" tabIndex={-1} className={s.menu} onKeyDown={onMenuKey}>
          <div role="group" aria-label="File actions" className={s.actions}>
            <button type="button" role="menuitem" tabIndex={-1} className={`${s.action} ${s.primary}`} data-primary="" disabled={p.pdfBusy} onClick={choose(p.onPdf)}>
              <Icon d={DOWN} />{p.pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
            </button>
            <button type="button" role="menuitem" tabIndex={-1} className={s.action} onClick={choose(p.onPrint)}>
              <Icon d={PRINT} />Print
            </button>
            <button type="button" role="menuitem" tabIndex={-1} className={s.action} onClick={choose(p.onDownload)}>
              <Icon d={DOWN} />Download JSON
            </button>
            <button ref={openFileRef} type="button" role="menuitem" tabIndex={-1} className={s.action} onClick={choose(() => inputRef.current?.click())}>
              <Icon d={UP} />Open JSON file…
            </button>
            <RightsNotice className={s.rights} onNavigate={() => close(false)} />
            <button type="button" role="menuitem" tabIndex={-1} className={s.action} onClick={choose(p.onNew)}>
              <Icon d={PLUS} />New sheet
            </button>
          </div>
          <div role="separator" className={s.rule} />
          <div className={s.listHead} id={`${menuId}-saved`}>Saved in this browser</div>
          {p.entries.length === 0 ? (
            <p className={s.empty}>No saved sheets yet.</p>
          ) : (
            <div role="group" aria-labelledby={`${menuId}-saved`} className={s.list}>
              {p.entries.map(e => (
                <div key={e.id} className={s.entry} data-current={e.id === p.currentId || undefined}>
                  <div className={s.entryText}>
                    <div className={s.entryTitle}>{e.title}</div>
                    <div className={s.entryMeta}>{`${e.inst} · saved ${timeAgo(e.savedAt)}`}</div>
                  </div>
                  <button type="button" role="menuitem" tabIndex={-1} className={s.open} aria-label={e.id === p.currentId ? `Open ${e.title} (currently open)` : `Open ${e.title}`}
                    onClick={choose(() => p.onOpen(e.id))}>
                    Open
                  </button>
                  <button type="button" role="menuitem" tabIndex={-1} className={s.delete} aria-label={`Delete ${e.title}`}
                    onClick={choose(() => p.onDelete(e.id))}>
                    <Icon d={TRASH} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className={s.note}>Sheets are stored only on this device. Download a JSON file to back up or move a sheet to another computer.</p>
        </div>
      )}
    </div>
  );
}
