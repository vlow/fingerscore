import { useEffect, useId, type KeyboardEvent } from 'react';
import { prettyChord } from '../domain/chords';
import type { Derived } from '../domain/derive';
import { eventOrder } from '../domain/edit';
import { setChord } from '../domain/editText';
import { mod12 } from '../domain/keys';
import type { Doc } from '../domain/types';
import { useFieldCaret } from './useFieldCaret';
import s from './TextPanel.module.css';

/** Button text, the text it inserts, and where the caret goes inside it. */
const SYMBOLS: { label: string; text: string; caret?: number }[] = [
  { label: '♭', text: '♭' }, { label: '♯', text: '♯' }, { label: 'm', text: 'm' }, { label: '°', text: '°' }, { label: 'ø', text: 'ø' },
  { label: 'Δ', text: 'Δ7' }, { label: '7', text: '7' }, { label: 'sus4', text: 'sus4' }, { label: 'add9', text: 'add9' },
  { label: '6', text: '6' }, { label: '/', text: '/' }, { label: '( )', text: '()', caret: 1 },
];
const INVALID = 'Not a chord we can transpose. Start with a note name A–G.';

interface Props {
  doc: Doc; derived: Derived; id: string;
  /** Focus the field when the panel opens or moves to another event (a click on the sheet, Enter or Tab in the field). */
  focus?: boolean;
  onEdit(next: Doc | null, coalesceKey: string): void;
  onMove(id: string): void;
  onClose(): void;
}

/** The Chords panel (design 4.5): one chord field shown in the current key, and symbol buttons that insert at the caret. */
export default function ChordPanel(p: Props): JSX.Element | null {
  const { doc, derived, id, onEdit } = p;
  const fieldId = useId();
  const messageId = useId();
  const caret = useFieldCaret();
  const shown = derived.byId[id];

  useEffect(() => {
    if (p.focus) caret.ref.current?.focus();
  }, [id, p.focus]);   // caret.ref is stable

  if (!shown) return null;
  const value = shown.chord ?? '';
  const tk = mod12(doc.shift + derived.inst.off);

  /** Stores the text as typed, with "b" and "#" after a note name shown as ♭ and ♯; the caret stays at `at`. */
  function write(text: string, at: number) {
    const pretty = prettyChord(text);
    const next = setChord(doc, id, pretty, tk);
    if (next !== null) caret.keep(at);
    onEdit(next, `chord:${id}`);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') { e.preventDefault(); p.onClose(); return; }
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const all = eventOrder(doc);
    const k = all.findIndex(ev => ev.id === id);
    const next = all[k + (e.key === 'Tab' && e.shiftKey ? -1 : 1)];
    if (e.key === 'Tab' && next === undefined) return;   // at the ends Tab leaves the panel
    e.preventDefault();
    if (next !== undefined) p.onMove(next.id);
  }

  return (
    <div className={s.panel}>
      <label htmlFor={fieldId} className={s.label}>Chord</label>
      <input id={fieldId} ref={caret.ref} type="text" className={`${s.field} ${s.chord}`} value={value} autoComplete="off" spellCheck={false}
        aria-invalid={!shown.chordOk} aria-describedby={messageId}
        onChange={e => write(e.target.value, e.target.selectionStart ?? e.target.value.length)} onKeyDown={onKey} />
      <div className={s.symbols}>
        {SYMBOLS.map(sym => (
          <button key={sym.label} type="button" className={s.symb} aria-label={`Insert ${sym.label === 'Δ' ? sym.text : sym.label}`}
            onMouseDown={e => e.preventDefault()}
            onClick={() => { const r = caret.insert(sym.text, sym.caret); write(r.value, r.caret); }}>
            {sym.label}
          </button>
        ))}
      </div>
      <p id={messageId} role="status" className={s.invalid}>{shown.chordOk ? '' : INVALID}</p>
      <p className={s.hint}>b → ♭ and # → ♯ after a note name</p>
    </div>
  );
}
