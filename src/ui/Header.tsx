import { Link, useLocation } from 'react-router-dom';
import { LogoMark, Wordmark } from './icons';

/** Routes that belong to the "Songs" section. */
const SONG_PATHS = ['/', '/tracks', '/sheet'];

export default function Header() {
  const { pathname } = useLocation();
  const inSongs = SONG_PATHS.includes(pathname);
  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <LogoMark size={30} />
        <Wordmark className="brand-name" />
      </Link>
      <div className="header-spacer" />
      <nav aria-label="Main" className="main-nav">
        <Link to="/" className="nav-link" aria-current={inSongs ? 'page' : undefined}>
          Songs
        </Link>
        <Link to="/scales" className="nav-link" aria-current={pathname === '/scales' ? 'page' : undefined}>
          Scales
        </Link>
      </nav>
    </header>
  );
}
