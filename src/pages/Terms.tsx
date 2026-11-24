import { Link } from 'react-router-dom';
import Article from '../ui/Article';

const LAST_CHANGED = '2026-11-24';

export default function Terms() {
  return (
    <Article eyebrow="Legal" title="Terms of Use" documentTitle="Terms of Use – fingerscore" lastChanged={LAST_CHANGED}>
      <h2>What fingerscore is</h2>
      <p>fingerscore runs in your browser. A file you open is read on your device. It is not sent to us and we do not store it.</p>
      <h2>Your songs</h2>
      <p>Import only music that is in the public domain, that you wrote yourself, or that you have permission or a licence to copy and arrange. By importing a file you confirm that this is the case. A song in the public domain can still come in a protected edition or arrangement.</p>
      <h2>What you make</h2>
      <p>You are responsible for the sheets you make and for what you do with them: printing, sharing, publishing. Do not pass on sheets of protected music without permission.</p>
      <h2>Fingerings</h2>
      <p>The fingering charts come from published charts. They can contain errors. Check them against your instrument.</p>
      <h2>No warranty</h2>
      <p>fingerscore is free and comes as it is. We are liable without limit for intent, for gross negligence and for injury to life, body or health. Any other liability is excluded as far as the law allows.</p>
      <h2>Changes and law</h2>
      <p>We may change these terms; the date below shows the last change. German law applies. Contact: see the <Link to="/imprint">Imprint</Link>.</p>
    </Article>
  );
}
