import { readFileSync } from 'node:fs';

/** The checks that keep a baseline of known findings while the app is fixed (design 5.5). */
export type Kind = 'axe' | 'targets' | 'focus';

export interface AxeFinding { rule: string; target: string }
export type Found = AxeFinding | string;

interface Baseline {
  axe: Record<string, AxeFinding[]>;
  targets: Record<string, string[]>;
  focus: Record<string, string[]>;
}

export const BASELINE_FILE = new URL('./a11y-baseline.json', import.meta.url);

/** A finding as one comparable line. */
export function keyOf(found: Found): string {
  return typeof found === 'string' ? found : `${found.rule} @ ${found.target}`;
}

function recorded(kind: Kind, stateId: string): string[] {
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
  const entries: Found[] = baseline[kind][stateId] ?? [];
  return entries.map(keyOf);
}

/** Findings that the baseline does not list. */
export function beyondBaseline(kind: Kind, stateId: string, found: Found[]): string[] {
  const known = new Set(recorded(kind, stateId));
  return [...new Set(found.map(keyOf))].filter(key => !known.has(key));
}

/** Baseline entries that this run no longer finds: the fix landed, so the entry goes. */
export function staleBaseline(kind: Kind, stateId: string, found: Found[]): string[] {
  const now = new Set(found.map(keyOf));
  return recorded(kind, stateId).filter(key => !now.has(key));
}
