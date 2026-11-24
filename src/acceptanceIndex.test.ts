import { readFileSync } from 'node:fs';

const FILE = 'e2e/acceptance.spec.ts';
const WANTED = [
  ...Array.from({ length: 12 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `V${String(i + 1).padStart(2, '0')}`),
];
/** Numbers whose check fails on the real app and is kept as `test.fixme`. Each one is written down in the task report. */
const OPEN_DEFECTS: string[] = [];

/** The title of every `test(` call at the start of a line: the first string literal after the parenthesis. */
function titles(source: string): string[] {
  return Array.from(source.matchAll(/^\s*test(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gm), m => m[2]);
}

/** Lines that switch a test off or narrow the run to some tests: skip and only (also on describe), fixme outside OPEN_DEFECTS. */
function switchedOff(source: string, open: string[]): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/^\s*test(?:\.describe)?\.(skip|only|fixme)\(\s*(?:(['"`])((?:\\.|(?!\2).)*)\2)?/gm)) {
    const number = /^([AV]\d{2}) /.exec(m[3] ?? '')?.[1];
    if (m[1] === 'fixme' && number !== undefined && open.includes(number)) continue;
    found.push(m[0].trim());
  }
  return found;
}

describe('acceptance suite numbering', () => {
  const source = readFileSync(FILE, 'utf8');
  const found = titles(source);

  it('has one test for each of A01–A12 and V01–V10, and no other test', () => {
    expect(found.map(t => /^([AV]\d{2}) /.exec(t)?.[1] ?? `unnumbered: ${t}`).sort()).toEqual([...WANTED].sort());
  });

  it('starts every title with its number and a space', () => {
    for (const number of WANTED) expect(found.filter(t => t.startsWith(`${number} `)), number).toHaveLength(1);
  });

  it('has no test.skip, test.only or test.fixme outside OPEN_DEFECTS', () => {
    expect(switchedOff(source, OPEN_DEFECTS)).toEqual([]);
  });

  it('reads titles from test( calls, also from test.fixme(', () => {
    expect(titles("test('A01 one', async () => {});\n  test.fixme(\"V02 two\", () => {});\n// test('A03 no')")).toEqual(['A01 one', 'V02 two']);
  });

  it('finds skip, only and describe variants, and lets fixme through only for a listed number', () => {
    expect(switchedOff("test.skip('A01 x', f);\ntest.only('A02 x', f);\ntest.describe.skip('d', f);\ntest.describe.only('d', f);", [])).toHaveLength(4);
    expect(switchedOff("test.fixme('A03 x', f);", [])).toHaveLength(1);
    expect(switchedOff("test.fixme('A03 x', f);", ['A03'])).toEqual([]);
    expect(switchedOff("test.fixme('A04 x', f);", ['A03'])).toHaveLength(1);
    expect(switchedOff("test.skip('A03 x', f);", ['A03'])).toHaveLength(1);
    expect(switchedOff("test('A01 x', f);\n// test.skip('A02')", [])).toEqual([]);
  });
});
