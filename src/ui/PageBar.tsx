import type { ReactNode } from 'react';
import s from './PageBar.module.css';

interface Props { left: ReactNode; right?: ReactNode }

/** Light grey bar directly below the header (SPEC §2.2). */
export default function PageBar({ left, right }: Props) {
  return (
    <div className={s.bar}>
      {left}
      <div className={s.spacer} />
      {right}
    </div>
  );
}
