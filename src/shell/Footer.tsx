import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { repositoryUrl as ownerRepositoryUrl } from '../content/repository';
import { LogoMark, Wordmark } from './icons';

const LINKS = [['/about', 'About'], ['/terms', 'Terms'], ['/privacy', 'Privacy'], ['/imprint', 'Imprint']];

export default function Footer({ repositoryUrl = ownerRepositoryUrl }: { repositoryUrl?: string }) {
  return (
    <footer className="site-footer">
      <div className="footer-row">
        <div className="footer-brand">
          <LogoMark size={22} />
          <Wordmark className="footer-brand-name" />
          <span>© 2026</span>
        </div>
        <span>Your sheets are stored in your browser, not on a server.</span>
        <nav aria-label="Site" className="footer-links">
          {LINKS.map(([to, label]) => (
            <Fragment key={to}>
              {to === '/terms' && repositoryUrl && (
                <a href={repositoryUrl}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></svg>
                  GitHub
                </a>
              )}
              <Link to={to}>{label}</Link>
            </Fragment>
          ))}
        </nav>
      </div>
    </footer>
  );
}
