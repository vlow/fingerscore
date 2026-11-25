import type { JumpProblem } from '../domain/jumps';
import s from './JumpNotice.module.css';

const IGNORED = 'Playback ignores the jump.';

interface Props { problems: JumpProblem[]; dropped: string[] }

/**
 * Marks that do not add up (design 5.3) and marks an import left out: one amber notice above the sheet. The status
 * region stays in the page and its content comes and goes, so a screen reader announces the new text. It is polite,
 * not an alert: it must not interrupt while the player edits. Each problem text ends with the closing sentence; it
 * is said once, after the last line. Empty, the region takes no space (see the stylesheet).
 */
export default function JumpNotice({ problems, dropped }: Props) {
  return (
    <div role="status" aria-label="Jump marks" className={s.notice} data-print-hide="">
      {problems.map((p, k) => <p key={`p${k}`} className={s.line}>{p.text.endsWith(IGNORED) ? p.text.slice(0, -IGNORED.length).trimEnd() : p.text}</p>)}
      {dropped.map((t, k) => <p key={`d${k}`} className={s.line}>{t}</p>)}
      {problems.length > 0 && <p className={s.line}>{IGNORED}</p>}
    </div>
  );
}
