// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'check-release-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A self-contained details module: the script reads its `operator` export. */
function details(name: string): string {
  const file = join(dir, `${name.replace(/\W/g, '')}.mts`);
  writeFileSync(
    file,
    `export const operator = {
  name: ${JSON.stringify(name)},
  address: ['1 Test Street', '12345 Testville', 'Testland'],
  email: 'test@example.org',
  phone: '+00 000 0000',
  representedBy: '',
  register: '',
  vatId: '',
  responsibleForContent: 'Test Person, 1 Test Street, 12345 Testville',
  hostName: 'Test Host',
  hostAddress: '2 Test Street, 12345 Testville',
  logRetention: '7 days',
  repositoryUrl: '',
  aboutLead: 'A test lead.',
  authorBio: 'A test bio.',
  story: ['A test paragraph.'],
  pullQuote: '',
};
`,
  );
  return file;
}

function run(...args: string[]) {
  const r = spawnSync('node_modules/.bin/tsx', ['scripts/check-release.ts', ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

// Each case starts a child process; under a full parallel run that takes longer than the default 5 s.
describe('scripts/check-release.ts', { timeout: 30_000 }, () => {
  it('exits 1 and names the field when a value is a placeholder', () => {
    const r = run(details('TODO: name'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('check:release: still a placeholder: name');
  });

  it('exits 0 when every value is filled in', () => {
    const r = run(details('Test Person'));
    expect(r.out).toContain("check:release: the owner's details are filled in.");
    expect(r.code).toBe(0);
  });

  it('exits 1 on the committed details file', () => {
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('check:release: still a placeholder: name');
  });
});
