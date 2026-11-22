import { LogoMark } from './icons';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-row">
        <div className="footer-brand">
          <LogoMark size={22} />
          <span className="footer-brand-name">fingerscore</span>
          <span>© 2026</span>
        </div>
        <span>Your sheets are stored in your browser. Nothing is stored on the server.</span>
      </div>
    </footer>
  );
}
