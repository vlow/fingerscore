import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FingeringOption, RecorderSystem } from '../../domain/fingerings';
import { inst } from '../../domain/instruments';
import type { InstId } from '../../domain/types';
import { FingeringChart } from '../../render/FingeringChart';
import { modelFor } from '../../render/keymap/models';
import { writeAddress } from '../../pages/fingerings/address';
import { readSoprano } from '../../pages/fingerings/prefs';
import { Segmented } from '../Segmented';
import { FingeringView, fingeringNote } from './FingeringView';
import s from './FingeringPanel.module.css';

/** One stop of what the panel steps through: a note of a song or a scale, or a rest of a song. */
export interface PanelNote {
  id: string;
  written: number;
  /** The note's name as the sheet or the scale spells it. */
  name: string;
  rest: boolean;
  /** The bar it is in, as the sheet numbers bars; none on the Scales page. */
  bar?: number;
  options: FingeringOption[];
  /** The fingering shown and the app's own choice; null when the note has none. */
  chosen: number | null;
  auto: number | null;
}

export interface FingeringPanelProps {
  inst: InstId;
  recorderSystem: RecorderSystem;
  notes: PanelNote[];
  /** The note shown. */
  currentId: string;
  /** ‹ › and, on the Scales page, ← →: show another note. */
  onStep(id: string): void;
  /** Picking an alternate: the option index, or null for the app's own choice. */
  onPick(id: string, option: number | null): void;
  onClose(): void;
  /** ← → step the panel itself (the Scales page); on the sheet they move the selection, which the panel follows. */
  arrowKeys?: boolean;
}

const optionLabel = (index: number) => (index === 0 ? 'Standard' : `Alternate ${index}`);

/** The line between ‹ and ›: a rest says so; a note says its bar, where it has one. */
function whereText(note: PanelNote): string {
  const bar = note.bar === undefined ? '' : `bar ${note.bar}`;
  if (note.rest) return bar ? `Rest · ${bar}` : 'Rest';
  return bar || note.name;
}

/**
 * The Fingering panel (design 4.3 and 4.4): the note's fingering on the chart and on the instrument, one view at a time,
 * its alternates to pick from, ‹ › to the neighbouring notes (rests skipped) and a link to the Fingerings page.
 */
export default function FingeringPanel(p: FingeringPanelProps) {
  const panel = useRef<HTMLElement>(null);
  const i = inst(p.inst);
  const [soprano] = useState(readSoprano);
  const model = modelFor(p.inst, i.kind, soprano);
  const [viewId, setViewId] = useState(model.views[0].id);
  const view = model.views.some(v => v.id === viewId) ? viewId : model.views[0].id;

  const playable = p.notes.filter(n => !n.rest);
  const current = p.notes.find(n => n.id === p.currentId) ?? playable[0];
  const at = playable.findIndex(n => n.id === current?.id);
  const neighbour = (dir: 1 | -1): PanelNote | undefined => {
    const k = p.notes.findIndex(n => n.id === current?.id);
    for (let j = k + dir; j >= 0 && j < p.notes.length; j += dir) if (!p.notes[j].rest) return p.notes[j];
    return undefined;
  };
  const prev = neighbour(-1);
  const next = neighbour(1);

  // Esc closes the panel while the focus is in it; ← → step through the notes where the page asks for it.
  const live = useRef({ p, prev, next });
  live.current = { p, prev, next };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !panel.current?.contains(document.activeElement)) return;
      if (e.target instanceof Element && e.target.closest('[role="radiogroup"]')) return;
      const { p: props, prev: before, next: after } = live.current;
      if (e.key === 'Escape') { e.preventDefault(); props.onClose(); return; }
      if (!props.arrowKeys || e.altKey || e.ctrlKey || e.metaKey) return;
      let to: PanelNote | undefined;
      if (e.key === 'ArrowLeft') to = before;
      else if (e.key === 'ArrowRight') to = after;
      if (!to) return;
      e.preventDefault();
      props.onStep(to.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!current) return null;
  const chosen = current.chosen ?? 0;
  const option = current.rest ? null : current.options[chosen] ?? null;
  const href = `/fingerings?${writeAddress({ inst: p.inst, note: current.written, alt: chosen, system: p.recorderSystem, shape: soprano })}`;

  return (
    <aside ref={panel} className={s.panel} aria-labelledby="fingering-panel-title" data-fingering-panel="" data-print-hide="">
      <header className={s.top}>
        <div className={s.titleRow}>
          <h2 id="fingering-panel-title" className={s.title}>Fingering</h2>
          {at >= 0 && <span className={s.count}>note {at + 1} of {playable.length}</span>}
          <button type="button" className={s.close} aria-label="Close the fingering panel" title="Close (Esc)" aria-keyshortcuts="Escape"
            onClick={p.onClose}>✕</button>
        </div>
        <div className={s.stepRow}>
          <button type="button" className={s.step} aria-label="Previous note" disabled={!prev} onClick={() => prev && p.onStep(prev.id)}
            title={p.arrowKeys ? 'Previous note (←)' : 'Previous note'} aria-keyshortcuts={p.arrowKeys ? 'ArrowLeft' : undefined}>‹</button>
          {/* The note's name is in the view's header below; here only where it is. */}
          <p className={s.where}>{whereText(current)}</p>
          <button type="button" className={s.step} aria-label="Next note" disabled={!next} onClick={() => next && p.onStep(next.id)}
            title={p.arrowKeys ? 'Next note (→)' : 'Next note'} aria-keyshortcuts={p.arrowKeys ? 'ArrowRight' : undefined}>›</button>
        </div>
      </header>

      {current.rest ? (
        <p className={s.muted}>A rest: no fingering. Step on with ›.</p>
      ) : (
        <>
          {model.views.length > 1 && (
            <Segmented<string> label="Side of the instrument" size="small" value={view} onChange={setViewId}
              options={model.views.map(v => ({ value: v.id, content: v.label }))} />
          )}
          <FingeringView inst={p.inst} written={current.written} name={current.name} option={option} optionLabel={optionLabel(chosen)}
            soprano={soprano} onlyView={view} />
          {current.options.length > 1 && (
            <div className={s.alts}>
              <h3 className={s.altsTitle}>Fingerings for this note</h3>
              <ul className={s.altList}>
                {current.options.map((o, k) => (
                  <li key={`${k}-${o.n}`}>
                    <button type="button" className={s.alt} aria-pressed={k === chosen}
                      onClick={() => p.onPick(current.id, k === current.auto ? null : k)}>
                      <svg className={s.mini} viewBox="-22 -4 44 98" aria-hidden="true">
                        <FingeringChart kind={i.kind} option={o} style="full" x={0} y={0} />
                      </svg>
                      <span className={s.altText}>
                        <span className={s.altName}>{optionLabel(k)}{k === current.auto ? ' · auto' : ''}</span>
                        {fingeringNote(o.n) && <span className={s.muted}>{fingeringNote(o.n)}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Link className={s.open} to={href}>Open in Fingerings ↗</Link>
    </aside>
  );
}
