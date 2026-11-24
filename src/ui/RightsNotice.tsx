import { useId } from 'react';
import { Link } from 'react-router-dom';
import s from './RightsNotice.module.css';

interface Props {
  className?: string;
  /** Runs when the link is clicked. */
  onNavigate?(): void;
  /** The notice sits inside a menu: the link is a menu item and the wrapper has no role of its own. */
  inMenu?: boolean;
}

/** The line shown wherever a file comes in (design 5.3). */
export default function RightsNotice({ className, onNavigate, inMenu }: Props) {
  const sentenceId = useId();
  return (
    <p className={`${s.notice} ${className ?? ''}`} {...(inMenu ? { role: 'none' } : {})}>
      <span id={sentenceId}>Only import songs you have the rights to.</span>{' '}
      <Link to="/terms" onClick={onNavigate} aria-describedby={sentenceId} {...(inMenu ? { role: 'menuitem', tabIndex: -1 } : {})}>Terms of Use</Link>
    </p>
  );
}
