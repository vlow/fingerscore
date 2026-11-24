import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The exclusions of the accessibility scan: each one has a reason, and the list does not grow unnoticed. */
const EXCLUSION_COUNT = 0;
const FIELDS = ['state', 'rule', 'target', 'reason'];

/** Finds `export const EXCLUSIONS … = [...]` in the source and returns its entries and the fields each one lacks. */
export function parseExclusions(source: string): { found: boolean; entries: { missing: string[] }[] } {
  // From `= [` to the first `];`, on one line or many.
  const declaration = /export const EXCLUSIONS[^=\n]*=\s*(\[[\s\S]*?\]);/.exec(source)?.[1];
  if (declaration === undefined) return { found: false, entries: [] };
  const entries = [...declaration.matchAll(/\{([^{}]*)\}/g)].map(m => ({
    missing: FIELDS.filter(name => !new RegExp(`(?:^|[\\s{,])${name}:\\s*'(?:[^'\\\\]|\\\\.)+'`).test(m[1]!)),
  }));
  return { found: true, entries };
}

describe('parseExclusions', () => {
  it('reads an empty one-line list', () => {
    expect(parseExclusions("export const EXCLUSIONS: X[] = [];\n")).toEqual({ found: true, entries: [] });
  });

  it('reads a one-line list with one entry', () => {
    const src = "export const EXCLUSIONS: X[] = [{ state: 's', rule: 'r', target: 't', reason: 'because' }];\nconst more = [1];\n";
    expect(parseExclusions(src)).toEqual({ found: true, entries: [{ missing: [] }] });
    expect(parseExclusions(src.replace(", reason: 'because'", '')).entries).toEqual([{ missing: ['reason'] }]);
  });

  it('reads a multi-line list and reports the entry without a reason', () => {
    const src = [
      'export const EXCLUSIONS: X[] = [',
      "  { state: 'a', rule: 'r', target: 't', reason: 'why' },",
      '  {',
      "    state: 'b',",
      "    rule: 'r',",
      "    target: 't',",
      '  },',
      '];',
    ].join('\n');
    expect(parseExclusions(src)).toEqual({ found: true, entries: [{ missing: [] }, { missing: ['reason'] }] });
  });
});

describe('accessibility scan exclusions', () => {
  const { found, entries } = parseExclusions(readFileSync(join(process.cwd(), 'e2e/accessibility.spec.ts'), 'utf8'));

  it('finds the declaration in the spec', () => {
    expect(found, 'export const EXCLUSIONS = [...] not found in e2e/accessibility.spec.ts').toBe(true);
  });

  it('has exactly the listed number of entries', () => {
    expect(entries).toHaveLength(EXCLUSION_COUNT);
  });

  it('gives every entry a state, a rule, a target and a reason', () => {
    expect(entries.map(e => e.missing)).toEqual(entries.map(() => []));
  });
});
