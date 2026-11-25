import { barLabelOf } from '../../domain/bars';
import { JUMP_TEXT, type BarMark } from '../../domain/jumps';
import type { Bar, Doc } from '../../domain/types';

const KINDS: { key: BarMark | 'jump'; text(bar: Bar): string }[] = [
  { key: 'segno', text: () => 'Segno' },
  { key: 'coda', text: () => 'Coda' },
  { key: 'fine', text: () => 'Fine' },
  { key: 'toCoda', text: () => 'To Coda' },
  { key: 'jump', text: b => JUMP_TEXT[b.jump!] },
];

/**
 * What the live region says after an edit that changed a mark: "Bar 16: D.S. al Coda", "Bar 6: To Coda removed",
 * "Bar 4: Fine moved from bar 2". Null when no mark changed, or the number of bars did (adding or removing a bar).
 */
export function barAnnouncement(before: Doc, after: Doc): string | null {
  if (before.score.length !== after.score.length) return null;
  const label = (k: number) => barLabelOf(after, k);
  for (const { key, text } of KINDS) {
    const was = before.score.findIndex(b => b[key] !== undefined);
    const now = after.score.findIndex(b => b[key] !== undefined);
    if (was === now && (now < 0 || before.score[was][key] === after.score[now][key])) continue;
    if (now < 0) return `Bar ${label(was)}: ${text(before.score[was])} removed`;
    const said = `Bar ${label(now)}: ${text(after.score[now])}`;
    return was >= 0 && was !== now ? `${said} moved from bar ${label(was)}` : said;
  }
  return null;
}
