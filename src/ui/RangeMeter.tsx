import type { Derived } from '../domain/derive';
import { noteNameFlat } from '../domain/instruments';
import { spell } from '../domain/keys';
import s from './RangeMeter.module.css';

/** Range check card body (SPEC §6.4): instrument range bar with the song's range on top. */
export default function RangeMeter({ derived }: { derived: Derived }) {
  const { lo, hi, ext } = derived.inst;
  const low = lo - 7;
  const high = ext + 4;
  const pct = (m: number) => ((Math.max(low, Math.min(high, m)) - low) / (high - low)) * 100;
  const hasExt = ext > hi;
  const { notes, bad, ext: extCount } = derived.counts;
  const tone = bad > 0 ? s.songBad : extCount > 0 ? s.songExt : s.songOk;
  const songL = pct(derived.min - 0.4);
  const songW = Math.max(1.5, pct(derived.max + 0.4) - songL);
  const name = (m: number) => spell(m, derived.sig).name;
  const verdict = bad > 0 ? `${bad} unplayable` : extCount > 0 ? `${extCount} extended` : 'all playable';

  return (
    <>
      <div className={s.bar} aria-hidden="true">
        <div className={s.ok} style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />
        {hasExt && <div className={s.ext} style={{ left: `${pct(hi)}%`, width: `${pct(ext) - pct(hi)}%` }} />}
        {notes > 0 && <div className={`${s.song} ${tone}`} style={{ left: `${songL}%`, width: `${songW}%` }} />}
      </div>
      <div className={s.labels}>
        <span style={{ left: `${pct(lo)}%` }}>{noteNameFlat(lo)}</span>
        <span style={{ left: `${pct(hi)}%` }}>{noteNameFlat(hi)}</span>
        {hasExt && <span style={{ left: `${pct(ext)}%` }}>{noteNameFlat(ext)}</span>}
      </div>
      <div className={s.legend}>
        <span><span className={`${s.swatch} ${s.ok}`} aria-hidden="true" />Playable</span>
        {hasExt && <span><span className={`${s.swatch} ${s.ext}`} aria-hidden="true" />Extended (hard)</span>}
        <span><span className={`${s.swatch} ${s.songSwatch} ${tone}`} aria-hidden="true" />This song</span>
      </div>
      <div className={s.text}>
        <strong>{notes > 0 ? `This song: ${name(derived.min)} – ${name(derived.max)} · ${verdict}` : 'This song has no notes.'}</strong>
      </div>
    </>
  );
}
