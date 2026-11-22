import { useId } from 'react';
import {
  FAMILIES, familyDefault, familyMembers, familySubline, inst, shortName, summary,
} from '../domain/instruments';
import type { InstId } from '../domain/types';
import s from './InstrumentPicker.module.css';

interface Props { value: InstId; onChange(id: InstId): void }

/** "Soprano B♭" → ["Soprano", "B♭"]. */
function splitKey(id: InstId): [string, string] {
  const name = shortName(id);
  const cut = name.lastIndexOf(' ');
  return [name.slice(0, cut), name.slice(cut + 1)];
}

export default function InstrumentPicker({ value, onChange }: Props) {
  const headingId = useId();
  const current = inst(value);
  const family = current.group;
  return (
    <section aria-labelledby={headingId} className={s.card}>
      <div className={s.head}>
        <h2 id={headingId} className={s.title}>Your instrument</h2>
        <span className={s.summary}>{summary(current)}</span>
      </div>
      <div role="radiogroup" aria-label="Instrument family" className={s.families}>
        {FAMILIES.map(f => {
          const on = f === family;
          return (
            <button
              key={f} type="button" role="radio" aria-checked={on}
              className={s.family}
              onClick={() => { if (!on) onChange(familyDefault(f)); }}
            >
              <span className={s.familyName}>{f}</span>
              <span className={s.familySub}>{familySubline(f)}</span>
            </button>
          );
        })}
      </div>
      <div role="radiogroup" aria-label={`${family} type`} className={s.types}>
        {familyMembers(family).map(m => {
          const [name, key] = splitKey(m.id);
          return (
            <button
              key={m.id} type="button" role="radio" aria-checked={m.id === value}
              aria-label={`${name} in ${key}`} className={s.type}
              onClick={() => onChange(m.id)}
            >
              {name} <span className={s.typeKey}>{key}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
