import { useId, type ReactNode } from 'react';
import type { Derived } from '../domain/derive';
import {
  addBarAfter, canAddBar, canMakeTriplet, canTie, dottedOf, fits, inTriplet, LENGTH_NAMES, lengthChoices, locate, removeBar, setLength,
  setBarMark, setJump, shiftPitch, splitLength, toggleDotted, toggleRest, toggleTie, toggleTriplet,
} from '../domain/edit';
import { isJump, JUMP_TEXT, type BarMark } from '../domain/jumps';
import type { Doc, Jump } from '../domain/types';
import s from './NotePanel.module.css';

/** Button names: "Sixteenth" … "Whole". */
const BASE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(LENGTH_NAMES).map(([d, name]) => [d, name[0].toUpperCase() + name.slice(1)]),
);

/** Note symbols for the length buttons (after the prototype's icons): filled heads with flags, open heads. */
const ICONS: Record<number, ReactNode> = {
  3: <><ellipse cx="5" cy="16" rx="4" ry="3" fill="currentColor" /><path d="M8.6 16V2c1 3 5 4 5 8M8.6 6.5c1 3 5 4 5 8" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  6: <><ellipse cx="5" cy="16" rx="4" ry="3" fill="currentColor" /><path d="M8.6 16V2c1 3 5 4 5 8" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  12: <><ellipse cx="6" cy="16" rx="4" ry="3" fill="currentColor" /><path d="M9.6 16V2" stroke="currentColor" strokeWidth="1.6" /></>,
  24: <><ellipse cx="6" cy="16" rx="3.6" ry="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M9.6 16V2" stroke="currentColor" strokeWidth="1.6" /></>,
  48: <ellipse cx="8" cy="12" rx="5" ry="3.4" fill="none" stroke="currentColor" strokeWidth="2" />,
};

const JUMPS = Object.keys(JUMP_TEXT) as Jump[];

const KEY_OF_LENGTH: Record<number, string> = { 3: '2', 6: '3', 12: '4', 24: '5', 48: '6' };

interface Props {
  doc: Doc; derived: Derived; id: string;
  /** Every change goes through here; selectId moves the selection (new and removed bars). */
  onEdit(next: Doc | null, selectId?: string): void;
}

