import type { ReactNode } from 'react';
import s from '../SheetPage.module.css';

/** A card in the sheet page's side column. */
export default function Card(p: { heading: ReactNode; badge?: ReactNode; children: ReactNode; labelledBy?: string }) {
  return (
    <section className={s.card} aria-labelledby={p.labelledBy}>
      <div className={s.cardHead}>{p.heading}{p.badge}</div>
      {p.children}
    </section>
  );
}
