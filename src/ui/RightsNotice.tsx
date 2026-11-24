import { Link } from 'react-router-dom';
import s from './RightsNotice.module.css';

interface Props {
  className?: string;
  /** Runs when the link is clicked. */
  onNavigate?(): void;
}

/** The line shown wherever a file comes in (design 5.3). */
export default function RightsNotice({ className, onNavigate }: Props) {
  return (
    <p className={`${s.notice} ${className ?? ''}`}>
      Only import songs you have the rights to. <Link to="/terms" onClick={onNavigate}>Terms of Use</Link>
    </p>
  );
}
