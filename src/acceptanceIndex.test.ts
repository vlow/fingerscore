import { readFileSync } from 'node:fs';

const FILE = 'e2e/acceptance.spec.ts';
const WANTED = [
  ...Array.from({ length: 12 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `V${String(i + 1).padStart(2, '0')}`),
];

/** The title of every `test(` call at the start of a line: the first string literal after the parenthesis. */
function titles(source: string): string[] {
  return Array.from(source.matchAll(/^\s*test(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gm), m => m[2]);
}

describe('acceptance suite numbering', () => {
  const found = titles(readFileSync(FILE, 'utf8'));

  it('has one test for each of A01–A12 and V01–V10, and no other test', () => {
    expect(found.map(t => /^([AV]\d{2}) /.exec(t)?.[1] ?? `unnumbered: ${t}`).sort()).toEqual([...WANTED].sort());
  });

  it('starts every title with its number and a space', () => {
    for (const number of WANTED) expect(found.filter(t => t.startsWith(`${number} `)), number).toHaveLength(1);
  });

  it('reads titles from test( calls, also from test.fixme(', () => {
    expect(titles("test('A01 one', async () => {});\n  test.fixme(\"V02 two\", () => {});\n// test('A03 no')")).toEqual(['A01 one', 'V02 two']);
  });
});
