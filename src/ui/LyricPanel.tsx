import { useEffect, useId, type KeyboardEvent } from 'react';
import { locate } from '../domain/edit';
import { nextLyricNote, setLyric } from '../domain/editText';
import type { Doc } from '../domain/types';
import { useFieldCaret } from './useFieldCaret';
import s from './TextPanel.module.css';

const SYMBOLS = ['‿', '’', '-', '„', '“', '…'];

interface Props {
  doc: Doc; id: string;
  /** Focus the field when the panel opens or moves to another note (a click on the note, Enter or Tab in the field). */
  focus?: boolean;
  onEdit(next: Doc | null, coalesceKey: string): void;
  onMove(id: string): void;
  onClose(): void;
}

/** The Lyrics panel (design 4.4): one syllable field and symbol buttons that insert at the caret. */
export default function LyricPanel(p: Props): JSX.Element | null {
  const { doc, id, onEdit } = p;
  const fieldId = useId();
  const caret = useFieldCaret();
  const at = locate(doc, id);

  useEffect(() => {
    if (p.focus) caret.ref.current?.focus();
  }, [id, p.focus]);   // caret.ref is stable

  if (!at) return null;
  const write = (text: string) => onEdit(setLyric(doc, id, text), `lyric:${id}`);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') { e.preventDefault(); p.onClose(); return; }
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const next = nextLyricNote(doc, id, e.key === 'Tab' && e.shiftKey ? -1 : 1);
    if (e.key === 'Enter') e.preventDefault();
    else if (next === null) return;   // at the ends Tab leaves the panel
    else e.preventDefault();
    if (next !== null) p.onMove(next);
  }

  function insert(symbol: string) {
    const r = caret.insert(symbol);
    caret.keep(r.caret);
    write(r.value);
  }

  return (
    <div className={s.panel}>
      <label htmlFor={fieldId} className={s.label}>Lyric</label>
      <input id={fieldId} ref={caret.ref} type="text" className={s.field} value={at.ev.l} autoComplete="off" spellCheck={false}
        onChange={e => write(e.target.value)} onKeyDown={onKey} />
      <div className={s.symbols}>
        {SYMBOLS.map(sym => (
          <button key={sym} type="button" className={s.symb} aria-label={`Insert ${sym}`}
            onMouseDown={e => e.preventDefault()} onClick={() => insert(sym)}>{sym}</button>
        ))}
      </div>
    </div>
  );
}
