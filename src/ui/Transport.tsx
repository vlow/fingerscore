import s from './Transport.module.css';

interface Props {
  playing: boolean; tempo: number;
  onToggle(): void; onTempo(tempo: number): void;
}

export const TEMPO_MIN = 40;
export const TEMPO_MAX = 200;

/** Playback controls (SPEC §11): Play/Stop and the tempo slider. */
export default function Transport({ playing, tempo, onToggle, onTempo }: Props) {
  return (
    <div role="group" aria-label="Playback" className={s.transport}>
      <button type="button" className={s.play} onClick={onToggle}>
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
        )}
        {playing ? 'Stop' : 'Play'}
      </button>
      <label className={s.tempo}>
        ♩ = {tempo}
        <input type="range" className={s.slider} min={TEMPO_MIN} max={TEMPO_MAX} step={1} value={tempo}
          onChange={e => onTempo(Number(e.target.value))} />
      </label>
    </div>
  );
}
