import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { operator, type Operator } from '../content/operator';
import Article from '../ui/Article';
import styles from './Imprint.module.css';

const LAST_CHANGED = '2026-11-24';

export default function Imprint({ details = operator }: { details?: Operator }) {
  const rows: [string, string | string[]][] = [
    ['Provider', [details.name, ...details.address]],
    ['E-mail', details.email],
    ['Phone', details.phone],
  ];
  const optional: [string, string][] = [
    ['Represented by', details.representedBy],
    ['Register entry', details.register],
    ['VAT ID', details.vatId],
  ];
  for (const [label, value] of optional) if (value !== '') rows.push([label, value]);

  return (
    <Article eyebrow="Legal" title="Imprint" documentTitle="Imprint – fingerscore" lastChanged={LAST_CHANGED}>
      <section className={styles.card}>
        <h2>Information according to § 5 DDG</h2>
        <dl className={styles.rows}>
          {rows.map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{Array.isArray(value) ? value.map((line, i) => <div key={i}>{line}</div>) : value}</dd>
            </Fragment>
          ))}
        </dl>
      </section>
      <h2>Responsible for content (§ 18 (2) MStV)</h2>
      <p>{details.responsibleForContent}</p>
      <h2>Consumer dispute resolution</h2>
      <p>The provider does not take part in dispute resolution before a consumer arbitration board.</p>
      <h2>Liability for links</h2>
      <p>Linked sites are the responsibility of their operators. They were checked when the links were added.</p>
      <p>How fingerscore handles data is described in the <Link to="/privacy">Privacy</Link> notice.</p>
    </Article>
  );
}
