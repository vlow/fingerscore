import { NavLink } from 'react-router-dom';
import { LogoMark } from './icons';

export default function Header() {
  return (
    <header className="site-header">
      <NavLink to="/" className="brand" end>
        <LogoMark size={28} />
        <span className="brand-name">fingerscore</span>
      </NavLink>
      <div className="header-spacer" />
      <nav aria-label="Main" className="main-nav">
        <NavLink to="/" end className="nav-link">
          Songs
        </NavLink>
      </nav>
    </header>
  );
}
