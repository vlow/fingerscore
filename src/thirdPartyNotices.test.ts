import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
const notices = read('THIRD-PARTY-NOTICES.md');

describe('third-party notices', () => {
  it('name every runtime dependency in package.json', () => {
    const missing = Object.keys(pkg.dependencies).filter(name => !notices.includes(`## ${name} `));
    expect(missing, 'add these packages to THIRD-PARTY-NOTICES.md and public/third-party-notices.txt').toEqual([]);
  });
  it('name the two fonts', () => {
    expect(notices).toContain('## @fontsource/atkinson-hyperlegible ');
    expect(notices).toContain('## @fontsource/bravura ');
  });
  it('are served with the app unchanged', () => {
    expect(read('public/third-party-notices.txt')).toBe(notices);
  });
});
