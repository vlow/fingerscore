import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
const list = JSON.parse(read('third-party-packages.json')) as { name: string; version: string; license: string }[];
const notices = read('THIRD-PARTY-NOTICES.md');
const headings = [...notices.matchAll(/^## (.+)$/gm)].map(m => m[1]!);

// Packages a build plugin replaces with an empty module (vite.config.ts). The app ships none of their code, so they need no notice.
const STUBBED = new Set<string>([]);

describe('third-party notices', () => {
  it('have a section for every package in the build', () => {
    const missing = list.filter(p => !headings.includes(`${p.name} ${p.version}`)).map(p => `${p.name} ${p.version}`);
    expect(missing, 'add these packages to THIRD-PARTY-NOTICES.md and public/third-party-notices.txt').toEqual([]);
  });
  it('have no section for a package that is not in the build', () => {
    const known = new Set(list.map(p => `${p.name} ${p.version}`));
    expect(headings.filter(h => !known.has(h)), 'remove these sections, or run npm run notices').toEqual([]);
  });
  it('cover every runtime dependency in package.json', () => {
    const inList = new Set(list.map(p => p.name));
    const missing = Object.keys(pkg.dependencies).filter(name => !inList.has(name) && !STUBBED.has(name));
    expect(missing, 'run npm run notices').toEqual([]);
  });
  it('name the two fonts', () => {
    expect(notices).toContain('## @fontsource/atkinson-hyperlegible ');
    expect(notices).toContain('## @fontsource/bravura ');
  });
  it('are served with the app unchanged', () => {
    expect(read('public/third-party-notices.txt')).toBe(notices);
  });
});
