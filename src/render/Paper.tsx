import { useMemo } from 'react';
import type { Derived } from '../domain/derive';
import type { Doc } from '../domain/types';
import type { SheetLayout } from './layout';
import styles from './Paper.module.css';
import { SystemView, tieSegments, type UnderChart } from './SystemView';

export interface PaperProps {
  doc: Doc; derived: Derived; layout: SheetLayout;
  playingId: string | null;
  onTitle(title: string): void; onSubtitle(subtitle: string): void;
  renderUnderChart?: UnderChart;   // slot for the alt-fingering pill (Task 20)
}

/** The printed sheet: editable heading, tempo and key line, systems, legend. */
export function Paper(p: PaperProps): JSX.Element {
  const { doc, derived, layout } = p;
  const ties = useMemo(() => tieSegments(derived, layout), [derived, layout]);
  const last = layout.systems.length - 1;
  return (
    <article className={`paper ${styles.paper}`} data-testid="paper">
      <header className={styles.heading}>
        <h1 className={styles.h1}>
          <input className={`${styles.ttl} ${styles.title}`} type="text" aria-label="Sheet title" value={doc.title}
            placeholder="Add a title" onChange={e => p.onTitle(e.target.value)} />
        </h1>
        <input className={`${styles.ttl} ${styles.subtitle}`} type="text" aria-label="Sheet subtitle" value={doc.subtitle}
          placeholder="Add a subtitle (composer, arranger…)" onChange={e => p.onSubtitle(e.target.value)} />
      </header>
      <div className={styles.meta}>
        <span>♩ = {doc.tempo}</span>
        <span>{derived.inst.name} · {derived.headerKeys}</span>
      </div>
      {layout.systems.map(s => (
        <SystemView key={s.index} doc={doc} derived={derived} system={s} beams={layout.beams} ties={ties[s.index]}
          playingId={p.playingId} lastSystem={s.index === last} renderUnderChart={p.renderUnderChart} />
      ))}
      <footer className={styles.legend}>
        <span>{derived.legend}</span>
        <span>fingerscore.eu</span>
      </footer>
    </article>
  );
}
