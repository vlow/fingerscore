import { useTheme, type Theme } from '../state/theme';
import RadioMenu, { type RadioMenuChoice } from './RadioMenu';
import s from './ThemeMenu.module.css';

const MONITOR = ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'];
const SUN = ['M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'];
const MOON = ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'];

const Icon = ({ d }: { d: string[] }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map(p => <path key={p} d={p} />)}
  </svg>
);

const CHOICES: RadioMenuChoice<Theme>[] = [
  { value: 'system', label: 'System', icon: <Icon d={MONITOR} /> },
  { value: 'light', label: 'Light', icon: <Icon d={SUN} /> },
  { value: 'dark', label: 'Dark', icon: <Icon d={MOON} /> },
];

/** The theme switch of the header (dark mode design 4.2): System follows the device, Light and Dark override it. */
export default function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const current = CHOICES.find(c => c.value === theme)!;
  return (
    <RadioMenu label="Theme" buttonName={`Theme: ${current.label}`} choices={CHOICES} value={theme} onChange={setTheme}>
      {current.icon}
      <span className={s.label}>{current.label}</span>
    </RadioMenu>
  );
}
