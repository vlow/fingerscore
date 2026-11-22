import type { RawNote } from '../import/types';
import s from './PianoRoll.module.css';

interface Props {
  notes: RawNote[];
  /** Song length in quarter notes; the horizontal axis. */
  length: number;
  /** Pitch window shown, inclusive (MIDI). Shared by all rows so they line up. */
  low: number; high: number;
  /** Sounding range of the instrument, drawn as a band. */
  band: { lo: number; hi: number };
  label: string;
  tone: 'accent' | 'muted' | 'ghost';
}

const W = 1000;
const H = 64;
const NOTE_H = 3;

/** Mini piano roll: one bar per note, instrument range as a shaded band. */
export default function PianoRoll({ notes, length, low, high, band, label, tone }: Props) {
  const span = Math.max(1, high - low + 1);
  const y = (midi: number) => ((high - midi) / span) * H;     // top edge of a pitch row
  const x = (q: number) => (q / Math.max(length, 1)) * W;
  const bandTop = Math.max(0, y(band.hi));
  const bandBottom = Math.min(H, y(band.lo) + H / span);
  return (
    <svg className={s.roll} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {bandBottom > bandTop && <rect className={s.band} x={0} y={bandTop} width={W} height={bandBottom - bandTop} />}
      {notes.map((n, k) => (
        <rect
          key={k} className={s[tone]}
          x={x(n.start)} y={y(n.midi) + (H / span - NOTE_H) / 2}
          width={Math.max(2, x(n.dur) - 1)} height={NOTE_H} rx={1.5}
        />
      ))}
    </svg>
  );
}
