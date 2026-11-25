import type { Ref } from 'react';
import s from './Transport.module.css';

interface Props {
  playing: boolean; tempo: number;
  /** An event is selected on the sheet: Listen starts there. */
  fromSelected?: boolean;
  onToggle(): void; onTempo(tempo: number): void;
  /** Opens play mode (SPEC §11a); the ref is where the focus returns on the way out. */
  onPlayMode(): void; playModeRef?: Ref<HTMLButtonElement>;
}

export const TEMPO_MIN = 40;
export const TEMPO_MAX = 200;

/** Play mode (SPEC §11a) and the playback controls (SPEC §11): Listen (or Listen from selected)/Stop and the tempo slider. */
export default function Transport({ playing, fromSelected = false, tempo, onToggle, onTempo, onPlayMode, playModeRef }: Props) {
  return (
    <div role="group" aria-label="Playback" className={s.transport}>
      <button ref={playModeRef} type="button" className={s.playMode} title="Show only the score, with page turning and auto-scroll. Dark mode is easier on the eyes on stage." onClick={onPlayMode}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 4h16v11H4z" /><path d="M12 15v5" /><path d="M8 20h8" />
        </svg>
        Play mode
      </button>
      <button type="button" className={s.play} onClick={onToggle}>
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
        )}
        {playing ? 'Stop' : fromSelected ? 'Listen from selected' : 'Listen'}
      </button>
      <label className={s.tempo}>
        ♩ = {tempo}
        <input type="range" className={s.slider} min={TEMPO_MIN} max={TEMPO_MAX} step={1} value={tempo}
          onChange={e => onTempo(Number(e.target.value))} />
      </label>
    </div>
  );
}
