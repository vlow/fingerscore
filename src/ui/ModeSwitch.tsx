import { useRef, type KeyboardEvent } from 'react';
import s from './ModeSwitch.module.css';

export type Mode = 'view' | 'notes' | 'lyrics' | 'chords';

const MODES: { mode: Mode; name: string; hint: string }[] = [
  { mode: 'view', name: 'View', hint: 'Click a note to choose where playback starts.' },
  { mode: 'notes', name: 'Edit notes', hint: 'Click a note or rest, then change its pitch or length. Arrow keys work too.' },
  { mode: 'lyrics', name: 'Lyrics', hint: 'Click a note and type. Enter moves to the next note.' },
  { mode: 'chords', name: 'Chords', hint: 'Click a note or rest and type a chord, for example Am7 or F♯m7♭5.' },
];

/**
 * The editing mode (design 4.2): a segmented control with one line of hint below. A radio group:
 * one tab stop, arrow keys move the choice and the focus.
 */
export function ModeSwitch(p: { mode: Mode; onMode(m: Mode): void }): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = MODES.findIndex(m => m.mode === p.mode);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const k = (at + step + MODES.length) % MODES.length;
    p.onMode(MODES[k].mode);
    refs.current[k]?.focus();
  }

  return (
    <div className={s.wrap}>
      <div role="radiogroup" aria-label="Mode" className={s.group} onKeyDown={onKey}>
        {MODES.map((m, k) => (
          <button key={m.mode} ref={el => { refs.current[k] = el; }} type="button" role="radio" className={s.option}
            aria-checked={m.mode === p.mode} tabIndex={m.mode === p.mode ? 0 : -1} onClick={() => p.onMode(m.mode)}>
            {m.name}
          </button>
        ))}
      </div>
      <p className={s.hint}>{MODES[at].hint}</p>
    </div>
  );
}
