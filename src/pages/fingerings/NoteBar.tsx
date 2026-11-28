import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { noteNameFlat } from '../../domain/instruments';
import s from '../Fingerings.module.css';
import { LetterPicker, TypeNote } from './NamePicker';
import { RangeStrip } from './RangeStrip';
import { StaffPicker } from './StaffPicker';

interface Props {
  pitch: number;
  lo: number;
  hi: number;
  instName: string;
  mod: string;
  range: number[];
  onPick(pitch: number): void;
  hasAlternates(pitch: number): boolean;
  /** Whether a note lies above the instrument's normal range. */
  extended(pitch: number): boolean;
  /** The bar's second row: the fingerings of the note. */
  children?: ReactNode;
}

/**
 * The note bar of the Fingerings page (concept A, 2026-11-28): one slim row that stays at the top of the window while
 * the page scrolls, so the note can change while the instrument stays in view. ‹ › step a semitone, the strip jumps
 * anywhere in the range, the field reads a typed name, and "Staff" opens the staff with the letter, accidental and
 * octave buttons in a popover.
 */
export function NoteBar(p: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const popId = useId();
  const fits = (pitch: number) => pitch >= p.lo && pitch <= p.hi;

  // The popover: the focus moves in when it opens; Esc, a click outside or ✕ closes it, Esc and ✕ back on the button.
  useEffect(() => {
    if (!open) return undefined;
    popover.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"], button:not(:disabled)')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!popover.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  const step = (by: number, label: string, glyph: string, key: string) => (
    <button type="button" className={s.stepButton} aria-label={label} title={`${label} (${key})`}
      aria-keyshortcuts={by > 0 ? 'ArrowUp' : 'ArrowDown'} disabled={!fits(p.pitch + by)} onClick={() => p.onPick(p.pitch + by)}>
      {glyph}
    </button>
  );

  return (
    <div className={s.noteBar} role="group" aria-label="Choose a note">
      <div className={s.barMain}>
        <div className={s.stepper}>
          {step(-1, 'Semitone down', '‹', '↓')}
          <span className={s.barNote} aria-live="polite">{noteNameFlat(p.pitch)}</span>
          {step(1, 'Semitone up', '›', '↑')}
        </div>
        <RangeStrip notes={p.range} current={p.pitch} onPick={p.onPick} hasAlternates={p.hasAlternates} extended={p.extended} />
        <div className={s.barEnd}>
          <TypeNote pitch={p.pitch} lo={p.lo} hi={p.hi} instName={p.instName} onPick={p.onPick} />
          <button ref={button} type="button" className={s.pickButton} aria-expanded={open} aria-controls={popId}
            aria-haspopup="dialog" onClick={() => setOpen(x => !x)}>
            Staff
          </button>
        </div>
      </div>
      {p.children}
      {open && (
        <div ref={popover} id={popId} className={s.notePop} role="dialog" aria-label="Pick a note on the staff or by name">
          <div className={s.popHead}>
            <span className={s.cardTitle}>Note as you read it</span>
            <button type="button" className={s.popClose} aria-label="Close" onClick={() => { setOpen(false); button.current?.focus(); }}>✕</button>
          </div>
          <div className={s.popBody}>
            <StaffPicker pitch={p.pitch} lo={p.lo} hi={p.hi} onPick={p.onPick} />
            <div>
              <LetterPicker pitch={p.pitch} lo={p.lo} hi={p.hi} mod={p.mod} onPick={p.onPick} />
              <p className={s.keysHint}>↑ ↓ semitone · {p.mod} ↑ ↓ octave · A – G note name</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
