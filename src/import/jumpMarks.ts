import type { Jump } from '../domain/types';
import type { ParsedMark } from './types';

type Sign = 'segno' | 'coda' | 'fine' | 'toCoda';
type Kind = Sign | 'jump';
type Family = 'dc' | 'ds';

const NAME: Record<Kind, string> = { segno: 'Segno', coda: 'Coda', fine: 'Fine', toCoda: 'To Coda', jump: 'jump' };
const FORMS: Record<Family, { plain: Jump; fine: Jump; coda: Jump }> = {
  dc: { plain: 'dc', fine: 'dcFine', coda: 'dcCoda' },
  ds: { plain: 'ds', fine: 'dsFine', coda: 'dsCoda' },
};

interface Found { bar: number; kind: Kind; jump?: Jump; family?: Family; order: number }

/** The printed number of a bar index: bars count from 1 at the first full bar, a pickup bar is bar 0. */
export const printedBar = (bar: number, pickup: number): number => bar + (pickup > 0 ? 0 : 1);

/**
 * Collects the jump marks an importer finds, by bar index, and settles them: the first Segno, Coda, Fine, To Coda and
 * jump in bar order stay, a later one of a kind is left out, and so is a form outside the six. Each leaves one sentence.
 * The same mark found twice on one bar (the sound and the sign of a MusicXML direction, two parts) counts once.
 */
export function jumpCollector() {
  const found: Found[] = [];
  const unsupported: { bar: number; text: string; order: number }[] = [];
  let order = 0;
  const add = (f: Omit<Found, 'order'>) => { found.push({ ...f, order: order++ }); };
  return {
    segno: (bar: number) => add({ bar, kind: 'segno' }),
    coda: (bar: number) => add({ bar, kind: 'coda' }),
    fine: (bar: number) => add({ bar, kind: 'fine' }),
    toCoda: (bar: number) => add({ bar, kind: 'toCoda' }),
    jump: (bar: number, jump: Jump) => add({ bar, kind: 'jump', jump }),
    /** A jump the file does not say "al Fine" or "al Coda" for: the Fine or To Coda of the file decides. */
    jumpByFile: (bar: number, family: Family) => add({ bar, kind: 'jump', family }),
    /** A mark outside what fingerscore plays; `text` is how the file names it. */
    unsupported: (bar: number, text: string) => { unsupported.push({ bar, text, order: order++ }); },
    result(pickup: number): { marks: ParsedMark[]; dropped: string[] } {
      const hasFine = found.some(f => f.kind === 'fine');
      const hasToCoda = found.some(f => f.kind === 'toCoda');
      const settled = found.map(f => {
        if (!f.family) return f;
        // both or neither: the plain form, because the file does not say which one it means
        const form = FORMS[f.family];
        return { ...f, jump: hasFine === hasToCoda ? form.plain : hasFine ? form.fine : form.coda };
      }).sort((a, b) => a.bar - b.bar || a.order - b.order);
      const kept = new Map<Kind, Found>();
      const lines: { bar: number; order: number; text: string }[] = [];
      const label = (bar: number) => `bar ${printedBar(bar, pickup)}`;
      for (const f of settled) {
        const first = kept.get(f.kind);
        if (f.bar < 0) lines.push({ bar: f.bar, order: f.order, text: `${NAME[f.kind][0].toUpperCase()}${NAME[f.kind].slice(1)} before the first bar was left out.` });
        else if (!first) kept.set(f.kind, f);
        else if (first.bar !== f.bar || first.jump !== f.jump) lines.push({ bar: f.bar, order: f.order, text: `A second ${NAME[f.kind]} in ${label(f.bar)} was left out.` });
      }
      for (const u of unsupported) lines.push({ bar: u.bar, order: u.order, text: `${u.text} in ${label(u.bar)} is not supported and was left out.` });
      const marks = new Map<number, ParsedMark>();
      for (const f of kept.values()) {
        const m = marks.get(f.bar) ?? { bar: f.bar };
        marks.set(f.bar, m);
        if (f.kind === 'jump') m.jump = f.jump; else m[f.kind] = true;
      }
      return {
        marks: Array.from(marks.values()).sort((a, b) => a.bar - b.bar),
        dropped: lines.sort((a, b) => a.bar - b.bar || a.order - b.order).map(l => l.text),
      };
    },
  };
}

/** The marks of `base` with the jump marks of `extra` added on the same bars; sorted by bar. */
export function mergeMarks(base: ParsedMark[], extra: ParsedMark[]): ParsedMark[] {
  const byBar = new Map<number, ParsedMark>();
  for (const m of [...base, ...extra]) byBar.set(m.bar, { ...byBar.get(m.bar), ...m });
  return Array.from(byBar.values()).sort((a, b) => a.bar - b.bar);
}
