import type { Derived } from '../domain/derive';
import { isTransposing, noteNameFlat } from '../domain/instruments';
import { keyName, mod12 } from '../domain/keys';
import { reasonText } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { Link } from 'react-router-dom';
import { writeAddress } from '../pages/fingerings/address';
import { readSoprano } from '../pages/fingerings/prefs';
import { instNoun, shiftLabel } from './labels';
import s from './Banners.module.css';

interface Props { doc: Doc; derived: Derived; onShift(shift: number): void }

const notesAre = (n: number) => `${n} ${n === 1 ? 'note is' : 'notes are'}`;

/** "Show fingerings": the Fingerings page on the highest of these notes (design 4.5). */
function ShowFingerings(p: { doc: Doc; notes: number[] }) {
  if (p.notes.length === 0) return null;
  const note = Math.max(...p.notes);
  const to = `/fingerings?${writeAddress({ inst: p.doc.inst, note, alt: 0, system: p.doc.recorderSystem, shape: readSoprano() })}`;
  return <Link className={s.link} to={to}>Show fingerings</Link>;
}

/** Banners above the sheet (SPEC §6.4): unplayable, extended only, or suggested key applied. */
export default function Banners({ doc, derived, onShift }: Props) {
  const i = derived.inst;
  const { bad, ext } = derived.counts;
  const { best } = derived;
  const noun = instNoun(i);
  const bestKey = keyName(mod12(doc.originalTonicPc + best.shift + i.off), doc.originalMode);
  const useBest = !derived.isSuggested && (
    <button type="button" className={bad > 0 ? s.fixBad : s.fixExt} onClick={() => onShift(best.shift)}>
      Use {bestKey} ({shiftLabel(best.shift)})
    </button>
  );

  if (bad > 0) {
    const sounding = derived.events.filter(ev => !ev.rest && !ev.tiedFrom);
    const below = sounding.filter(ev => ev.written < i.lo).length;
    const above = sounding.filter(ev => ev.written > i.ext).length;
    const where = below && above ? `outside ${noteNameFlat(i.lo)} – ${noteNameFlat(i.ext)}`
      : below ? `below ${noteNameFlat(i.lo)}` : `above ${noteNameFlat(i.ext)}`;
    return (
      <div role="alert" className={`${s.banner} ${s.bad}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" />
        </svg>
        <div className={s.body}>
          <div className={s.title}>{notesAre(bad)} {where} — out of range for the {noun}</div>
          <div className={s.line}>Those notes are marked red and have no fingering chart.</div>
        </div>
        <ShowFingerings doc={doc} notes={sounding.filter(ev => ev.state === 'bad').map(ev => ev.written)} />
        {useBest}
      </div>
    );
  }

  if (ext > 0) {
    return (
      <div role="status" className={`${s.banner} ${s.ext}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
        </svg>
        <div className={s.body}>
          <div className={s.title}>{ext} {ext === 1 ? 'note needs' : 'notes need'} extended high fingerings</div>
        </div>
        <ShowFingerings doc={doc} notes={derived.events.filter(ev => !ev.rest && !ev.tiedFrom && ev.state === 'ext').map(ev => ev.written)} />
        {useBest}
      </div>
    );
  }

  if (!derived.isSuggested) return null;
  const keys = isTransposing(i) ? `sounds in ${derived.concertKey}, you read ${derived.writtenKey}` : derived.writtenKey;
  return (
    <div className={`${s.banner} ${s.ok}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span>
        Suggested key applied: {keys} ({shiftLabel(doc.shift)} from the original {derived.originalKey}). Every note fits
        the {noun}, {reasonText(derived.current, i)}.
      </span>
    </div>
  );
}
