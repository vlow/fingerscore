import { FAMILIES, type Family } from './instruments';

export type SortBy = 'recent' | 'title' | 'instrument';
export const SORTS: { id: SortBy; label: string }[] = [
  { id: 'recent', label: 'Recently saved' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'instrument', label: 'Instrument' },
];

/** What the library view needs to know about a saved sheet. */
export interface Listed { title: string; inst: string; fam: Family; savedAt: string }
export interface ViewOptions { query: string; fam: Family | null; sort: SortBy }

/** The families that have sheets, in the usual family order, each with its number of sheets. */
export function familyCounts(entries: readonly Listed[]): { fam: Family; count: number }[] {
  return FAMILIES
    .map(fam => ({ fam, count: entries.filter(e => e.fam === fam).length }))
    .filter(c => c.count > 0);
}

const byText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
const newestFirst = (a: Listed, b: Listed) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0);

/**
 * The sheets the library view lists. The search looks in titles and instrument names, ignoring case; the filter keeps
 * one instrument family. Equal titles keep the newest first; sheets for the same instrument are ordered by title.
 */
export function viewEntries<T extends Listed>(entries: readonly T[], { query, fam, sort }: ViewOptions): T[] {
  const q = query.trim().toLowerCase();
  const kept = entries.filter(e =>
    (fam === null || e.fam === fam) && (q === '' || e.title.toLowerCase().includes(q) || e.inst.toLowerCase().includes(q)));
  if (sort === 'title') return kept.sort((a, b) => byText(a.title, b.title) || newestFirst(a, b));
  if (sort === 'instrument') return kept.sort((a, b) => byText(a.inst, b.inst) || byText(a.title, b.title) || newestFirst(a, b));
  return kept.sort(newestFirst);
}
