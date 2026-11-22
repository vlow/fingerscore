import { Link } from 'react-router-dom';
import s from './Steps.module.css';

interface Props { current: 'track' | 'sheet' }

function Done({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className={s.done}>
      <span className={s.doneMark} aria-hidden="true">✓</span>
      {label}
    </Link>
  );
}

function Current({ n, label }: { n: number; label: string }) {
  return (
    <span aria-current="step" className={s.current}>
      <span className={s.currentMark} aria-hidden="true">{n}</span>
      {label}
    </span>
  );
}

const Dash = () => <span className={s.dash} aria-hidden="true">—</span>;

/** Step indicator File ✓ — Track — Sheet. Finished steps link back. */
export default function Steps({ current }: Props) {
  return (
    <nav aria-label="Steps" className={s.steps}>
      <Done to="/" label="File" />
      <Dash />
      {current === 'track' ? <Current n={2} label="Track" /> : <Done to="/tracks" label="Track" />}
      <Dash />
      {current === 'sheet' ? (
        <Current n={3} label="Sheet" />
      ) : (
        <span className={s.todo}><span className={s.todoMark} aria-hidden="true">3</span>Sheet</span>
      )}
    </nav>
  );
}
