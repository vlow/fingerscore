import { useEffect, useMemo, useState } from 'react';
import { hasSatellites, legend, type RecorderSystem } from '../domain/fingerings';
import { displayName, FAMILIES, familyMembers, inst, ORDER } from '../domain/instruments';
import {
  buildScale, isKeyTransposing, keyChips, SCALE_IDS, scaleName, type ScaleDirection, type ScaleId, type ScaleRange,
} from '../domain/scales';
import type { InstId } from '../domain/types';
import { ScaleStaff } from '../render/ScaleStaff';
import { readJSON, writeJSON } from '../state/storage';
import { useApp } from '../state/store';
import { Segmented } from '../ui/Segmented';
import '../styles/print.css';
import s from './Scales.module.css';

const KEY = 'fingerscore.scales';

type KeysBy = 'read' | 'sound';
interface Settings {
  inst: InstId; scale: ScaleId; tonicPc: number; range: ScaleRange; direction: ScaleDirection; by: KeysBy;
  chartStyle: 'compact' | 'full'; recorderSystem: RecorderSystem; showAlternates: boolean; showNames: boolean;
}

const RANGES: { value: ScaleRange; content: string }[] = [
  { value: 'one', content: '1 octave' }, { value: 'two', content: '2 octaves' }, { value: 'all', content: 'Whole range' },
];
const DIRECTIONS: { value: ScaleDirection; content: string }[] = [{ value: 'up', content: 'Up' }, { value: 'updown', content: 'Up & down' }];
const BY: { value: KeysBy; content: string }[] = [{ value: 'read', content: 'You read' }, { value: 'sound', content: 'Sounds in' }];
const CHART_STYLES: { value: Settings['chartStyle']; content: string }[] = [
  { value: 'compact', content: 'Compact' }, { value: 'full', content: 'Full key map' },
];
const SYSTEMS: { value: RecorderSystem; content: string }[] = [{ value: 'baroque', content: 'Baroque' }, { value: 'german', content: 'German fingering' }];

const capitalised = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** A stored field when it is one of the allowed values, else the fallback. */
function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Stored settings, checked field by field (design 4.4): unknown instrument → the preferred one, other unknowns → defaults. */
function load(preferred: InstId): Settings {
  const raw = readJSON<Record<string, unknown>>('local', KEY);
  const r = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    inst: pick(r.inst, ORDER, preferred),
    scale: pick(r.scale, SCALE_IDS, 'maj'),
    tonicPc: pick(r.tonicPc, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 0),
    range: pick(r.range, RANGES.map(o => o.value), 'one'),
    direction: pick(r.direction, DIRECTIONS.map(o => o.value), 'up'),
    by: pick(r.by, BY.map(o => o.value), 'read'),
    chartStyle: pick(r.chartStyle, CHART_STYLES.map(o => o.value), 'compact'),
    recorderSystem: pick(r.recorderSystem, SYSTEMS.map(o => o.value), 'baroque'),
    showAlternates: bool(r.showAlternates, false),
    showNames: bool(r.showNames, true),
  };
}

