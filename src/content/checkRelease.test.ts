// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'check-release-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A self-contained details module: the script reads its `operator` export. */
function details(name: string, override = ''): string {
  const file = join(dir, `${name.replace(/\W/g, '')}${override.replace(/\W/g, '')}.mts`);
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
  ...{ ${override} },
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

  it('reports a field the module leaves out', () => {
    const file = join(dir, 'partial.mts');
    writeFileSync(file, "export const operator = { name: 'Test Person' };\n");
    const r = run(file);
    expect(r.code).toBe(1);
    expect(r.out).toContain('check:release: missing or empty: email');
  });

  it('reports a required field that is empty or blank, and an empty list', () => {
    const r = run(details('Test Person', "name: '', email: '   ', story: []"));
    expect(r.code).toBe(1);
    expect(r.out).toContain('check:release: missing or empty: name');
    expect(r.out).toContain('check:release: missing or empty: email');
    expect(r.out).toContain('check:release: missing or empty: story');
  });

  it('reports a field of the wrong type', () => {
    const r = run(details('Test Person', 'phone: 5, address: "1 Test Street"'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('check:release: wrong type: phone');
    expect(r.out).toContain('check:release: wrong type: address');
  });

  it('accepts an empty optional field', () => {
    expect(run(details('Test Person', "pullQuote: ''")).code).toBe(0);
  });

  it('reports a module without an operator export', () => {
    const file = join(dir, 'none.mts');
    writeFileSync(file, 'export const other = 1;\n');
    const r = run(file);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`check:release: ${file} exports no operator.`);
    expect(r.out).not.toContain('TypeError');
  });
});