/** The Edit notes panel (design 4.3): pitch, length, dot, tie, rest, and bars. Keyboard editing lives on the sheet. */
export default function NotePanel(p: Props): JSX.Element | null {
  const jumpId = useId();   // before the early return: a hook may not follow it
  const { doc, id, onEdit } = p;
  const at = locate(doc, id);
  const shown = p.derived.byId[id];
  if (!at || !shown) return null;
  const ev = at.ev;
  const bar = doc.score[at.bar];
  const member = inTriplet(doc, id);
  const { base, dotted } = splitLength(ev.d);
  const longer = dottedOf(base);
  // The name starts with the visible text, then says what the button does (WCAG 2.5.3): "−8 Octave down".
  const pitch = (step: number, name: string, label: string, keys: string) => (
    <button type="button" className={s.symb} aria-label={`${label} ${name}`} aria-keyshortcuts={keys} disabled={shiftPitch(doc, id, step) === null}
      onClick={() => onEdit(shiftPitch(doc, id, step))}>{label}</button>
  );

  const mark = (key: BarMark, name: string) => (
    <button type="button" className={s.symb} aria-pressed={bar[key] === true} onClick={() => onEdit(setBarMark(doc, at.bar, key, bar[key] !== true))}>{name}</button>
  );

  return (
    <div className={s.panel}>
      <div className={s.label} aria-hidden="true">Pitch</div>
      <div role="group" aria-label="Pitch" className={s.row}>
        {pitch(-12, 'Octave down', '−8', 'Control+ArrowDown Meta+ArrowDown')}
        {pitch(-1, 'Semitone down', '−1', 'ArrowDown')}
        <span className={s.name}>{ev.r ? 'rest' : shown.spelled.name}</span>
        {pitch(1, 'Semitone up', '+1', 'ArrowUp')}
        {pitch(12, 'Octave up', '+8', 'Control+ArrowUp Meta+ArrowUp')}
      </div>
      <div className={`${s.label} ${s.gap}`} aria-hidden="true">Length</div>
      <div role="group" aria-label="Length" className={s.row}>
        {lengthChoices(doc, id).map(c => (
          <button key={c.notated} type="button" className={s.symb} aria-label={BASE_NAMES[c.notated]} aria-keyshortcuts={KEY_OF_LENGTH[c.notated]}
            aria-pressed={c.pressed} disabled={!c.enabled} onClick={() => { if (c.enabled) onEdit(setLength(doc, id, c.d)); }}>
            <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">{ICONS[c.notated]}</svg>
          </button>
        ))}
        <button type="button" className={s.symb} aria-label="Dotted" aria-keyshortcuts="." aria-pressed={dotted}
          disabled={member || (!dotted && (longer === null || !fits(doc, id, longer)))} onClick={() => onEdit(toggleDotted(doc, id))}>
          <svg width="8" height="20" viewBox="0 0 8 20" aria-hidden="true"><circle cx="4" cy="12" r="2.6" fill="currentColor" /></svg>
        </button>
        <button type="button" className={s.symb} aria-label="3 Triplet" aria-keyshortcuts="P" aria-pressed={member}
          disabled={!member && !canMakeTriplet(doc, id)} onClick={() => { const r = toggleTriplet(doc, id); if (r) onEdit(r.doc, r.selectId); }}>
          <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
            <path d="M2 14V7h6M20 14V7h-6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <text x="11" y="12" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">3</text>
          </svg>
        </button>
        <span className={s.spacer} />
        <button type="button" className={s.symb} aria-label="Tie" aria-keyshortcuts="T" aria-pressed={ev.tie}
          disabled={!ev.tie && !canTie(doc, id)} onClick={() => onEdit(toggleTie(doc, id))}>⁀</button>
      </div>
      <div className={`${s.label} ${s.gap}`} aria-hidden="true">Bar</div>
      <div role="group" aria-label="Bar" className={s.bar}>
        <div role="group" aria-label="Start of the bar" className={s.row}>
          <span className={s.caption} aria-hidden="true">Start</span>
          {mark('segno', 'Segno')}
          {mark('coda', 'Coda')}
        </div>
        <div role="group" aria-label="End of the bar" className={s.row}>
          <span className={s.caption} aria-hidden="true">End</span>
          {mark('fine', 'Fine')}
          {mark('toCoda', 'To Coda')}
        </div>
        <div className={s.row}>
          <label htmlFor={jumpId} className={s.fieldLabel}>Jump at the end of the bar</label>
          <select id={jumpId} className={s.select} value={bar.jump ?? ''}
            onChange={e => onEdit(setJump(doc, at.bar, isJump(e.target.value) ? e.target.value : null))}>
            <option value="">None</option>
            {JUMPS.map(j => <option key={j} value={j}>{JUMP_TEXT[j]}</option>)}
          </select>
        </div>
      </div>
      <div className={s.actions}>
        <button type="button" className={s.action} aria-keyshortcuts="R" onClick={() => onEdit(toggleRest(doc, id))}>
          {ev.r ? 'Turn into note' : 'Turn into rest'}
        </button>
        <span className={s.spacer} />
        <button type="button" className={s.action} disabled={!canAddBar(doc)}
          onClick={() => { const r = addBarAfter(doc, at.bar); if (r) onEdit(r.doc, r.selectId); }}>
          + Bar after
        </button>
        <button type="button" className={`${s.action} ${s.danger}`} disabled={doc.score.length <= 1}
          onClick={() => { const r = removeBar(doc, at.bar); if (r) onEdit(r.doc, r.selectId); }}>
          Remove bar
        </button>
      </div>
      <p className={s.keys}>Keys: ↑ ↓ pitch · A–G note · 2–6 length · . dot · P triplet · R rest · T tie</p>
    </div>
  );
}