/** The Scales page (design 4.4): one control card, the notice, and the scale on paper. */
export default function Scales() {
  const [st, setSt] = useState<Settings>(() => load(useApp.getState().instId));
  const set = (patch: Partial<Settings>) => setSt(prev => ({ ...prev, ...patch }));
  useEffect(() => { writeJSON('local', KEY, st); }, [st]);

  const i = inst(st.inst);
  const transposing = isKeyTransposing(st.inst);
  const name = scaleName(st.scale);
  const scale = useMemo(
    () => buildScale({ inst: st.inst, scale: st.scale, tonicPc: st.tonicPc, range: st.range, direction: st.direction }),
    [st.inst, st.scale, st.tonicPc, st.range, st.direction],
  );
  // The chips change with the scale type (major or minor tonic table); the selection is the written pitch class.
  const by = transposing ? st.by : 'read';
  const chips = keyChips(st.inst, st.scale, by);
  const current = chips.find(c => c.writtenPc === st.tonicPc)!;
  const caption = `${displayName(i)} · ${scale.tonic} ${name}` + (transposing ? ` · sounds ${current.concert} ${name}` : '');

  const chipOptions = chips.map(c => {
    if (!transposing) return { value: c.writtenPc, content: <span className={s.chipMain}>{c.written}</span>, name: c.written };
    const [lead, sub] = by === 'read' ? [c.written, `sounds ${c.concert}`] : [c.concert, `you read ${c.written}`];
    return {
      value: c.writtenPc,
      name: `${lead} · ${sub}`,
      content: <><span className={s.chipMain}>{lead}</span><span className={s.chipSub}>{sub}</span></>,
    };
  });

  return (
    <div className={s.page}>
      <div className={s.head} data-print-hide="">
        <h1 className={s.h1}>Scales with fingerings</h1>
        <button type="button" className={s.print} onClick={() => window.print()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" />
          </svg>
          Print
        </button>
      </div>

      <div className={s.card} data-print-hide="">
        <div className={s.row}>
          <div className={s.field}>
            <label htmlFor="scales-inst" className={s.label}>Instrument</label>
            <select id="scales-inst" className={s.select} value={st.inst} onChange={e => set({ inst: e.target.value as InstId })}>
              {FAMILIES.map(f => (
                <optgroup key={f} label={f}>
                  {familyMembers(f).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className={s.field}>
            <label htmlFor="scales-scale" className={s.label}>Scale</label>
            <select id="scales-scale" className={s.select} value={st.scale} onChange={e => set({ scale: e.target.value as ScaleId })}>
              {SCALE_IDS.map(id => <option key={id} value={id}>{capitalised(scaleName(id))}</option>)}
            </select>
          </div>
          <div className={`${s.field} ${s.range}`}>
            <span className={s.label} aria-hidden="true">Range</span>
            <Segmented label="Range" value={st.range} options={RANGES} onChange={range => set({ range })} />
          </div>
          <div className={`${s.field} ${s.direction}`}>
            <span className={s.label} aria-hidden="true">Direction</span>
            <Segmented label="Direction" value={st.direction} options={DIRECTIONS} onChange={direction => set({ direction })} />
          </div>
        </div>

        <div className={s.keys}>
          <div className={s.keysHead}>
            <span className={s.label} aria-hidden="true">Key</span>
            {transposing && (
              <div className={s.inline}>
                <span className={s.inlineLabel} aria-hidden="true">Name keys by</span>
                <Segmented label="Name keys by" size="small" value={st.by} options={BY} onChange={v => set({ by: v })} />
              </div>
            )}
          </div>
          <Segmented label="Key" size="chip" value={st.tonicPc} options={chipOptions} onChange={tonicPc => set({ tonicPc })} />
        </div>

        <div className={s.row}>
          {hasSatellites(i.kind) && (
            <div className={s.inline}>
              <span className={s.inlineLabel} aria-hidden="true">Charts:</span>
              <Segmented label="Chart style" size="small" value={st.chartStyle} options={CHART_STYLES} onChange={chartStyle => set({ chartStyle })} />
            </div>
          )}
          {i.kind === 'rec' && (
            <div className={s.inline}>
              <span className={s.inlineLabel} aria-hidden="true">Fingering:</span>
              <Segmented label="Recorder system" size="small" value={st.recorderSystem} options={SYSTEMS}
                onChange={recorderSystem => set({ recorderSystem })} />
            </div>
          )}
          <label className={s.check}>
            <input type="checkbox" checked={st.showAlternates} onChange={e => set({ showAlternates: e.target.checked })} />
            Show alternate fingerings
          </label>
          <label className={s.check}>
            <input type="checkbox" checked={st.showNames} onChange={e => set({ showNames: e.target.checked })} />
            Note names
          </label>
        </div>
      </div>

      {/* The live region stays mounted so screen readers announce a notice when it appears. */}
      <div role="status" className={s.status} data-print-hide="">
        {scale.notice && <div className={s.notice}>{scale.notice}</div>}
      </div>

      <div className={s.scroll}>
        <section aria-label="Scale" className={s.paper} data-print-scale="">
          <h2 className={s.caption}>{caption}</h2>
          <ScaleStaff inst={st.inst} scale={scale} chartStyle={st.chartStyle} recorderSystem={st.recorderSystem}
            showNames={st.showNames} showAlternates={st.showAlternates} />
          <footer className={s.legend}>
            <span>{legend(st.inst)}</span>
            <span>fingerscore.eu</span>
          </footer>
        </section>
      </div>
    </div>
  );
}
