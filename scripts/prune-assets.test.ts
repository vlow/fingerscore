// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'deploy', 'prune-assets.sh');
const DAY = 24 * 60 * 60;
let base: string;
let site: string;
let releases: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'prune-'));
  site = join(base, 'site');
  releases = join(base, 'releases');
  mkdirSync(join(site, 'assets'), { recursive: true });
  mkdirSync(releases);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const ago = (days: number) => Date.now() / 1000 - days * DAY;
function asset(name: string, daysOld = 0) {
  const f = join(site, 'assets', name);
  writeFileSync(f, name);
  utimesSync(f, ago(daysOld), ago(daysOld));
}
function release(stamp: string, daysOld: number, files: string[]) {
  const f = join(releases, `${stamp}.txt`);
  writeFileSync(f, files.map(x => `assets/${x}\n`).join(''));
  utimesSync(f, ago(daysOld), ago(daysOld));
}
const run = (...args: string[]) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8' });
const has = (name: string) => existsSync(join(site, 'assets', name));

it('deletes a file only an old release names', () => {
  asset('old.js'); asset('new.js');
  release('20260101T000000Z', 40, ['old.js']);
  release('20261126T000000Z', 0, ['new.js']);
  const r = run(site, releases);
  expect(r.status).toBe(0);
  expect(has('old.js')).toBe(false);
  expect(has('new.js')).toBe(true);
  expect(existsSync(join(releases, '20260101T000000Z.txt'))).toBe(false);
  expect(r.stdout).toContain('assets/old.js');
});

it('keeps an old file the newest release names', () => {
  asset('vendor-x.js', 200);
  release('20261126T000000Z', 0, ['vendor-x.js']);
  run(site, releases);
  expect(has('vendor-x.js')).toBe(true);
});

it('keeps a file a release of the last 30 days names', () => {
  asset('mid.js'); asset('new.js');
  release('20261116T000000Z', 10, ['mid.js']);
  release('20261126T000000Z', 0, ['new.js']);
  run(site, releases);
  expect(has('mid.js')).toBe(true);
});

it('keeps the newest list even when it is old', () => {
  asset('only.js');
  release('20260801T000000Z', 90, ['only.js']);
  run(site, releases);
  expect(has('only.js')).toBe(true);
  expect(existsSync(join(releases, '20260801T000000Z.txt'))).toBe(true);
});

it('--dry-run deletes nothing', () => {
  asset('old.js'); asset('new.js');
  release('20260101T000000Z', 40, ['old.js']);
  release('20261126T000000Z', 0, ['new.js']);
  const r = run('--dry-run', site, releases);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain('assets/old.js');
  expect(has('old.js')).toBe(true);
  expect(existsSync(join(releases, '20260101T000000Z.txt'))).toBe(true);
});

it('refuses a site root without assets/', () => {
  const r = run(join(base, 'nowhere'), releases);
  expect(r.status).toBe(2);
});

it('refuses to run without any release list', () => {
  asset('a.js');
  const r = run(site, releases);
  expect(r.status).toBe(2);
  expect(has('a.js')).toBe(true);
});
