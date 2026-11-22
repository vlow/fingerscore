import type { Doc } from '../domain/types';
import s from './ShowToggles.module.css';

type Show = Doc['show'];
interface Props { show: Show; onChange(show: Show): void }

/** Show on sheet card body (SPEC §9.7). */
export default function ShowToggles({ show, onChange }: Props) {
  const box = (key: keyof Show) => (
    <input type="checkbox" className={s.box} checked={show[key]} onChange={e => onChange({ ...show, [key]: e.target.checked })} />
  );
  return (
    <div className={s.list}>
      <label className={s.row}>{box('fingerings')}Fingering charts</label>
      <label className={s.row}>{box('chords')}Chord symbols (transposed)</label>
      <label className={`${s.row} ${s.sub}`}>
        {box('raiseExtensions')}
        <span>Raise extensions (C<sup className={s.sup}>7</sup>, Am<sup className={s.sup}>add9</sup>)</span>
      </label>
      <label className={s.row}>{box('lyrics')}Lyrics</label>
    </div>
  );
}
