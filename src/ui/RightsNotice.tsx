import { useId } from 'react';
import { Link } from 'react-router-dom';
import s from './RightsNotice.module.css';

interface Props {
  className?: string;
  /** Runs when the link is clicked. */
  onNavigate?(): void;
}

/** The line shown wherever a file comes in (design 5.3). */
export default function RightsNotice({ className, onNavigate }: Props) {
  const sentenceId = useId();
  return (
    <p className={`${s.notice} ${className ?? ''}`}>
      <span id={sentenceId}>Only import songs you have the rights to.</span>{' '}
      <Link to="/terms" onClick={onNavigate} aria-describedby={sentenceId}>Terms of Use</Link>
    </p>
  );
}
