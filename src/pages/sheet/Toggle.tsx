import s from '../SheetPage.module.css';

/** A segmented control in a side card: chart style, recorder fingering system. */
export default function Toggle<T extends string>(p: { label: string; options: { value: T; name: string; sub?: string }[]; value: T; onPick(v: T): void }) {
  return (
    <div role="group" aria-label={p.label} className={s.segment}>
      {p.options.map(o => (
        <button key={o.value} type="button" className={s.segButton} aria-pressed={p.value === o.value}
          aria-describedby={o.sub ? `seg-${o.value}` : undefined} onClick={() => p.onPick(o.value)}>
          {o.name}
          {o.sub && <span id={`seg-${o.value}`} className={s.segSub} aria-hidden="true">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}
