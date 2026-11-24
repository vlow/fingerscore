import { Link } from 'react-router-dom';
import { isPlaceholder, operator, type Operator } from '../content/operator';
import Article from '../ui/Article';
import styles from './About.module.css';

/** First letters of the first and last word of a real name; empty for a placeholder. */
function initials(name: string): string {
  if (isPlaceholder(name)) return '';
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const last = words.length > 1 ? words[words.length - 1] : '';
  return (words[0][0] + (last ? last[0] : '')).toUpperCase();
}

export default function About({ details = operator }: { details?: Operator }) {
  const mark = initials(details.name);
  return (
    <Article eyebrow="About" title="Why I made fingerscore" documentTitle="About – fingerscore">
      <p className={styles.lead}>{details.aboutLead}</p>
      <div className={styles.author}>
        {mark && <span className={styles.avatar} data-avatar aria-hidden="true">{mark}</span>}
        <div>
          <p className={styles.name}>{details.name}</p>
          <p className={styles.bio}>{details.authorBio}</p>
        </div>
      </div>
      <h2>The story</h2>
      {details.story.map((p, i) => <p key={i}>{p}</p>)}
      {details.pullQuote !== '' && <blockquote className={styles.quote}>{details.pullQuote}</blockquote>}
      <h2>Under the hood</h2>
      <p>fingerscore runs in your browser. A song file never leaves your device. The page loads no code or fonts from other sites.</p>
      <p>
        It uses React and React Router for the pages, zustand for state, abcjs to read ABC files, @tonejs/midi and midi-file to read
        MIDI files, JSZip for archives, and jsPDF with svg2pdf.js for PDF export.
        {details.repositoryUrl !== '' && <> The source is on <a href={details.repositoryUrl}>GitHub</a>.</>}
      </p>
      <h2>Thanks & credits</h2>
      <p>
        The fingerings come from published charts: The Woodwind Fingering Guide by Timothy Reichard, Sax Teacher UK, Tomplay,
        Dolmetsch Online, Yamaha and others. The README lists them all.
      </p>
      <p>The music symbols are drawn from the outlines of Bravura, a font by Steinberg. The interface uses Atkinson Hyperlegible.</p>
      <p>
        The licences of the libraries and fonts are in the{' '}
        <a href={import.meta.env.BASE_URL + 'third-party-notices.txt'}>third-party notices</a>.
      </p>
      <p>Contact: see the <Link to="/imprint">Imprint</Link>.</p>
    </Article>
  );
}
