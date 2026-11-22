import type { ReactNode } from 'react';
import type { Derived } from '../domain/derive';
import {
  addBarAfter, BASE_LENGTHS, canTie, dottedOf, fits, locate, removeBar, setLength, shiftPitch, splitLength, toggleRest, toggleTie,
} from '../domain/edit';
import type { Doc } from '../domain/types';
import s from './NotePanel.module.css';

const BASE_NAMES: Record<number, string> = { 3: 'Sixteenth', 6: 'Eighth', 12: 'Quarter', 24: 'Half', 48: 'Whole' };

/** The spoken length of an event: "eighth", "dotted quarter". */
export function lengthName(d: number): string {
  const { base, dotted } = splitLength(d);
  const name = (BASE_NAMES[base] ?? '').toLowerCase();
  return dotted ? `dotted ${name}` : name;
}

/** The dot toggle: a dotted length goes back to its base, a base length gets its dot; null when that is not allowed. */
export function toggleDotted(doc: Doc, id: string): Doc | null {
  const at = locate(doc, id);
  if (!at) return null;
  const { base, dotted } = splitLength(at.ev.d);
  if (dotted) return setLength(doc, id, base);
  const longer = dottedOf(base);
  return longer === null ? null : setLength(doc, id, longer);
}

/** Note symbols for the length buttons (after the prototype's icons): filled heads with flags, open heads. */
const ICONS: Record<number, ReactNode> = {
  3: <><ellipse cx="5" cy="16" rx="4" ry="3" fill="currentColor" /><path d="M8.6 16V2c1 3 5 4 5 8M8.6 6.5c1 3 5 4 5 8" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  6: <><ellipse cx="5" cy="16" rx="4" ry="3" fill="currentColor" /><path d="M8.6 16V2c1 3 5 4 5 8" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  12: <><ellipse cx="6" cy="16" rx="4" ry="3" fill="currentColor" /><path d="M9.6 16V2" stroke="currentColor" strokeWidth="1.6" /></>,
  24: <><ellipse cx="6" cy="16" rx="3.6" ry="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M9.6 16V2" stroke="currentColor" strokeWidth="1.6" /></>,
  48: <ellipse cx="8" cy="12" rx="5" ry="3.4" fill="none" stroke="currentColor" strokeWidth="2" />,
};

const KEY_OF_LENGTH: Record<number, string> = { 3: '2', 6: '3', 12: '4', 24: '5', 48: '6' };

interface Props {
  doc: Doc; derived: Derived; id: string;
  /** Every change goes through here; selectId moves the selection (new and removed bars). */
  onEdit(next: Doc | null, selectId?: string): void;
}

/** The Edit notes panel (design 4.3): pitch, length, dot, tie, rest, and bars. Keyboard editing lives on the sheet. */
export default function NotePanel(p: Props): JSX.Element | null {
  const { doc, id, onEdit } = p;
  const at = locate(doc, id);
  const shown = p.derived.byId[id];
  if (!at || !shown) return null;
  const ev = at.ev;
  const { base, dotted } = splitLength(ev.d);
  const longer = dottedOf(base);
  const pitchOff = (step: number) => ev.r || ev.m + step < 0 || ev.m + step > 127;
  const pitch = (step: number, name: string, label: string, title: string) => (
    <button type="button" className={s.symb} aria-label={name} title={title} disabled={pitchOff(step)}
      onClick={() => onEdit(shiftPitch(doc, id, step))}>{label}</button>
  );

  return (
    <div className={s.panel}>
      <div className={s.label} aria-hidden="true">Pitch</div>
      <div role="group" aria-label="Pitch" className={s.row}>
        {pitch(-12, 'Octave down', '−8', 'Octave down (Ctrl/⌘ ↓)')}
        {pitch(-1, 'Semitone down', '−1', 'Semitone down (↓)')}
        <span className={s.name}>{ev.r ? 'rest' : shown.spelled.name}</span>
        {pitch(1, 'Semitone up', '+1', 'Semitone up (↑)')}
        {pitch(12, 'Octave up', '+8', 'Octave up (Ctrl/⌘ ↑)')}
      </div>
      <div className={`${s.label} ${s.gap}`} aria-hidden="true">Length</div>
      <div role="group" aria-label="Length" className={s.row}>
        {BASE_LENGTHS.map(d => (
          <button key={d} type="button" className={s.symb} aria-label={BASE_NAMES[d]} title={`${BASE_NAMES[d]} (${KEY_OF_LENGTH[d]})`}
            aria-pressed={base === d} disabled={!fits(doc, id, d)} onClick={() => onEdit(setLength(doc, id, d))}>
            <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">{ICONS[d]}</svg>
          </button>
        ))}
        <button type="button" className={s.symb} aria-label="Dotted" title="Dotted (.)" aria-pressed={dotted}
          disabled={!dotted && (longer === null || !fits(doc, id, longer))} onClick={() => onEdit(toggleDotted(doc, id))}>
          <svg width="8" height="20" viewBox="0 0 8 20" aria-hidden="true"><circle cx="4" cy="12" r="2.6" fill="currentColor" /></svg>
        </button>
        <span className={s.spacer} />
        <button type="button" className={s.symb} aria-label="Tie" title="Tie (T)" aria-pressed={ev.tie}
          disabled={!ev.tie && !canTie(doc, id)} onClick={() => onEdit(toggleTie(doc, id))}>⁀</button>
      </div>
      <div className={s.actions}>
        <button type="button" className={s.action} onClick={() => onEdit(toggleRest(doc, id))}>
          {ev.r ? 'Turn into note' : 'Turn into rest'}
        </button>
        <span className={s.spacer} />
        <button type="button" className={s.action} onClick={() => { const r = addBarAfter(doc, at.bar); onEdit(r.doc, r.selectId); }}>
          + Bar after
        </button>
        <button type="button" className={`${s.action} ${s.danger}`} disabled={doc.score.length <= 1}
          onClick={() => { const r = removeBar(doc, at.bar); if (r) onEdit(r.doc, r.selectId); }}>
          Remove bar
        </button>
      </div>
    </div>
  );
}
