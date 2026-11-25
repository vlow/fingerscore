import { Fragment, useMemo, type ReactNode } from 'react';
import type { Derived } from '../domain/derive';
import type { Doc } from '../domain/types';
import { usePaper } from '../state/theme';
import { markRow, type SheetLayout } from './layout';
import { sheetMarkDrop } from './markDrop';
import styles from './Paper.module.css';
import { SystemView, tieSegments, type UnderChart } from './SystemView';

export interface PaperProps {
  doc: Doc; derived: Derived; layout: SheetLayout;
  playingId: string | null;
  /** The selected event (SheetPage UI state); clicking an event reports it, clicking it again reports null. */
  selectedId?: string | null; onSelect?(id: string | null): void;
  onTitle?(title: string): void; onSubtitle?(subtitle: string): void;
  /** Play mode: the headings are plain text and nothing on the paper can be clicked, selected or edited. */
  readOnly?: boolean;
  renderUnderChart?: UnderChart;   // slot for the alt-fingering pill (Task 20)
  /** Bands drawn although their Show toggle is off (Lyrics and Chords mode); display only, not printed. */
  forceShow?: { lyrics?: boolean; chords?: boolean };
  /** HTML directly below system i (the editing panels); not printed. */
  renderUnderSystem?(systemIndex: number): ReactNode;
}

/** The printed sheet: editable heading, tempo and key line, systems, legend. */
export function Paper(p: PaperProps): JSX.Element {
  const { doc, derived, layout } = p;
  const { paper } = usePaper();
  const ties = useMemo(() => tieSegments(derived, layout), [derived, layout]);
  const last = layout.systems.length - 1;
  const forcedLyrics = !!p.forceShow?.lyrics && !doc.show.lyrics;
  const forcedChords = !!p.forceShow?.chords && !doc.show.chords;
  const show = useMemo(
    () => (forcedLyrics || forcedChords ? { ...doc.show, lyrics: doc.show.lyrics || forcedLyrics, chords: doc.show.chords || forcedChords } : doc.show),
    [doc.show, forcedLyrics, forcedChords],
  );
  const drop = useMemo(() => (markRow(doc) > 0 ? sheetMarkDrop(doc, derived, layout, show, ties) : 0), [doc, derived, layout, show, ties]);
  return (
    <article className={`paper ${styles.paper}`} data-testid="paper" data-paper={paper}
      data-forced-lyrics={forcedLyrics ? '' : undefined} data-forced-chords={forcedChords ? '' : undefined}>
      {p.readOnly ? (
        <header className={styles.heading}>
          <h1 className={`${styles.h1} ${styles.plain} ${styles.title}`}>{doc.title}</h1>
          {doc.subtitle.trim() !== '' && <div data-subtitle="" className={`${styles.plain} ${styles.plainSubtitle}`}>{doc.subtitle}</div>}
        </header>
      ) : (
      <header className={styles.heading}>
        <h1 className={styles.h1}>
          <input className={`${styles.ttl} ${styles.title}`} data-print-plain="" type="text" aria-label="Sheet title" value={doc.title}
            placeholder="Add a title" onChange={e => p.onTitle?.(e.target.value)} />
        </h1>
        <input className={`${styles.ttl} ${styles.subtitle}`} data-print-plain="" type="text" aria-label="Sheet subtitle" value={doc.subtitle}
          placeholder="Add a subtitle (composer, arranger…)" onChange={e => p.onSubtitle?.(e.target.value)} />
      </header>
      )}
      <div className={styles.meta}>
        <span>♩ = {doc.tempo}</span>
        <span>{derived.inst.name} · {derived.headerKeys}</span>
      </div>
      {layout.systems.map(s => {
        const under = p.readOnly ? null : p.renderUnderSystem?.(s.index);
        return (
          <Fragment key={s.index}>
            <SystemView doc={doc} show={show} derived={derived} system={s} beams={layout.beams} tuplets={layout.tuplets} ties={ties[s.index]} markDrop={drop}
              playingId={p.playingId} selectedId={p.readOnly ? null : p.selectedId ?? null} onSelect={p.onSelect} readOnly={p.readOnly} lastSystem={s.index === last}
              renderUnderChart={p.readOnly ? undefined : p.renderUnderChart} />
            {under != null && under !== false && <div className={styles.underSystem} data-under-system="" data-print-hide="">{under}</div>}
          </Fragment>
        );
      })}
      <footer className={styles.legend}>
        <span>{derived.legend}</span>
        <span>fingerscore.eu</span>
      </footer>
    </article>
  );
}
