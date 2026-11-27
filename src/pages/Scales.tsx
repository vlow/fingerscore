import { useEffect, useMemo, useRef, useState } from 'react';
import { hasSatellites, legend, type RecorderSystem } from '../domain/fingerings';
import { SCALE_TEMPO } from '../domain/playMode';
import { displayName, FAMILIES, familyMembers, inst, ORDER } from '../domain/instruments';
import {
  buildScale, isKeyTransposing, keyChips, SCALE_IDS, scaleFingerings, scaleName, validPick, type ScaleDirection, type ScaleId,
  type ScaleRange,
} from '../domain/scales';
import type { InstId } from '../domain/types';
import { ScaleStaff, scaleLines, type ScaleStaffProps } from '../render/ScaleStaff';
import { requestScalePdf, scalePdfModule } from '../pdf/request';
import { intentProps } from '../shell/lazy';
import { readJSON, writeJSON } from '../shell/storage';
import { useApp } from '../state/store';
import { Segmented } from '../ui/Segmented';
import { usePdfJob } from '../ui/usePdfJob';
import { PLAY_MODE_LOAD_FAILED, playModeModule, usePlayModeLoad } from '../ui/usePlayModeLoad';
import { FINGERING_LOAD_FAILED, FingeringButton, useFingeringKey, useFingeringPanel } from '../ui/fingering/useFingeringPanel';
import { useScaleAlternatives } from './scales/useScaleAlternatives';
import { usePaper } from '../shell/theme';
import '../styles/print.css';
import s from './Scales.module.css';

const KEY = 'fingerscore.scales';

type KeysBy = 'read' | 'sound';
interface Settings {
  inst: InstId; scale: ScaleId; tonicPc: number; sharp: boolean; range: ScaleRange; direction: ScaleDirection; by: KeysBy;
  chartStyle: 'compact' | 'full'; recorderSystem: RecorderSystem; showAlternates: boolean; showNames: boolean;
  /** The player's fingering picks: note index in the scale's sequence → option index. */
  overrides: Record<number, number>;
}

/** Settings that change the note sequence or its fingering tables: a change clears the picks. */
const SEQUENCE: (keyof Settings)[] = ['inst', 'scale', 'tonicPc', 'sharp', 'range', 'direction', 'recorderSystem'];

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
  const st: Settings = {
    inst: pick(r.inst, ORDER, preferred),
    scale: pick(r.scale, SCALE_IDS, 'maj'),
    tonicPc: pick(r.tonicPc, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 0),
    sharp: bool(r.sharp, false),
    range: pick(r.range, RANGES.map(o => o.value), 'one'),
    direction: pick(r.direction, DIRECTIONS.map(o => o.value), 'up'),
    by: pick(r.by, BY.map(o => o.value), 'read'),
    chartStyle: pick(r.chartStyle, CHART_STYLES.map(o => o.value), 'compact'),
    recorderSystem: pick(r.recorderSystem, SYSTEMS.map(o => o.value), 'baroque'),
    showAlternates: bool(r.showAlternates, false),
    showNames: bool(r.showNames, true),
    overrides: {},
  };
  // A pick is kept only when its key is a note index of the rebuilt scale, its option index is valid for that note and
  // it differs from the automatic choice (which would count as changed without changing anything).
  const stored = r.overrides !== null && typeof r.overrides === 'object' && !Array.isArray(r.overrides) ? r.overrides as Record<string, unknown> : {};
  const notes = buildScale(st).notes;
  const fingerings = scaleFingerings(st.inst, notes, st.recorderSystem, {});
  for (const [key, value] of Object.entries(stored)) {
    if (!/^\d+$/.test(key)) continue;
    const index = Number(key);
    if (index < notes.length && validPick(value, fingerings[index].options) && value !== fingerings[index].auto) st.overrides[index] = value;
  }
  return st;
}

/**
 * The scale on paper: caption, staves and legend. On the page the staves carry the alternatives pills and the paper
 * is what prints; Play mode shows the same paper with the player's picks and no pills.
 */
function ScalePaper({ caption, staff, page = false }: { caption: string; staff: ScaleStaffProps; page?: boolean }) {
  const { paper } = usePaper();
  return (
    <section aria-label="Scale" className={s.paper} data-print-scale={page ? '' : undefined} data-paper={paper}>
      <h2 className={s.caption}>{caption}</h2>
      <ScaleStaff {...staff} />
      <footer className={s.legend}>
        <span>{legend(staff.inst)}</span>
        <span>fingerscore.eu</span>
      </footer>
    </section>
  );
}

