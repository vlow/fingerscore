import { usePaper, useTheme, type PaperTheme } from '../shell/theme';
import RadioMenu from '../shell/RadioMenu';
import { Segmented } from './Segmented';
import s from './PaperChoice.module.css';

const CHOICES: { value: PaperTheme; label: string }[] = [
  { value: 'night', label: 'Night' },
  { value: 'dimmed', label: 'Dimmed' },
  { value: 'sepia', label: 'Sepia' },
];

/**
 * The paper of the sheet in dark mode (dark mode design 4.3): Night, Dimmed or Sepia. Nothing in light mode, where the
 * paper is white. 'card' is the choice in the "Show on sheet" card, 'toolbar' the menu button of play mode.
 */
export default function PaperChoice({ variant, buttonClassName }: { variant: 'card' | 'toolbar'; buttonClassName?: string }) {
  const { effective } = useTheme();
  const { paper, setPaper } = usePaper();
  if (effective !== 'dark') return null;
  if (variant === 'card') {
    return (
      <div className={s.card}>
        <span className={s.heading} aria-hidden="true">Paper</span>
        <Segmented label="Paper" size="small" value={paper} onChange={setPaper}
          options={CHOICES.map(c => ({ value: c.value, content: c.label }))} />
      </div>
    );
  }
  const current = CHOICES.find(c => c.value === paper)!;
  return (
    <RadioMenu label="Paper" buttonName={`Paper: ${current.label}`} choices={CHOICES} value={paper} onChange={setPaper}
      placement="above" buttonClassName={buttonClassName}>
      Paper: {current.label}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </RadioMenu>
  );
}
