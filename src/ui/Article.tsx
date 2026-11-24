import { useEffect, type ReactNode } from 'react';
import { formatDate } from '../content/operator';
import styles from './Article.module.css';

interface Props {
  eyebrow: string;
  title: string;
  documentTitle: string;
  lastChanged?: string;
  children: ReactNode;
}

/** The single-column layout of the text pages. Sets the document title while mounted. */
export default function Article({ eyebrow, title, documentTitle, lastChanged, children }: Props) {
  useEffect(() => {
    document.title = documentTitle;
    return () => { document.title = 'fingerscore'; };
  }, [documentTitle]);

  return (
    <article className={styles.article}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      {children}
      {lastChanged && <p className={styles.changed}>Last changed: {formatDate(lastChanged)}</p>}
    </article>
  );
}