/** The Scales page (design 4.4): one control card, the notice, and the scale on paper. */
export default function Scales() {
  const [st, setSt] = useState<Settings>(() => load(useApp.getState().instId));
  const set = (patch: Partial<Settings>) => {
    if (SEQUENCE.some(k => k in patch)) closeAlt(false);
    setSt(prev => {
      const reset = SEQUENCE.some(k => k in patch && patch[k] !== prev[k]);
      return { ...prev, ...patch, ...(reset ? { overrides: {} } : {}) };
    });
  };
  const pickFingering = (index: number, option: number | null) => setSt(prev => {
    const overrides = { ...prev.overrides };
    if (option === null) delete overrides[index];
    else overrides[index] = option;
    return { ...prev, overrides };
  });
  useEffect(() => { writeJSON('local', KEY, st); }, [st]);

  const pdf = usePdfJob();
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState('');

  const i = inst(st.inst);
  // The Fingering panel (design 4.4): a chart, the popover's "Show on instrument", the Fingering button or I opens it.
  const fingering = useFingeringPanel();
  const [panelIndex, setPanelIndex] = useState(0);
  const fingeringButton = useRef<HTMLButtonElement>(null);
  const openPanel = (index: number) => { setPanelIndex(index); fingering.show(); };
  const { closeAlt, renderUnderChart } = useScaleAlternatives(i.kind, st.chartStyle, pickFingering, openPanel);
  const transposing = isKeyTransposing(st.inst);
  const name = scaleName(st.scale);
  const scale = useMemo(
    () => buildScale({ inst: st.inst, scale: st.scale, tonicPc: st.tonicPc, sharp: st.sharp, range: st.range, direction: st.direction }),
    [st.inst, st.scale, st.tonicPc, st.sharp, st.range, st.direction],
  );
  const fingerings = useMemo(
    () => scaleFingerings(st.inst, scale.notes, st.recorderSystem, st.overrides),
    [st.inst, scale, st.recorderSystem, st.overrides],
  );
  // Play mode (design 2026-11-27): the scale alone on the screen, one note per beat for auto-scroll.
  const staff = useMemo<ScaleStaffProps>(
    () => ({ inst: st.inst, scale, chartStyle: st.chartStyle, recorderSystem: st.recorderSystem, showNames: st.showNames, showAlternates: st.showAlternates, overrides: st.overrides }),
    [st.inst, scale, st.chartStyle, st.recorderSystem, st.showNames, st.showAlternates, st.overrides],
  );
  const playLines = useMemo(() => scaleLines(staff).map(l => ({ beats: l.notes, height: l.height })), [staff]);
  const [performing, setPerforming] = useState(false);
  const playModeButton = useRef<HTMLButtonElement>(null);
  const { value: PlayMode, failed: playModeFailed, request: enterPlayMode } = usePlayModeLoad(() => {
    closeAlt(false);
    fingering.close();
    setPerforming(true);
  });
  const toggleFingering = () => {
    if (fingering.wanted) fingering.close();
    else openPanel(panelIndex);
  };
  useFingeringKey(!performing, toggleFingering);
  const closeFingering = () => {
    fingering.close();
    fingeringButton.current?.focus();
  };
  const panelNotes = useMemo(() => scale.notes.map((n, k) => ({
    id: String(k), written: n.written, name: n.spelled.name, rest: false, options: fingerings[k].options,
    chosen: fingerings[k].chosen ?? null, auto: fingerings[k].auto ?? null,
  })), [scale, fingerings]);
  const wasPerforming = useRef(false);
  useEffect(() => {
    if (wasPerforming.current && !performing) playModeButton.current?.focus();
    wasPerforming.current = performing;
  }, [performing]);

  const withAlternates = fingerings.filter(f => f.options.length >= 2).length;
  const changed = fingerings.filter(f => f.overridden).length;
  // The chips change with the scale type (major or minor tonic table); the selection is the written pitch class.
  const by = transposing ? st.by : 'read';
  const chips = keyChips(st.inst, st.scale, by);
  // A chip is a written pitch class plus its spelling; only a six-accidental key has two chips.
  const chipId = (c: { writtenPc: number; sharp: boolean }) => `${c.writtenPc}${c.sharp ? '♯' : ''}`;
  const current = chips.find(c => c.writtenPc === st.tonicPc && c.sharp === st.sharp) ?? chips.find(c => c.writtenPc === st.tonicPc)!;
  const caption = `${displayName(i)} · ${scale.tonic} ${name}` + (transposing ? ` · sounds ${current.concert} ${name}` : '');

  async function downloadPdf() {
    closeAlt(false);
    setPdfProgress('');
    setPdfError(null);
    const done = await pdf.start(o => requestScalePdf({
      inst: st.inst, scale, scaleName: name, caption, chartStyle: st.chartStyle, recorderSystem: st.recorderSystem,
      showNames: st.showNames, showAlternates: st.showAlternates, overrides: st.overrides,
    }, o), setPdfProgress);
    setPdfProgress('');
    if (done?.error) setPdfError(done.error);
  }

  const chipOptions = chips.map(c => {
    if (!transposing) return { value: chipId(c), content: <span className={s.chipMain}>{c.written}</span>, name: c.written };
    const [lead, sub] = by === 'read' ? [c.written, `sounds ${c.concert}`] : [c.concert, `you read ${c.written}`];
    return {
      value: chipId(c),
      name: `${lead} · ${sub}`,
      content: <><span className={s.chipMain}>{lead}</span><span className={s.chipSub}>{sub}</span></>,
    };
  });

  return (
    <div className={s.page}>
      {performing && PlayMode && (
        <PlayMode lines={playLines} tempo={SCALE_TEMPO} onExit={() => setPerforming(false)}>
          <ScalePaper caption={caption} staff={staff} />
        </PlayMode>
      )}
      <div className={s.head} data-print-hide="">
        <h1 className={s.h1}>Scales with fingerings</h1>
        <div className={s.buttons}>
          <FingeringButton ref={fingeringButton} open={fingering.wanted} onToggle={toggleFingering} />
          <button ref={playModeButton} type="button" className={s.plain} {...intentProps(playModeModule)}
            title="Show only the scale, full screen, with page turning and auto-scroll." onClick={enterPlayMode}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4h16v11H4z" /><path d="M12 15v5" /><path d="M8 20h8" />
            </svg>
            Play mode
          </button>
          <button type="button" className={s.primary} data-primary="" aria-disabled={pdf.busy} {...intentProps(scalePdfModule)} onClick={() => { if (!pdf.busy) void downloadPdf(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
            </svg>
            {pdf.busy ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <button type="button" className={s.plain} onClick={() => window.print()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" />
            </svg>
            Print
          </button>
        </div>
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
          <Segmented label="Key" size="chip" value={chipId(current)} options={chipOptions} onChange={id => { const c = chips.find(k => chipId(k) === id)!; set({ tonicPc: c.writtenPc, sharp: c.sharp }); }} />
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

        {withAlternates > 0 && (
          <div className={s.alts}>
            <span>
              {withAlternates} {withAlternates === 1 ? 'note has' : 'notes have'} alternate fingerings · {changed} changed by you
            </span>
            {changed > 0 && (
              <button type="button" className={s.reset} onClick={() => { closeAlt(false); set({ overrides: {} }); }}>Reset all to auto</button>
            )}
          </div>
        )}
      </div>

      {pdfError && <p role="alert" className={s.pdfError} data-print-hide="">{pdfError}</p>}
      {playModeFailed && <p role="alert" className={s.pdfError} data-print-hide="">{PLAY_MODE_LOAD_FAILED}</p>}
      {fingering.failed && <p role="alert" className={s.pdfError} data-print-hide="">{FINGERING_LOAD_FAILED}</p>}

      {/* The live region stays mounted so screen readers announce a notice when it appears. */}
      <div role="status" className={s.status} data-print-hide="">
        {scale.notice && <div className={s.notice}>{scale.notice}</div>}
        {pdfProgress && <div>{pdfProgress}</div>}
      </div>

      <div className={s.withPanel}>
        <div className={s.scroll}>
          <ScalePaper caption={caption} staff={{ ...staff, renderUnderChart, onChartClick: openPanel }} page />
        </div>
        {fingering.open && fingering.Panel && !performing && panelNotes.length > 0 && (
          <fingering.Panel inst={st.inst} recorderSystem={st.recorderSystem} notes={panelNotes} arrowKeys
            currentId={String(Math.min(panelIndex, panelNotes.length - 1))} onStep={id => setPanelIndex(Number(id))}
            onPick={(id, option) => pickFingering(Number(id), option)} onClose={closeFingering} />
        )}
      </div>
    </div>
  );
}
