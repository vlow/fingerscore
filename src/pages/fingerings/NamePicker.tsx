import { useId, useState, type FormEvent } from 'react';
import { noteNameFlat } from '../../domain/instruments';
import { readNote } from '../../domain/noteText';
import s from '../Fingerings.module.css';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The octave of a written pitch, middle C = 4. */
const octaveOf = (pitch: number) => Math.floor(pitch / 12) - 1;

/**
 * Picking a note by name (design 4.2): letter buttons keep the octave, ♭ ♮ ♯ alter the letter, Octave − + move by an
 * octave, and a text field reads a typed name. A button whose note lies outside lo..hi is disabled.
 */
export function NamePicker(p: { pitch: number; lo: number; hi: number; instName: string; mod: string; onPick(pitch: number): void }) {
  const fieldId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const name = noteNameFlat(p.pitch);
  const letter = name[0];
  const octave = octaveOf(p.pitch);
  const natural = (octave + 1) * 12 + NATURAL[letter];
  const flat = name.includes('♭');
  const fits = (pitch: number) => pitch >= p.lo && pitch <= p.hi;

  const button = (label: string, target: number, pressed: boolean | undefined,
    extra: { name?: string; title?: string; keys?: string } = {}) => (
    <button type="button" className={s.pickButton} aria-pressed={pressed} disabled={!fits(target)} title={extra.title}
      aria-label={extra.name} aria-keyshortcuts={extra.keys} onClick={() => p.onPick(target)}>
      {label}
    </button>
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const read = readNote(text, p.pitch, p.lo, p.hi);
    if ('pitch' in read) {
      setError(null);
      setText('');
      p.onPick(read.pitch);
    } else {
      setError(read.error === 'range' ? `That note is outside the range of the ${p.instName}.` : 'Type a note name such as C, F♯5, Bb or Fis.');
    }
  };

  return (
    <div className={s.names}>
      <div className={s.letters} role="group" aria-label="Note name">
        {LETTERS.map(l => (
          <span key={l}>{button(l, (octave + 1) * 12 + NATURAL[l], l === letter, { keys: l })}</span>
        ))}
      </div>
      <div className={s.letters} role="group" aria-label="Accidental">
        {button('♭', natural - 1, flat, { name: 'Flat' })}
        {button('♮', natural, !flat, { name: 'Natural' })}
        {button('♯', natural + 1, false, { name: 'Sharp' })}
      </div>
      <div className={s.octave} role="group" aria-label="Octave">
        {button('−', p.pitch - 12, undefined,
          { name: 'Octave down', title: `Octave down (${p.mod}+↓)`, keys: 'Control+ArrowDown Meta+ArrowDown' })}
        <span className={s.octaveLabel}>Octave {octave}</span>
        {button('+', p.pitch + 12, undefined,
          { name: 'Octave up', title: `Octave up (${p.mod}+↑)`, keys: 'Control+ArrowUp Meta+ArrowUp' })}
      </div>
      <form className={s.type} onSubmit={submit}>
        <label htmlFor={fieldId} className={s.label}>Type a note</label>
        <div className={s.typeRow}>
          <input id={fieldId} className={s.input} value={text} placeholder="Bb4, F♯, Fis" autoComplete="off" spellCheck={false}
            aria-invalid={error !== null} aria-describedby={error ? `${fieldId}-error` : undefined}
            onChange={e => { setText(e.target.value); setError(null); }} />
          <button type="submit" className={s.pickButton}>Show</button>
        </div>
        {error && <p id={`${fieldId}-error`} className={s.error} role="alert">{error}</p>}
      </form>
    </div>
  );
}
