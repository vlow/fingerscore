import { useEffect, useMemo, useState } from 'react';
import type { FingeringOption } from '../../domain/fingerings';
import { displayName, inst, isTransposing, noteNameFlat, rangeState, type RangeState } from '../../domain/instruments';
import type { InstId } from '../../domain/types';
import { FingeringChart, MissingChart } from '../../render/FingeringChart';
import { ChartTargets } from '../../render/keymap/ChartTargets';
import { InstrumentDrawing } from '../../render/keymap/InstrumentDrawing';
import type { KeyEvents } from '../../render/keymap/KeyTarget';
import type { ModelKey } from '../../render/keymap/model';
import { modelFor, type SopranoShape } from '../../render/keymap/models';
import s from './FingeringView.module.css';

const SCALE = 4;
const IDLE = 'Point at a key to find it on the instrument. Click to pin it.';

export interface FingeringViewProps {
  inst: InstId;
  /** The written pitch. */
  written: number;
  /** The fingering shown; null when the note has no sourced fingering. */
  option: FingeringOption | null;
  /** What the option is among the note's options: "Standard", "Alternate 2". */
  optionLabel: string;
  soprano: SopranoShape;
  /** The panel shows one view of the instrument at a time; the page all of them. */
  onlyView?: string;
}

/** Each key the option presses, with how far: 1 closed, 0.5 half (a half-hole, or a recorder's larger double hole). */
function pressedKeys(option: FingeringOption | null): Map<string, number> {
  if (option === null) return new Map();
  return new Map<string, number>([
    ...option.h.flatMap((v, i): [string, number][] => (v > 0 ? [[`h${i}`, v]] : [])),
    ...option.x.map((x): [string, number] => [x, 1]),
  ]);
}

/**
 * What a fingering's name adds to its label: the data names most standard fingerings "standard", sometimes with a
 * player's note after it ("standard · ease the lip pressure"); the label says "Standard" already.
 */
export function fingeringNote(name: string): string {
  return name.replace(/^standard(?: · )?/, '');
}

/** The words after a key's name in the info line. */
function pressWord(value: number): string {
  if (value === 1) return ' · pressed';
  return value > 0 ? ' · half pressed' : '';
}

/** The placeholder a note without a fingering gets, as on a sheet: out of range, extended, or altissimo. */
function missingType(range: RangeState): 'bad' | 'ext' | 'alt' {
  if (range === 'ok') return 'alt';
  return range;
}

/**
 * One fingering, three views that point at each other (design 4.1): the chart, the instrument from its fixed sides, and
 * the keys to press. Pointing at a key anywhere highlights it everywhere and names it; a click pins it, Esc unpins.
 */
export function FingeringView(p: FingeringViewProps) {
  const i = inst(p.inst);
  const model = modelFor(p.inst, i.kind, p.soprano);
  const pressed = useMemo(() => pressedKeys(p.option), [p.option]);
  const names = useMemo(() => Object.fromEntries(model.keys.map(k => [k.id, `${k.name} (${k.finger})`])), [model]);
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const shown = active ?? pinned;
  const events: KeyEvents = { onActive: setActive, onPick: id => setPinned(x => (x === id ? null : id)) };

  const key = shown === null ? undefined : model.keys.find(k => k.id === shown);
  const info = key ? `${key.name} · ${key.finger}${pressWord(pressed.get(key.id) ?? 0)}` : IDLE;

  // Esc unpins. Only while a key is pinned, so Esc keeps its other meanings (closing a panel) the rest of the time.
  useEffect(() => {
    if (pinned === null) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPinned(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pinned]);

  const name = noteNameFlat(p.written);
  const note = fingeringNote(p.option?.n ?? '');
  const press = model.keys.filter(k => pressed.has(k.id));

  return (
    <section className={`${s.view} ${p.onlyView ? s.narrow : ''}`} aria-label={`Fingering for ${name}`}>
      <header className={s.head}>
        <p className={s.note}>{name}</p>
        <div className={s.about}>
          {isTransposing(i) && <p className={s.sub}>written · sounds {noteNameFlat(p.written - i.off)}</p>}
          <p className={s.sub}>{displayName(i)}{note ? ` · ${note}` : ''}</p>
        </div>
        {p.option && <span className={s.tag}>{p.optionLabel}</span>}
      </header>

      <output className={s.info} aria-live="polite" title={info}>{info}</output>

      <div className={s.figures}>
        <figure className={s.chart}>
          <svg viewBox="-90 -12 180 380" role="group" aria-label="Fingering chart">
            {p.option ? (
              <>
                <FingeringChart kind={i.kind} option={p.option} style="full" x={0} y={0} scale={SCALE} />
                <g transform={`scale(${SCALE})`}>
                  <ChartTargets kind={i.kind} names={names} shown={shown} events={events} />
                </g>
              </>
            ) : (
              <g transform={`scale(${SCALE})`}>
                <MissingChart type={missingType(rangeState(i, p.written))} x={0} y={0} />
              </g>
            )}
          </svg>
          <figcaption className={s.caption}>Chart</figcaption>
        </figure>
        <figure className={s.drawing}>
          <InstrumentDrawing model={model} pressed={pressed} shown={shown} events={events} only={p.onlyView} />
        </figure>
      </div>

      {p.option ? (
        <div className={s.press}>
          <h3 className={s.pressTitle}>Press</h3>
          {press.length === 0
            ? <p className={s.none}>Nothing: every key open</p>
            : <KeyList keys={press} pressed={pressed} pinned={pinned} setActive={setActive} onPick={events.onPick} />}
        </div>
      ) : (
        <p className={s.none} role="note">No sourced fingering for this note. fingerscore never guesses.</p>
      )}
      {/* Every key as a full-size button: the keyboard's and screen readers' way to the keys of the chart and drawings. */}
      {/* Its list exists only while open: a closed details element keeps its content laid out in some browsers. */}
      <details className={s.all} open={allOpen} onToggle={e => setAllOpen(e.currentTarget.open)}>
        <summary className={s.allSummary}>All keys of the {model.name.toLowerCase()}</summary>
        {allOpen && <KeyList keys={model.keys} pressed={pressed} pinned={pinned} setActive={setActive} onPick={events.onPick} />}
      </details>
    </section>
  );
}

/** Keys as buttons: pointing or focusing highlights a key everywhere, a click pins it. */
function KeyList(p: {
  keys: ModelKey[]; pressed: ReadonlyMap<string, number>; pinned: string | null;
  setActive(id: string | null): void; onPick(id: string): void;
}) {
  return (
    <ul className={s.list}>
      {p.keys.map(k => {
        const value = p.pressed.get(k.id) ?? 0;
        return (
          <li key={k.id}>
            <button type="button" className={s.keyButton} aria-pressed={p.pinned === k.id}
              onMouseEnter={() => p.setActive(k.id)} onMouseLeave={() => p.setActive(null)}
              onFocus={() => p.setActive(k.id)} onBlur={() => p.setActive(null)} onClick={() => p.onPick(k.id)}>
              <span className={s.keyName}>{k.name}{value > 0 && value < 1 ? ' (half)' : ''}</span>
              <span className={s.finger}>{k.finger}{pressWord(value)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
