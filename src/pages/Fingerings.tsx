import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { optionsFor, type RecorderSystem } from '../domain/fingerings';
import { displayName, FAMILIES, familyMembers, inst } from '../domain/instruments';
import type { InstId } from '../domain/types';
import { FingeringChart } from '../render/FingeringChart';
import type { SopranoShape } from '../render/keymap/models';
import { useApp } from '../state/store';
import { FingeringView, fingeringNote } from '../ui/fingering/FingeringView';
import { Segmented } from '../ui/Segmented';
import { isApple } from '../ui/shortcuts';
import { readNote } from '../domain/noteText';
import { defaultNote, inRange, readAddress, writeAddress, type FingeringsState } from './fingerings/address';
import { NamePicker } from './fingerings/NamePicker';
import { readSoprano, writeSoprano } from './fingerings/prefs';
import s from './Fingerings.module.css';

const SYSTEMS: { value: RecorderSystem; content: string }[] = [{ value: 'baroque', content: 'Baroque' }, { value: 'german', content: 'German fingering' }];
const SHAPES: { value: SopranoShape; content: string }[] = [{ value: 'straight', content: 'Straight' }, { value: 'curved', content: 'Curved' }];

/** "Standard" for the first option, "Alternate n" for the others. */
const optionLabel = (index: number) => (index === 0 ? 'Standard' : `Alternate ${index}`);

/** The note of that letter nearest the current one, as A–G do on the sheet; null when none is in range. */
function nearestOf(letter: string, near: number, lo: number, hi: number): number | null {
  const read = readNote(letter, near, lo, hi);
  return 'pitch' in read ? read.pitch : null;
}

/** Where the page's keys do nothing: typing, and controls that use the arrow keys themselves. */
const OWN_KEYS = 'input, textarea, select, [contenteditable="true"], [role="radiogroup"]';

/** The Fingerings page (design 4.2): any note on any instrument, on its chart and on the instrument. */
export default function Fingerings() {
  const [params, setParams] = useSearchParams();
  const preferred = useApp(a => a.instId);
  const st = useMemo(() => readAddress(params, preferred, readSoprano()), [params, preferred]);
  const i = inst(st.inst);
  const options = optionsFor(st.inst, st.note, st.system);
  const alt = st.alt < options.length ? st.alt : 0;
  const option = options[alt] ?? null;
  const mod = isApple() ? '⌘' : 'Ctrl';

  const show = (patch: Partial<FingeringsState>) => {
    const next = { ...st, alt, ...patch };
    if (patch.shape) writeSoprano(patch.shape);
    setParams(writeAddress(next), { replace: true });
  };
  const pickNote = (note: number) => { if (inRange(st.inst, note)) show({ note, alt: 0 }); };
  const pickInst = (id: InstId) => show({ inst: id, note: inRange(id, st.note) ? st.note : defaultNote(id), alt: 0 });

  // The page's keys (design 4.6): ↑ ↓ semitone, Ctrl/⌘ ↑ ↓ octave, A–G note name; not while typing or in a control
  // that moves with the arrow keys (a radio group, the chart's keys, which mark the press as handled).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey) return;
      if (e.target instanceof Element && e.target.closest(OWN_KEYS)) return;
      const octave = e.ctrlKey || e.metaKey;
      let next: number | null = null;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') next = st.note + (e.key === 'ArrowUp' ? 1 : -1) * (octave ? 12 : 1);
      else if (!octave && !e.shiftKey && /^[a-g]$/i.test(e.key)) next = nearestOf(e.key, st.note, i.lo, i.ext);
      if (next === null) return;
      e.preventDefault();
      if (inRange(st.inst, next)) setParams(writeAddress({ ...st, note: next, alt: 0 }), { replace: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [st, setParams, i.lo, i.ext]);

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1 className={s.h1}>Fingerings</h1>
        <div className={s.bar}>
          <label htmlFor="fingerings-inst" className={s.forLabel}>for <span className={s.srOnly}>instrument</span></label>
          <select id="fingerings-inst" className={s.select} value={st.inst} onChange={e => pickInst(e.target.value as InstId)}>
            {FAMILIES.map(f => (
              <optgroup key={f} label={f}>
                {familyMembers(f).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            ))}
          </select>
          {i.kind === 'rec' && (
            <Segmented label="Recorder system" size="small" value={st.system} options={SYSTEMS} onChange={system => show({ system, alt: 0 })} />
          )}
          {st.inst === 'ssax' && (
            <Segmented label="Soprano saxophone shape" size="small" value={st.shape} options={SHAPES} onChange={shape => show({ shape })} />
          )}
        </div>
      </div>

      <div className={s.grid}>
        <aside className={s.picker} aria-label="Choose a note">
          <h2 className={s.cardTitle}>Note as you read it</h2>
          <NamePicker pitch={st.note} lo={i.lo} hi={i.ext} instName={displayName(i)} mod={mod} onPick={pickNote} />
          <p className={s.keysHint}>↑ ↓ semitone · {mod} ↑ ↓ octave · A – G note name</p>

          <h2 className={s.cardTitle}>Fingerings for this note <span className={s.count}>{options.length}</span></h2>
          {options.length === 0 ? (
            <p className={s.muted}>No sourced fingering for this note.</p>
          ) : (
            <ul className={s.alts}>
              {options.map((o, k) => (
                <li key={`${k}-${o.n}`}>
                  <button type="button" className={s.alt} aria-pressed={k === alt} onClick={() => show({ alt: k })}>
                    <svg className={s.mini} viewBox="-22 -4 44 98" aria-hidden="true">
                      <FingeringChart kind={i.kind} option={o} style="full" x={0} y={0} />
                    </svg>
                    <span className={s.altText}>
                      <span className={s.altName}>{optionLabel(k)}</span>
                      {fingeringNote(o.n) && <span className={s.muted}>{fingeringNote(o.n)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <FingeringView inst={st.inst} written={st.note} option={option} optionLabel={optionLabel(alt)} soprano={st.shape} />
      </div>
    </div>
  );
}
