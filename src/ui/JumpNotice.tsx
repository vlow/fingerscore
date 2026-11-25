import type { JumpProblem } from '../domain/jumps';
import s from './JumpNotice.module.css';

const IGNORED = 'Playback ignores the jump.';

interface Props { problems: JumpProblem[]; dropped: string[] }

/**
 * Marks that do not add up (design 5.3) and marks an import left out: one amber notice above the sheet. A polite status,
 * not an alert: it must not interrupt while the player edits. Each problem text ends with the closing sentence; it
 * is said once, after the last line.
 */
export default function JumpNotice({ problems, dropped }: Props) {
  if (problems.length === 0 && dropped.length === 0) return null;
  return (
    <div role="status" aria-label="Jump marks" className={s.notice} data-print-hide="">
      {problems.map(p => <p key={p.text} className={s.line}>{p.text.endsWith(IGNORED) ? p.text.slice(0, -IGNORED.length).trimEnd() : p.text}</p>)}
      {dropped.map(t => <p key={t} className={s.line}>{t}</p>)}
      {problems.length > 0 && <p className={s.line}>{IGNORED}</p>}
    </div>
  );
}
