import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The exclusions of the accessibility scan: each one has a reason, and the list does not grow unnoticed. */
const EXCLUSION_COUNT = 1;

const source = readFileSync(join(process.cwd(), 'e2e/accessibility.spec.ts'), 'utf8');
const list = /export const EXCLUSIONS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(source)?.[1] ?? '';
const entries = list.split(/\n  \{\n/).slice(1);
const field = (entry: string, name: string) => new RegExp(`(?:^|\\n)    ${name}: '((?:[^'\\\\]|\\\\.)+)',`).exec(entry)?.[1];

describe('accessibility scan exclusions', () => {
  it('has exactly the listed number of entries', () => {
    expect(entries).toHaveLength(EXCLUSION_COUNT);
  });

  it('gives every entry a state, a rule, a target and a reason', () => {
    for (const entry of entries) {
      for (const name of ['state', 'rule', 'target', 'reason']) expect(field(entry, name), name).toBeTruthy();
    }
  });
});
