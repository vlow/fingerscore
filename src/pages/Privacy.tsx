import { Link } from 'react-router-dom';
import { operator, type Operator } from '../content/operator';
import { STORAGE_ITEMS } from '../content/storageItems';
import Article from '../ui/Article';

const LAST_CHANGED = '2026-11-24';

function Items({ where }: { where: 'local' | 'session' }) {
  return (
    <ul data-storage={where}>
      {STORAGE_ITEMS.filter(i => i.where === where).map(i => <li key={i.key}>{i.label}</li>)}
    </ul>
  );
}

export default function Privacy({ details = operator }: { details?: Operator }) {
  return (
    <Article eyebrow="Legal" title="Privacy" documentTitle="Privacy – fingerscore" lastChanged={LAST_CHANGED}>
      <h2>Who is responsible</h2>
      <p>The provider named in the <Link to="/imprint">Imprint</Link> is responsible for data processing on this site.</p>
      <h2>Hosting and server logs</h2>
      <p>
        {details.hostName}, {details.hostAddress}, hosts fingerscore. The host records the IP address, the time, the requested address
        and the browser identification of each request. It does this to keep the server secure. The legal basis is Art. 6 (1) (f) GDPR.
        The host keeps these logs for {details.logRetention}.
      </p>
      <h2>Cookies, tracking and third parties</h2>
      <p>fingerscore sets no cookies.</p>
      <p>fingerscore does not track you.</p>
      <p>fingerscore loads nothing from other sites. The app serves its own fonts.</p>
      <h2>Browser storage</h2>
      <p>
        The browser keeps data in two places. Both are on your device only. The app needs this data to work (§ 25 (2) TDDDG).
      </p>
      <p>Local storage holds:</p>
      <Items where="local" />
      <p>Session storage holds the following until you close the tab:</p>
      <Items where="session" />
      <p>
        Delete a sheet in "Your sheets". To remove everything else, clear the site data for this site in your browser.
      </p>
      <h2>Files</h2>
      <p>A song file is read in your browser and is never uploaded.</p>
      <h2>Your rights</h2>
      <p>
        You have the right to access, correction, deletion, restriction and objection. You may also lodge a complaint with a
        supervisory authority.
      </p>
    </Article>
  );
}
